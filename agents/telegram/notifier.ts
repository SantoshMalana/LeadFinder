import { Telegraf } from 'telegraf'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export async function sendDailySummary() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[Notifier] Missing Telegram Bot Token or Chat ID. Skipping summary.')
    return
  }

  const bot = new Telegraf(TELEGRAM_BOT_TOKEN)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString()

  console.log('[Notifier] Aggregating daily stats...')

  try {
    // Fetch all profiles to send summaries to all active users
    // For now, we just assume single user / single chat ID from .env for simplicity
    
    // Get applied jobs today
    const { data: appliedJobs, error: err1 } = await supabase
      .from('jobs')
      .select('title, company, source')
      .gte('applied_at', todayIso)
      .limit(100)

    if (err1) throw err1

    // Get new replies/interviews today
    const { data: replies, error: err2 } = await supabase
      .from('jobs')
      .select('title, company')
      .eq('status', 'interview_requested')
      .gte('updated_at', todayIso)

    if (err2) throw err2

    const appliedCount = appliedJobs?.length || 0
    const replyCount = replies?.length || 0

    let message = `📊 *LeadFinder Daily Summary*\n\n`
    message += `You had a busy day! Here's what your agents accomplished:\n\n`
    message += `✅ *Applications Sent:* ${appliedCount}\n`
    message += `📬 *New Replies/Interviews:* ${replyCount}\n\n`

    if (appliedCount > 0) {
      message += `*Top Recent Applications:*\n`
      appliedJobs?.slice(0, 5).forEach((j: any) => {
        message += `- ${j.title} at ${j.company} (${j.source})\n`
      })
    }

    if (replyCount > 0) {
      message += `\n🎯 *Action Required (Check Inbox):*\n`
      replies?.forEach((r: any) => {
        message += `- Recruiter replied for: ${r.title} at ${r.company}\n`
      })
    }

    await bot.telegram.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' })
    console.log('[Notifier] Daily summary sent successfully to Telegram.')
  } catch (error) {
    console.error('[Notifier] Failed to send daily summary:', error)
  }
}

// If run directly
const isMain = typeof require !== 'undefined' && require.main === module;
if (isMain) {
  sendDailySummary()
}
