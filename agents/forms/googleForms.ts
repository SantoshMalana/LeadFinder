import { chromium, Page } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { Redis } from '@upstash/redis'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GROQ_API_KEY = process.env.GROQ_API_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const redis = Redis.fromEnv()

function log(msg: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`
  console.log(line)
  redis.lpush('agent_logs', line).catch(() => {})
  redis.ltrim('agent_logs', 0, 100).catch(() => {})
}

import { ParsedCV } from '../../types'

async function randomDelay(min: number, max: number) {
  const ms = Math.floor(Math.random() * (max - min + 1) + min)
  await new Promise(res => setTimeout(res, ms))
}

async function humanType(page: Page, selector: string, text: string) {
  await page.focus(selector)
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.floor(Math.random() * 100) + 50 }) // 50-150ms delay
  }
}

async function getAnswersFromGroq(cv: ParsedCV, questions: string[]): Promise<Record<string, string>> {
  const prompt = `
You are filling out a Google Form job application for a candidate.
Answer the following questions based exactly on their CV. 
Be concise. Do not add fluff. If the question asks for years of experience, just put the number.

Candidate Name: ${cv.name}
Email: ${cv.email}
Phone: ${cv.phone}
LinkedIn: ${cv.linkedin_url}
Portfolio: ${cv.portfolio_url}
Experience Highlights: ${cv.experience[0]?.highlights?.join(' ')}

Questions to answer:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Return ONLY a valid JSON object where the keys are the EXACT question strings, and the values are your answers.
`

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
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
  return {}
}

export async function fillGoogleForm(userId: string, formUrl: string) {
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  log(`📋 Google Forms Agent Triggered!`)
  log(`   URL: ${formUrl}`)
  log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

  const { data: profile } = await supabase.from('profiles').select('parsed_data').eq('user_id', userId).single()
  if (!profile?.parsed_data) {
    log(`❌ Error: User CV not found in database.`)
    return
  }

  log(`🌐 Launching stealth browser...`)
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()

  try {
    log(`📄 Opening form...`)
    await page.goto(formUrl, { waitUntil: 'networkidle' })
    await randomDelay(2000, 4000)

    // Scroll randomly to read
    log(`👀 Scanning form questions (human scroll simulation)...`)
    await page.mouse.wheel(0, 500)
    await randomDelay(1000, 2000)
    await page.mouse.wheel(0, -300)
    await randomDelay(1000, 2000)

    // Extract questions and their input boxes
    // In Google Forms, the container usually has role="listitem"
    const questionsData = await page.$$eval('div[role="listitem"]', items => {
      return items.map((item, index) => {
        // The text is usually in a div with role="heading" or similar.
        const titleEl = item.querySelector('div[role="heading"]')
        const textInput = item.querySelector('input[type="text"], input[type="email"], textarea')
        
        if (titleEl && textInput) {
          // Add a unique ID to the input so we can select it easily later
          const id = `gform-input-${index}`
          textInput.setAttribute('id', id)
          
          let titleText = titleEl.textContent || ''
          titleText = titleText.replace(/\*$/, '').trim() // Remove required asterisks
          
          return { id, title: titleText }
        }
        return null
      }).filter(i => i !== null)
    })

    if (questionsData.length === 0) {
      log(`⚠️ Could not parse any standard text questions on this form.`)
      await browser.close()
      return
    }

    log(`🧠 Found ${questionsData.length} questions. Asking Groq AI for perfect answers...`)
    const questionStrings = questionsData.map(q => q!.title)
    const answers = await getAnswersFromGroq(profile.parsed_data, questionStrings)

    for (const q of questionsData) {
      if (!q) continue
      const answer = answers[q.title]
      if (answer) {
        log(`   ✍️ Typing answer for: "${q.title.substring(0, 30)}..."`)
        await humanType(page, `#${q.id}`, answer)
        await randomDelay(500, 1500) // Pause between questions
      }
    }

    log(`🚀 All questions answered! Preparing to submit...`)
    await randomDelay(2000, 4000)
    
    const submitBtn = await page.$('div[role="button"]:has-text("Submit")')
    if (submitBtn) {
      await submitBtn.click() 
      log(`🎯 SUCCESS! Form filled and submitted.`)
    } else {
      log(`⚠️ Submit button not found. You might need to manually click submit.`)
    }

    // Wait a bit to let the user see it before closing
    await randomDelay(5000, 7000)

  } catch (error) {
    log(`🚨 Error filling Google Form: ${(error as any).message}`)
  } finally {
    log(`🧹 Closing browser...`)
    await browser.close()
  }
}

// If run directly for testing:
const isMain = typeof require !== 'undefined' && require.main === module;
if (isMain) {
  const userId = process.argv[2]
  const targetUrl = process.argv[3]
  if (userId && targetUrl) {
    fillGoogleForm(userId, targetUrl)
  } else {
    console.log("Usage: npx tsx agents/forms/googleForms.ts <userId> <googleFormUrl>")
  }
}
