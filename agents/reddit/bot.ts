import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'
import { getRandomGroqKey } from '../../lib/aiKeys'

const REDDIT_USER = process.env.REDDIT_USERNAME || ''
const REDDIT_PASS = process.env.REDDIT_PASSWORD || ''
const USER_ID = process.argv[2] || process.env.AUTOAPPLY_USER_ID || ''

let redis: Redis
try {
  redis = Redis.fromEnv()
} catch (e) {
  console.log('Redis config missing')
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function log(msg: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`
  console.log(line)
  if (redis) {
    redis.lpush(`agent_logs:${USER_ID}`, line).catch(() => {})
    redis.ltrim(`agent_logs:${USER_ID}`, 0, 499).catch(() => {})
  }
}

if (!REDDIT_USER || !REDDIT_PASS || !USER_ID) {
  log('❌ Reddit credentials or USER_ID missing.')
  process.exit(1)
}

const SUBREDDITS = ['forhire', 'freelance', 'reactjs']
const KEYWORDS = ['hiring', 'looking for', 'need a', 'developer', 'react', 'nextjs', 'full stack']

// Redis-backed rate limiting
const COOLDOWN_KEY = `reddit_cooldown:${USER_ID}`
const DAILY_COUNT_KEY = `reddit_daily_count:${USER_ID}`
const SEEN_POSTS_KEY = `reddit_seen:${USER_ID}`
const LEADS_QUEUE_KEY = `reddit_leads_queue:${USER_ID}`

async function canComment(): Promise<boolean> {
  const isCooldown = await redis.get(COOLDOWN_KEY)
  if (isCooldown) return false
  const count = await redis.get<number>(DAILY_COUNT_KEY) || 0
  if (count >= 5) return false
  return true
}

async function markCommented() {
  await redis.set(COOLDOWN_KEY, '1', { px: 10 * 60 * 1000 }) // 10 min
  await redis.incr(DAILY_COUNT_KEY)
  await redis.expire(DAILY_COUNT_KEY, 86400)
}

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

  let retries = 3
  while (retries > 0) {
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
          temperature: 0.1,
          max_tokens: 300,
        })
      })
      if (res.status === 429) {
        retries--
        if (retries === 0) return { is_lead: false, score: 0 }
        log(`⚠️ Rate limited by Groq. Retrying in 5s...`)
        await new Promise(r => setTimeout(r, 5000))
        continue
      }
      if (!res.ok) return { is_lead: false, score: 0 }
      const data = await res.json()
      let content = data.choices?.[0]?.message?.content
      if (!content) return { is_lead: false, score: 0 }
      content = content.replace(/^```json/, '').replace(/```$/, '').trim()
      return JSON.parse(content)
    } catch (err) {
      return { is_lead: false, score: 0 }
    }
  }
  return { is_lead: false, score: 0 }
}

async function startRedditAgent() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log('🚀 Reddit Lead Generator Started (Playwright)')
  log(`   User: ${REDDIT_USER}`)
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const userDataDir = path.join(process.cwd(), '.leadfinder', 'reddit-profile')

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

      // --- PHASE 1: DISCOVERY ---
      for (const sub of SUBREDDITS) {
        log(`🔍 Scanning r/${sub}...`)
        try {
          await page.goto(`https://www.reddit.com/r/${sub}/new/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await page.waitForTimeout(3000)

          const posts = await page.$$eval('a[slot="full-post-link"]', (links: any) => 
            links.map((l: any) => ({ url: l.href, id: l.href }))
          )

          for (const post of posts.slice(0, 5)) {
            const isSeen = await redis.sismember(SEEN_POSTS_KEY, post.id)
            if (isSeen) continue
            
            const { data: existingJob } = await supabase.from('jobs').select('id').eq('user_id', USER_ID).eq('job_url', post.url).limit(1)
            if (existingJob && existingJob.length > 0) {
               await redis.sadd(SEEN_POSTS_KEY, post.id)
               continue
            }
            await redis.sadd(SEEN_POSTS_KEY, post.id)

            await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
            await page.waitForTimeout(2000)
            
            const title = await page.title()
            const textContent = await page.evaluate(() => {
              const postEl = document.querySelector('[data-test-id="post-content"], .Post, article, [slot="text-body"]')
              return postEl?.textContent || ''
            })
            
            const isMatch = KEYWORDS.some(kw => title.toLowerCase().includes(kw) || textContent.toLowerCase().includes(kw))
            if (!isMatch) continue

            log(`🔎 Analyzing post: "${title.substring(0, 50)}..."`)
            const analysis = await scoreLeadWithAI(title + '\n' + textContent.substring(0, 1000))

            if (analysis.is_lead && analysis.score >= 6) {
              log(`   🎯 LEAD FOUND! (Score: ${analysis.score}/10)`)
              log(`   📌 ${analysis.summary}`)
              
              // Queue for interaction instead of commenting immediately
              await redis.rpush(LEADS_QUEUE_KEY, JSON.stringify({ post, analysis, textContent }))
              log(`   📥 Queued lead for interaction phase.`)
            }
          }
        } catch (err: any) {
          log(`⚠️ Error scanning r/${sub}: ${err.message}`)
        }
      }

      // --- PHASE 2: INTERACTION ---
      log('🤖 Processing Interaction Queue...')
      while (true) {
        if (!(await canComment())) {
          log(`⏳ Rate limit reached. Stopping interaction phase for now.`)
          break
        }

        const raw = await redis.lpop<string>(LEADS_QUEUE_KEY)
        if (!raw) break // queue empty

        let queuedLead: any
        try { queuedLead = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { continue }

        const { post, analysis, textContent } = queuedLead
        
        try {
          await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await page.waitForTimeout(2000)

          log(`   ✍️ Writing reply to ${post.url}...`)
          const commentBox = await page.$('shreddit-composer div[contenteditable="true"], div[contenteditable="true"][role="textbox"]')
          if (commentBox) {
            await commentBox.click()
            await page.keyboard.type(analysis.reply_draft, { delay: 50 })
            const submitBtn = await page.$('button[type="submit"]:has-text("Comment"), shreddit-composer button[slot="submit-button"]')
            if (submitBtn) {
              await submitBtn.click()
              await markCommented()
              const count = await redis.get(DAILY_COUNT_KEY)
              log(`   ✅ Replied! (${count}/5 today)`)
            }

            await supabase.from('jobs').insert({
              user_id: USER_ID,
              source: 'reddit',
              source_id: `reddit_${post.id}`,
              company: 'Reddit Lead',
              title: analysis.summary?.substring(0, 100) || 'Reddit Opportunity',
              description: textContent.substring(0, 3000),
              job_url: post.url,
              match_score: analysis.score,
              match_reason: analysis.summary,
              status: 'applied',
              applied_at: new Date().toISOString(),
              discovered_at: new Date().toISOString(),
            })
          } else {
            log(`   ⚠️ Comment box not found (Thread locked?)`)
          }
        } catch (replyErr: any) {
          log(`   ⚠️ Failed to reply: ${replyErr.message}`)
          // Optionally push back to queue on error, but we'll skip to avoid infinite loops
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

startRedditAgent().catch(e => console.error(e))

process.on('SIGINT', () => {
  log('Shutting down Reddit Agent...')
  process.exit(0)
})
