import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import { spawn, ChildProcess } from 'child_process'
import treeKill from 'tree-kill'
import * as cron from 'node-cron'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { validateEnv } from '../lib/validateEnv'
import { Redis } from '@upstash/redis'
import { isAgentAlive } from '../lib/heartbeat'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

validateEnv('daemon')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const redis = Redis.fromEnv()

// Map to keep track of running processes per user
const activeAgents: Record<string, ChildProcess[]> = {}
// Map to keep track of pending restart timeouts per user
const pendingRestarts: Record<string, NodeJS.Timeout[]> = {}

function startAgentsForUser(userId: string) {
  if (activeAgents[userId]) {
    console.log(`[Daemon] Agents already running for user ${userId}`)
    return
  }

  console.log(`[Daemon] Starting agents for user ${userId}...`)
  
  const processes: ChildProcess[] = []

  const spawnAgent = (name: string, cmd: string, args: string[]) => {
    const p = spawn(cmd, args, { 
      stdio: 'inherit', 
      shell: true,
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=512',
      }
    })
    
    // Kill after max runtime (6 hours) to force fresh session
    const maxRuntime = 6 * 60 * 60 * 1000
    const killTimer = setTimeout(() => {
      if (!p.killed && p.pid) {
        console.log(`[Daemon] Max runtime reached for ${name} — killing for fresh restart`)
        treeKill(p.pid, 'SIGTERM')
      }
    }, maxRuntime)
    
    p.on('error', (err) => console.error(`[Daemon] ${name} error:`, err))
    p.on('exit', (code) => {
      clearTimeout(killTimer)
      console.log(`[Daemon] ${name} exited with code ${code}`)
      
      // Prevent PID reuse by removing from active array immediately
      if (activeAgents[userId]) {
        activeAgents[userId] = activeAgents[userId].filter(proc => proc !== p)
      }

      if (code !== 0 && code !== null && activeAgents[userId]) {
        console.log(`[Daemon] Restarting crashed ${name} in 10s...`)
        const timeoutId = setTimeout(() => {
          if (pendingRestarts[userId]) {
            pendingRestarts[userId] = pendingRestarts[userId].filter(t => t !== timeoutId)
          }
          if (activeAgents[userId]) {
            const newP = spawnAgent(name, cmd, args)
            activeAgents[userId].push(newP)
          }
        }, 10000)
        if (!pendingRestarts[userId]) pendingRestarts[userId] = []
        pendingRestarts[userId].push(timeoutId)
      }
    })
    return p
  }

  activeAgents[userId] = []
  
  const linkedIn = spawnAgent('LinkedIn', 'npx', ['tsx', 'agents/runner.ts', userId])
  activeAgents[userId].push(linkedIn)

  const reddit = spawnAgent('Reddit', 'npx', ['tsx', 'agents/reddit/bot.ts', userId])
  activeAgents[userId].push(reddit)

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
  const telegram = spawnAgent('Telegram', pythonCmd, ['agents/telegram/scraper.py', userId])
  activeAgents[userId].push(telegram)

  console.log(`[Daemon] All 3 agents spawned for user ${userId}`)
}

function stopAgentsForUser(userId: string) {
  if (pendingRestarts[userId]) {
    for (const tid of pendingRestarts[userId]) clearTimeout(tid)
    delete pendingRestarts[userId]
  }

  const processes = activeAgents[userId]
  if (!processes) {
    console.log(`[Daemon] No active agents found to stop for user ${userId}`)
    return
  }

  console.log(`[Daemon] Stopping agents for user ${userId}...`)
  
  for (const p of processes) {
    if (!p.killed && p.pid) {
      treeKill(p.pid, 'SIGTERM', (err) => {
        if (err) console.error(`[Daemon] Failed to kill PID ${p.pid}:`, err)
      })
    }
  }

  delete activeAgents[userId]
  console.log(`[Daemon] Agents stopped for user ${userId}`)
}

async function watchProfiles() {
  let channel: RealtimeChannel

  const resubscribe = () => {
    if (channel) supabase.removeChannel(channel)

    channel = supabase
      .channel('profiles-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const { user_id, autoapply_running } = payload.new as any
          const isRunningLocally = !!activeAgents[user_id]

          if (autoapply_running && !isRunningLocally) {
            console.log(`[Realtime] START signal for ${user_id}`)
            startAgentsForUser(user_id)
          } else if (!autoapply_running && isRunningLocally) {
            console.log(`[Realtime] STOP signal for ${user_id}`)
            stopAgentsForUser(user_id)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Channel error — resubscribing in 5s')
          setTimeout(resubscribe, 5_000)
        }
      })
  }

  resubscribe()
}

async function initDaemon() {
  console.log('🚀 Daemon starting...')

  // Wait for DB to be ready
  let currentProfiles: any[] = []
  while (true) {
    try {
      const { data, error } = await supabase.from('profiles').select('user_id, autoapply_running')
      if (error) throw error
      currentProfiles = data || []
      break
    } catch (err) {
      console.error('[Daemon] Failed to fetch profiles. Retrying in 5s...', err)
      await new Promise(r => setTimeout(r, 5000))
    }
  }

  // 1. Initial Start
  for (const p of currentProfiles) {
    if (p.autoapply_running) {
      startAgentsForUser(p.user_id)
    }
  }

  // 2. Realtime listener replacing interval polling
  watchProfiles()

  // 3. Schedule Background Cron Jobs
  console.log('[Daemon] Scheduling background cron tasks...')

  // Heartbeat checker
  cron.schedule('*/5 * * * *', async () => {
    for (const [userId, processes] of Object.entries(activeAgents)) {
      const agents = ['linkedin', 'reddit', 'telegram']
      for (const name of agents) {
        const alive = await isAgentAlive(name, userId)
        if (!alive && processes.length > 0) {
          console.log(`[Health] ${name} agent for ${userId} is STUCK — killing and restarting`)
          stopAgentsForUser(userId)
          startAgentsForUser(userId)
          break
        }
      }
    }
  })

  // Task queue worker (for Telegram mailer/forms)
  cron.schedule('*/2 * * * *', async () => {
    for (const userId of Object.keys(activeAgents)) {
      const taskStr = await redis.rpop<string>(`task_queue:${userId}`)
      if (!taskStr) continue

      const task = typeof taskStr === 'string' ? JSON.parse(taskStr) : taskStr
      const { type, payload } = task
      console.log(`[TaskWorker] Processing ${type} for ${userId}`)

      const pythonCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
      if (type === 'send_cold_email') {
        const p = spawn(pythonCmd, ['tsx', 'agents/email/mailer.ts', userId, payload.target_email, payload.job_id], { stdio: 'inherit', shell: true })
        p.on('error', (err) => console.error(`[TaskWorker] Error running Mailer:`, err))
      } else if (type === 'fill_google_form') {
        const p = spawn(pythonCmd, ['tsx', 'agents/forms/googleForms.ts', userId, payload.form_url], { stdio: 'inherit', shell: true })
        p.on('error', (err) => console.error(`[TaskWorker] Error running GoogleForms:`, err))
      }
    }
  })

  // Scheduled cold emails
  cron.schedule('* * * * *', async () => {
    const now = Date.now()
    const due = await redis.zrange('scheduled_emails', 0, now, { byScore: true, offset: 0, count: 10 })

    for (const taskStr of due) {
      const task = typeof taskStr === 'string' ? JSON.parse(taskStr) : taskStr
      await redis.zrem('scheduled_emails', taskStr as string)
      const pythonCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
      const p = spawn(pythonCmd, ['tsx', 'agents/email/mailer.ts', task.userId, task.targetEmail, task.jobId], { stdio: 'inherit', shell: true })
      p.on('error', (err) => console.error(`[ScheduledEmails] Error running Mailer:`, err))
    }
  })

  let isImapRunning = false
  // Check Gmail for recruiter replies every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    if (isImapRunning) return
    isImapRunning = true
    console.log('[Cron] Running Inbox Tracker...')
    const pythonCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    const proc = spawn(pythonCmd, ['tsx', 'agents/email/imapTracker.ts'], { stdio: 'inherit', shell: true })
    
    proc.on('error', (err) => console.error('[Cron] Failed to spawn IMAP tracker:', err))
    proc.on('exit', () => { isImapRunning = false })
  })

  let isNotifierRunning = false
  // Send Daily Telegram Summary at 9:00 PM
  cron.schedule('0 21 * * *', () => {
    if (isNotifierRunning) return
    isNotifierRunning = true
    console.log('[Cron] Sending Daily Summary...')
    const pythonCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    const proc = spawn(pythonCmd, ['tsx', 'agents/telegram/notifier.ts'], { stdio: 'inherit', shell: true })
    
    proc.on('error', (err) => console.error('[Cron] Failed to spawn notifier:', err))
    proc.on('exit', () => { isNotifierRunning = false })
  })
}

// Global Exception handlers
process.on('uncaughtException', (err) => {
  console.error('[Daemon] UNCAUGHT EXCEPTION:', err)
})
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Daemon] UNHANDLED REJECTION at:', promise, 'reason:', reason)
})

initDaemon().catch(err => console.error('[Daemon] Init error:', err))

// Handle graceful exit
process.on('SIGINT', () => {
  console.log('\n[Daemon] Shutting down all managed agents...')
  for (const userId of Object.keys(activeAgents)) {
    stopAgentsForUser(userId)
  }
  process.exit(0)
})
