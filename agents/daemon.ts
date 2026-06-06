import { createClient } from '@supabase/supabase-js'
import { spawn, ChildProcess } from 'child_process'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Map to keep track of running processes per user
const activeAgents: Record<string, ChildProcess[]> = {}

function startAgentsForUser(userId: string) {
  if (activeAgents[userId]) {
    console.log(`[Daemon] Agents already running for user ${userId}`)
    return
  }

  console.log(`[Daemon] Starting agents for user ${userId}...`)
  
  const processes: ChildProcess[] = []

  // 1. LinkedIn Runner
  const linkedIn = spawn('npx', ['tsx', 'agents/runner.ts', userId], { stdio: 'inherit', shell: true })
  processes.push(linkedIn)

  // 2. Reddit Bot
  const reddit = spawn('npx', ['tsx', 'agents/reddit/bot.ts', userId], { stdio: 'inherit', shell: true })
  processes.push(reddit)

  // 3. Telegram Scraper
  const telegram = spawn('python', ['agents/telegram/scraper.py', userId], { stdio: 'inherit', shell: true })
  processes.push(telegram)

  activeAgents[userId] = processes
  console.log(`[Daemon] All 3 agents spawned for user ${userId}`)
}

function stopAgentsForUser(userId: string) {
  const processes = activeAgents[userId]
  if (!processes) {
    console.log(`[Daemon] No active agents found to stop for user ${userId}`)
    return
  }

  console.log(`[Daemon] Stopping agents for user ${userId}...`)
  
  for (const p of processes) {
    if (!p.killed) {
      // On Windows, killing the parent shell doesn't always kill children easily, 
      // but for standard graceful exit `p.kill()` works nicely.
      p.kill('SIGINT')
    }
  }

  delete activeAgents[userId]
  console.log(`[Daemon] Agents stopped for user ${userId}`)
}

async function initDaemon() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🤖 Supabase Realtime Daemon Started')
  console.log('Listening for Start/Stop signals from Vercel...')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 1. On startup, check who is supposed to be running
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, autoapply_running')
    .eq('autoapply_running', true)

  if (profiles && profiles.length > 0) {
    console.log(`[Daemon] Found ${profiles.length} users with active agents on startup.`)
    for (const p of profiles) {
      startAgentsForUser(p.user_id)
    }
  }

  // 2. Poll for changes every 3 seconds to guarantee delivery 
  // (Bypasses needing to manually enable Realtime in the Supabase UI)
  setInterval(async () => {
    try {
      const { data: currentProfiles } = await supabase
        .from('profiles')
        .select('user_id, autoapply_running')

      if (!currentProfiles) return

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
    }
  }, 3000)
}

initDaemon()

// Handle graceful exit
process.on('SIGINT', () => {
  console.log('\n[Daemon] Shutting down all managed agents...')
  for (const userId of Object.keys(activeAgents)) {
    stopAgentsForUser(userId)
  }
  process.exit(0)
})
