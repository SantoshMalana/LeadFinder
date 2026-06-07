import * as dotenv from 'dotenv'
import * as path from 'path'
import * as imaps from 'imap-simple'
import { simpleParser } from 'mailparser'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GMAIL_USER = process.env.GMAIL_USER!
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD!

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export async function checkInboxForReplies() {
  console.log('[IMAP] Checking inbox for recruiter replies...')

  const config = {
    imap: {
      user: GMAIL_USER,
      password: GMAIL_PASS.replace(/\s+/g, ''), // Ensure no spaces
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      authTimeout: 10000,
    }
  }

  try {
    const connection = await imaps.connect(config)
    await connection.openBox('INBOX')

    // Fetch unread emails from the last 3 days
    const searchCriteria = ['UNSEEN', ['SINCE', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()]]
    const fetchOptions = { bodies: ['HEADER', 'TEXT'], struct: true, markSeen: false }

    const messages = await connection.search(searchCriteria, fetchOptions)
    console.log(`[IMAP] Found ${messages.length} unread emails.`)

    for (const item of messages) {
      const all = item.parts.find(part => part.which === 'TEXT') || item.parts.find(part => part.which === 'HEADER')
      if (!all || !all.body) continue

      const mail = await simpleParser(all.body)
      const fromAddress = mail.from?.value[0]?.address
      const subject = mail.subject

      if (!fromAddress) continue

      // Check if this sender exists in our Supabase jobs as a cold email lead
      const { data: leads } = await supabase
        .from('jobs')
        .select('id, user_id, title, company, status')
        .eq('source', 'email')
        .ilike('company', `%${fromAddress}%`) // In mailer.ts, we used targetEmail as company
        .limit(1)

      if (leads && leads.length > 0) {
        const lead = leads[0]
        console.log(`🎉 [IMAP] Match found! Recruiter ${fromAddress} replied to "${lead.title}".`)
        
        // Update job status to 'interview_requested'
        await supabase
          .from('jobs')
          .update({ status: 'interview_requested', updated_at: new Date().toISOString() })
          .eq('id', lead.id)

        console.log(`   ✅ Status updated in dashboard.`)
        
        // Mark as read so we don't process it again
        await connection.addFlags(item.attributes.uid, '\\Seen')
      }
    }

    connection.end()
    console.log('[IMAP] Inbox check complete.')
  } catch (err) {
    console.error('[IMAP] Error checking inbox:', err)
  }
}

// If run directly
const isMain = typeof require !== 'undefined' && require.main === module;
if (isMain) {
  checkInboxForReplies()
}
