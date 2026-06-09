import { createClient } from '@supabase/supabase-js'
import { spawn, ChildProcess } from 'child_process'
import treeKill from 'tree-kill'
import * as cron from 'node-cron'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[Daemon] Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

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
    const p = spawn(cmd, args, { stdio: 'inherit', shell: true })
    p.on('error', (err) => console.error(`[Daemon] ${name} error:`, err))
    p.on('exit', (code) => {
      console.log(`[Daemon] ${name} exited with code ${code}`)
      
      // Prevent PID reuse by removing from active array immediately
      if (activeAgents[userId]) {
        activeAgents[userId] = activeAgents[userId].filter(proc => proc !== p)
      }

      if (code !== 0 && code !== null && activeAgents[userId]) {
        console.log(`[Daemon] Restarting crashed ${name} in 10s...`)
        const timeoutId = setTimeout(() => {
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

  // 2. Poll for changes every 3 seconds to guarantee delivery 
  let isPolling = false
  setInterval(async () => {
    if (isPolling) return
    isPolling = true
    try {
      const { data: currentProfiles } = await supabase
        .from('profiles')
        .select('user_id, autoapply_running')

      if (!currentProfiles) return

      const currentProfileIds = new Set(currentProfiles.map(p => p.user_id))

      // Check if any running agents belong to deleted users
      for (const userId of Object.keys(activeAgents)) {
        if (!currentProfileIds.has(userId)) {
          console.log(`[Daemon] User ${userId} not found in DB. Stopping zombie agents...`)
          stopAgentsForUser(userId)
        }
      }

      for (const p of currentProfiles) {
        const isRunningInDb = p.autoapply_running
        const isRunningLocally = !!activeAgents[p.user_id]

        if (isRunningInDb && !isRunningLocally) {
          console.log(`[Daemon] Detected START signal for user ${p.user_id}`)
          startAgentsForUser(p.user_id)
        } else if (!isRunningInDb && isRunningLocally) {
          console.log(`[Daemon] Detected STOP signal for user ${p.user_id}`)
          stopAgentsForUser(p.user_id)
        }
      }
    } catch (err) {
      console.error('[Daemon] Polling error:', err)
    } finally {
      isPolling = false
    }
  }, 3000)

  // 3. Schedule Background Cron Jobs
  console.log('[Daemon] Scheduling background cron tasks...')

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
