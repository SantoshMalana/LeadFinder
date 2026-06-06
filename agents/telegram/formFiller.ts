import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ''

async function fillUniversalForm(url: string, userId: string) {
  console.log(`\n🚀 Starting Universal Form Filler for: ${url}`)
  
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    console.log(`✅ Loaded ${url}`)
    
    // Find all visible text inputs and textareas
    const inputs = await page.$$('input[type="text"], input[type="email"], input[type="tel"], textarea')
    
    for (const input of inputs) {
      const isVisible = await input.isVisible()
      if (!isVisible) continue

      // Try to get the label or placeholder to know what this field is asking for
      const placeholder = await input.getAttribute('placeholder') || ''
      const name = await input.getAttribute('name') || ''
      const id = await input.getAttribute('id') || ''
      
      let labelText = ''
      if (id) {
        const label = await page.$(`label[for="${id}"]`)
        if (label) {
          labelText = await label.innerText()
        }
      }

      const questionContext = `${labelText} ${placeholder} ${name}`.trim()
      if (!questionContext || questionContext.length < 3) continue

      console.log(`🤖 AI Answering: "${questionContext}"`)

      // Ask AI for the answer with a 15-second timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      try {
        const res = await fetch(`${APP_URL}/api/generate/answer`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-api-key': INTERNAL_API_KEY
          },
          body: JSON.stringify({
            question: questionContext,
            user_id: userId
          }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (res.ok) {
          const data = await res.json()
          if (data.answer) {
            console.log(`   👉 Filled: ${data.answer.substring(0, 50)}...`)
            await input.fill(data.answer)
          }
        } else {
          console.error(`   ⚠️ API returned ${res.status}: ${await res.text()}`)
        }
      } catch (fetchErr: any) {
        if (fetchErr.name === 'AbortError') {
          console.error(`   ⚠️ API request timed out after 15s`)
        } else {
          console.error(`   ⚠️ API request failed: ${fetchErr.message}`)
        }
      }
    }

    // Attempt to find a submit button
    const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply")')
    if (submitBtn) {
      console.log('✅ Found submit button. Simulating click...')
      // Uncomment to actually submit:
      // await submitBtn.click()
    } else {
      console.log('⚠️ Could not find a clear Submit button.')
    }

  } catch (err: any) {
    console.error(`❌ Error filling form: ${err.message}`)
  } finally {
    console.log('⏳ Waiting 5 seconds before closing...')
    await page.waitForTimeout(5000)
    await browser.close()
  }
}

const targetUrl = process.argv[2]
const userId = process.argv[3]

if (!targetUrl || !userId) {
  console.log('Usage: npx ts-node agents/telegram/formFiller.ts <URL> <USER_ID>')
  process.exit(1)
}

fillUniversalForm(targetUrl, userId)
