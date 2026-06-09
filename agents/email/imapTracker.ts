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

      // Extract domain from the sender address (e.g. recruiter@google.com → google.com)
      const domain = fromAddress.split('@')[1]
      if (!domain) continue

      // Match against reply_to_email column stored during job insert
      const { data: leads } = await supabase
        .from('jobs')
        .select('id, user_id, title, company, status')
        .eq('source', 'email')
        .eq('reply_to_email', fromAddress) // exact match first
        .limit(1)

      // Fallback: match by domain if no exact match
      const { data: domainLeads } = !leads?.length ? await supabase
        .from('jobs')
        .select('id, user_id, title, company, status')
        .eq('source', 'email')
        .ilike('reply_to_email', `%@${domain}`)
        .limit(1) : { data: null }

      const matchedLead = leads?.[0] || domainLeads?.[0]

      if (matchedLead) {
        console.log(`🎉 [IMAP] Match found! Recruiter ${fromAddress} replied to "${matchedLead.title}".`)
        
        // Update job status to valid enum value 'interview'
        await supabase
          .from('jobs')
          .update({ status: 'interview', updated_at: new Date().toISOString() })
          .eq('id', matchedLead.id)

        console.log(`   ✅ Status updated to 'interview' in dashboard.`)
        
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
