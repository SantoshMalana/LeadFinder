import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { Redis } from '@upstash/redis'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GROQ_API_KEY = process.env.GROQ_API_KEY!
const GMAIL_USER = process.env.GMAIL_USER!
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD!

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const redis = Redis.fromEnv()

function log(msg: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`
  console.log(line)
  redis.lpush('agent_logs', line).catch(() => {})
  redis.ltrim('agent_logs', 0, 100).catch(() => {})
}

async function generateColdEmail(cv: any, jobDesc: string): Promise<{ subject: string; body: string }> {
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

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    })
  })

  const data = await res.json()
  let content = data.choices[0].message.content
  content = content.replace(/^```json/, '').replace(/```$/, '').trim()
  return JSON.parse(content)
}

export async function sendColdEmail(userId: string, targetEmail: string, jobDesc: string) {
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

  // 2. Draft Email
  log(`🧠 Using Groq AI to draft the perfect cold email...`)
  const draft = await generateColdEmail(profile.parsed_data, jobDesc)
  log(`✅ Draft complete. Subject: "${draft.subject}"`)

  // 3. Human Delay (Anti-Detect)
  // Random delay between 15 seconds and 45 seconds for testing (In production, 3 to 15 mins)
  const delayMs = Math.floor(Math.random() * (45000 - 15000 + 1) + 15000)
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
    
    // Mark lead as applied in DB (Optional logic here)
    
  } catch (error: any) {
    log(`🚨 Failed to send email: ${error.message}`)
  }
}

// If run directly for testing:
if (require.main === module) {
  const userId = process.argv[2]
  const targetEmail = process.argv[3]
  const jobDesc = process.argv[4] || "Looking for a React developer to build a cool dashboard."
  if (userId && targetEmail) {
    sendColdEmail(userId, targetEmail, jobDesc)
  } else {
    console.log("Usage: npx tsx agents/email/mailer.ts <userId> <targetEmail> <jobDescription>")
  }
}
