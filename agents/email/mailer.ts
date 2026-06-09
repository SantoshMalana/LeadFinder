import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { Redis } from '@upstash/redis'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { getRandomGroqKey } from '../../lib/aiKeys'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GMAIL_USER = process.env.GMAIL_USER!
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD!

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const redis = Redis.fromEnv()

function log(msg: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`
  console.log(line)
  const userId = process.argv[2] || process.env.AUTOAPPLY_USER_ID || 'global'
  redis.lpush(`agent_logs:${userId}`, line).catch(() => {})
  redis.ltrim(`agent_logs:${userId}`, 0, 100).catch(() => {})
}
import { ParsedCV } from '../../types'

async function generateColdEmail(cv: ParsedCV, jobDesc: string): Promise<{ subject: string; body: string }> {
  const prompt = `
You are an expert technical recruiter writing a cold email for a candidate.
Write a highly professional, concise, and persuasive cold email applying for this job.

Candidate Details:
Name: ${cv.name}
Headline: ${cv.headline}
Skills: ${cv.skills.languages.join(', ')}, ${cv.skills.frameworks.join(', ')}
Experience: ${cv.experience[0]?.title} at ${cv.experience[0]?.company}

Job Description / Context from Telegram:
"${jobDesc}"

Requirements:
1. It must sound completely human and natural. Not overly formal or robotic.
2. It must be short (max 4-5 sentences).
3. Mention 1 or 2 relevant skills from the candidate's CV that match the job.
4. End with a polite call to action to review the attached/linked portfolio.

Return ONLY a valid JSON object in this exact format, with no markdown formatting around it:
{
  "subject": "Email Subject Line",
  "body": "The full plain text email body. Use \\n for newlines."
}
`

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getRandomGroqKey()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        })
      })

      if (!res.ok) continue
      const data = await res.json()
      let content = data.choices?.[0]?.message?.content
      if (!content) continue
      content = content.replace(/^```json/, '').replace(/```$/, '').trim()
      return JSON.parse(content)
    } catch {}
  }
  throw new Error('Failed to generate email')
}

export async function sendColdEmail(userId: string, targetEmail: string, jobId: string) {
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  log(`📧 Gmail Agent Triggered for ${targetEmail}`)
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

  if (!GMAIL_USER || !GMAIL_PASS) {
    log(`❌ Error: GMAIL_USER or GMAIL_APP_PASSWORD missing in .env.local`)
    return
  }

  // 1. Fetch User CV
  const { data: profile } = await supabase.from('profiles').select('parsed_data').eq('user_id', userId).single()
  if (!profile?.parsed_data) {
    log(`❌ Error: User CV not found in database.`)
    return
  }

  // Fetch Job details to get the description
  const { data: jobInfo } = await supabase.from('jobs').select('description, status').eq('id', jobId).single()
  if (!jobInfo) {
    log(`❌ Error: Job ${jobId} not found in database.`)
    return
  }

  // Check if we already emailed
  if (jobInfo.status === 'applied') {
    log(`⚠️ Already sent an email to ${targetEmail} for this job. Skipping to prevent spam.`)
    return
  }

  // 2. Draft Email
  log(`🧠 Using Groq AI to draft the perfect cold email...`)
  const draft = await generateColdEmail(profile.parsed_data, jobInfo.description || 'Looking for a developer.')
  log(`✅ Draft complete. Subject: "${draft.subject}"`)

  // 3. Human Delay (Anti-Detect)
  // Random delay between 3 and 15 mins (production logic)
  const delayMs = Math.floor(Math.random() * (900000 - 180000 + 1) + 180000)
  log(`⏳ Simulating human drafting... waiting ${Math.round(delayMs/1000)} seconds before sending.`)
  await new Promise(res => setTimeout(res, delayMs))

  // 4. Send Email
  log(`🚀 Sending email to ${targetEmail} from ${GMAIL_USER}...`)
  
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS,
    },
  })

  try {
    await transporter.sendMail({
      from: `"${profile.parsed_data.name}" <${GMAIL_USER}>`,
      to: targetEmail,
      subject: draft.subject,
      text: draft.body,
    })
    log(`🎯 SUCCESS! Email sent successfully to ${targetEmail}.`)
    
    // Mark lead as applied in DB — also store reply_to_email so IMAP tracker can match
    await supabase.from('jobs').update({
      status: 'applied',
      applied_at: new Date().toISOString(),
      reply_to_email: targetEmail,
    }).eq('id', jobId)
    
  } catch (error) {
    log(`🚨 Failed to send email: ${(error as any).message}`)
  }
}

// If run directly for testing:
const isMain = typeof require !== 'undefined' && require.main === module;
if (isMain) {
  const userId = process.argv[2]
  const targetEmail = process.argv[3]
  const jobId = process.argv[4]
  if (userId && targetEmail && jobId) {
    sendColdEmail(userId, targetEmail, jobId)
  } else {
    console.log("Usage: npx tsx agents/email/mailer.ts <userId> <targetEmail> <jobId>")
  }
}
