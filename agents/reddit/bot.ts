import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { Redis } from '@upstash/redis'

const REDDIT_USER = process.env.REDDIT_USERNAME || ''
const REDDIT_PASS = process.env.REDDIT_PASSWORD || ''
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''

const redis = Redis.fromEnv()

function log(msg: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`
  console.log(line)
  redis.lpush('agent_logs', line).catch(() => {})
  redis.ltrim('agent_logs', 0, 100).catch(() => {})
}

if (!REDDIT_USER || !REDDIT_PASS) {
  log('❌ Reddit credentials missing.')
  process.exit(1)
}

const SUBREDDITS = ['forhire', 'freelance', 'reactjs']
const KEYWORDS = ['hiring', 'looking for', 'need a', 'developer', 'react', 'nextjs', 'full stack']

async function scoreLeadWithAI(postText: string): Promise<any> {
  const prompt = `Analyze this Reddit post and determine if it's someone hiring a freelance developer.
Post:
"""
${postText}
"""
Return JSON only:
{
  "is_lead": boolean,
  "score": number (1-10),
  "summary": string,
  "reply_draft": string (A very short, casual 2-sentence reply offering help as a full-stack dev. No emojis.)
}`

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
        max_tokens: 300,
      })
    })
    const data = await res.json()
    let content = data.choices[0].message.content
    content = content.replace(/^```json/, '').replace(/```$/, '').trim()
    return JSON.parse(content)
  } catch (err) {
    return { is_lead: false, score: 0 }
  }
}

async function startRedditAgent() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log('🚀 Reddit Lead Generator Started (Playwright)')
  log(`   User: ${REDDIT_USER}`)
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const userDataDir = path.join(process.cwd(), '.leadfinder', 'reddit-profile')
  const seenPosts = new Set<string>()

  while (true) {
    let browser: any = null
    try {
      browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: { width: 1280, height: 720 }
      })
      
      const page = await browser.newPage()

      log('🌐 Navigating to Reddit...')
      await page.goto('https://www.reddit.com/login/', { timeout: 30000 })
      
      // Wait to see if we need to log in
      try {
        await page.waitForSelector('input[name="username"]', { timeout: 10000 })
        log('🔑 Logging in...')
        await page.fill('input[name="username"]', REDDIT_USER)
        await page.fill('input[name="password"]', REDDIT_PASS)
        await page.click('button[type="submit"]')
        await page.waitForURL('**/', { timeout: 15000 })
        log('✅ Logged in successfully!')
      } catch (e) {
        log('⏩ Already logged in or login form not found.')
      }

      for (const sub of SUBREDDITS) {
        log(`🔍 Scanning r/${sub}...`)
        try {
          await page.goto(`https://www.reddit.com/r/${sub}/new/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await page.waitForTimeout(3000)

          // Find post links
          const posts = await page.$$eval('a[slot="full-post-link"]', (links: any) => 
            links.map((l: any) => ({ url: l.href, id: l.href }))
          )

          for (const post of posts.slice(0, 5)) { // Check top 5 new posts
            if (seenPosts.has(post.id)) continue
            seenPosts.add(post.id)

            await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
            await page.waitForTimeout(2000)
            
            const title = await page.title()
            const textContent = await page.evaluate(() => document.body.innerText)
            
            const isMatch = KEYWORDS.some(kw => title.toLowerCase().includes(kw) || textContent.toLowerCase().includes(kw))
            if (!isMatch) continue

            log(`🔎 Analyzing post: "${title.substring(0, 50)}..."`)
            const analysis = await scoreLeadWithAI(title + '\n' + textContent.substring(0, 1000))

            if (analysis.is_lead && analysis.score >= 6) {
              log(`   🎯 LEAD FOUND! (Score: ${analysis.score}/10)`)
              log(`   📌 ${analysis.summary}`)
              
              // Try to comment
              try {
                log(`   ✍️ Writing reply...`)
                const commentBox = await page.$('shreddit-composer')
                if (commentBox) {
                  await commentBox.evaluate((el: any) => el.focus())
                  await page.keyboard.type(analysis.reply_draft)
                  await page.waitForTimeout(1000)
                  await page.keyboard.press('Tab')
                  await page.keyboard.press('Enter')
                  log(`   ✅ Automatically replied to thread!`)
                } else {
                  log(`   ⚠️ Comment box not found (Thread locked?)`)
                }
              } catch (replyErr: any) {
                log(`   ⚠️ Failed to reply: ${replyErr.message}`)
              }
            }
          }
        } catch (err: any) {
          log(`⚠️ Error scanning r/${sub}: ${err.message}`)
        }
      }
    } catch (criticalErr: any) {
      log(`🚨 Critical Error in Reddit Bot: ${criticalErr.message}. Restarting browser...`)
    } finally {
      if (browser) {
        log('🧹 Cleaning up browser context...')
        await browser.close().catch(() => {})
      }
    }

    log(`💤 Sleeping for 5 minutes...`)
    await new Promise(res => setTimeout(res, 5 * 60 * 1000))
  }
}

startRedditAgent()
