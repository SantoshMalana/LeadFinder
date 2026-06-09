import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { launchBrowser, getPage, closeBrowser, humanDelay, takeScreenshot } from './linkedin/browser'
import { searchJobs, extractJobListings, getJobDetails } from './linkedin/search'
import { startEasyApply, handleMultiStep } from './linkedin/easyApply'
import { shouldTakeBreak, getBreakDuration, addHumanBehavior, checkForRestriction } from './linkedin/antiDetect'
import type { ParsedCV } from '../types'
import { Redis } from '@upstash/redis'
import { signRequest } from '../lib/sign'
import { selectPersona, applyPersona } from '../lib/persona'
import { createClient } from '@supabase/supabase-js'
import { getBestStrategies } from '../lib/rejection-engine'
import { sendHeartbeat } from '../lib/heartbeat'

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Override console.log to stream to Upstash Redis for the Live Terminal
const originalLog = console.log
const redis = Redis.fromEnv()

const USER_ID = process.argv[2] || process.env.AUTOAPPLY_USER_ID || 'global'
const logKey = `agent_logs:${USER_ID}`

console.log = (...args) => {
  const msg = args.join(' ')
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`
  
  // Stream to Redis in background
  redis.lpush(logKey, line).catch(() => {})
  redis.ltrim(logKey, 0, 499).catch(() => {})
  
  originalLog(...args)
}

interface AgentConfig {
  user_id: string
  max_daily: number
  threshold: number
  roles: string[]
  locations: string[]
  resume_path?: string
}

/**
 * Main AutoApply orchestrator — runs as a separate Node.js process
 */
export async function startAutoApply(config: AgentConfig) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🚀 AutoApply Agent Started')
  console.log(`   User: ${config.user_id}`)
  console.log(`   Daily limit: ${config.max_daily}`)
  console.log(`   Threshold: ${config.threshold}/10`)
  console.log(`   Roles: ${config.roles.join(', ')}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Query how many applications were already made today (survives crash + restart)
  let appliedCount = 0
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count } = await sb
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', config.user_id)
      .eq('status', 'applied')
      .gte('applied_at', todayStart.toISOString())
    appliedCount = count || 0
    if (appliedCount > 0) {
      console.log(`📊 Resuming session: ${appliedCount} applications already made today`)
    }
  } catch { /* fall back to 0 */ }
  
  const sessionKey = `session_actions:${config.user_id}:${new Date().toDateString()}`
  async function incrementActionsCount(): Promise<number> {
    const count = await redis.incr(sessionKey)
    await redis.expire(sessionKey, 86400) // reset at midnight
    return count
  }

  try {
    const ctx = await launchBrowser()

    let cachedProfile: ParsedCV | null = null
    try {
      const { data } = await supabase
        .from('profiles')
        .select('parsed_data')
        .eq('user_id', config.user_id)
        .single()
      cachedProfile = data?.parsed_data || null
    } catch { /* keep null */ }

    // Fetch best strategies
    const { bestPersona, platformMultipliers } = await getBestStrategies(config.user_id)

    // Main loop — search for each role
    for (const role of config.roles) {
      if (appliedCount >= config.max_daily) break
      if (!(await checkShouldContinue(config.user_id))) break

      const page = await ctx.newPage() // Fresh tab per role

      try {
        const location = config.locations[0] || ''
        console.log(`\n🔍 Searching for: "${role}" in "${location}"`)

        // Ensure linkedin is open in the tab
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' })
        await humanDelay(2000, 4000)

        // Check if logged in
        const isLoggedIn = page.url().includes('/feed') || page.url().includes('/jobs') || await page.$('.global-nav__me') !== null
        if (!isLoggedIn) {
            console.log('⚠️  Not logged into LinkedIn. Waiting for manual login...')
            await page.waitForURL('**/feed/**', { timeout: 300_000 }) 
            console.log('✅ LinkedIn login detected!')
        }

        await searchJobs(page, role, location, { easyApply: true, datePosted: '24h' })
        await addHumanBehavior(page)

        const listings = await extractJobListings(page)
        console.log(`📋 Found ${listings.length} listings`)

        for (const listing of listings) {
          if (appliedCount >= config.max_daily) break
          if (!(await checkShouldContinue(config.user_id))) break

          await sendHeartbeat('linkedin', config.user_id)

          // Anti-detection breaks
          const actionsCount = await incrementActionsCount()
          if (shouldTakeBreak(actionsCount)) {
            const breakMs = getBreakDuration()
            console.log(`☕ Taking a ${Math.round(breakMs / 60000)}min break...`)
            await sendHeartbeat('linkedin', config.user_id) // keep heartbeat alive during break
            await new Promise(r => setTimeout(r, breakMs))
          }

          let matchData
          let details: any = {}
          try {
            // Navigate to job directly
            if (listing.job_url) {
              await page.goto(listing.job_url, { waitUntil: 'domcontentloaded' })
              await humanDelay(2000, 4000)
            }

            // Extract details from the currently loaded page (Bug 8 fix)
            details = await page.evaluate(() => {
              const descEl = document.querySelector('.jobs-description__content, .jobs-box__html-content, #job-details')
              const easyApplyBtn = document.querySelector('.jobs-apply-button--top-card, .jobs-apply-button')
              return {
                description: (descEl as HTMLElement)?.innerText?.trim() || '',
                is_easy_apply: !!easyApplyBtn && easyApplyBtn.textContent?.includes('Easy Apply'),
              }
            })

            const effectivePersona = bestPersona ? bestPersona : await selectPersona(listing.title, details.description || '')

            // Score job using internal API (with HMAC)
            const payload = JSON.stringify({
              title: listing.title,
              company: listing.company,
              location: listing.location,
              source: 'linkedin',
              job_url: listing.job_url,
              user_id: config.user_id,
              persona_used: effectivePersona,
              cv_version: (cachedProfile as any)?.last_updated || 'v1',
              description: details.description || ''
            })
            
            const matchRes = await fetch(`${API_BASE}/api/jobs/match`, {
              method: 'POST',
              headers: signRequest(payload),
              body: payload,
            })
            if (!matchRes.ok) throw new Error(`API returned ${matchRes.status}`)
            matchData = await matchRes.json()
            matchData.persona_used = effectivePersona
          } catch (err) {
            console.log(`⚠️ Match error for "${listing.title}":`, err)
            continue
          }

          // Incorporate platform multipliers into threshold
          const multiplier = platformMultipliers['linkedin'] || 1.0
          const adjustedThreshold = config.threshold / multiplier

          if (matchData.score < adjustedThreshold) {
            console.log(`⏭️  Skip: "${listing.title}" at ${listing.company} (score: ${matchData.score} is below adjusted threshold ${adjustedThreshold.toFixed(1)})`)
            continue
          }

          console.log(`\n🎯 Match! "${listing.title}" at ${listing.company} (score: ${matchData.score})`)

          try {
            // Check for restriction
            if (await checkForRestriction(page)) {
              console.log('🛑 LinkedIn restriction — stopping for today')
              break
            }

            // Log the attempt
            await logAction(matchData.job_id, 'page_opened', { url: listing.job_url })

            if (!listing.is_easy_apply && !details.is_easy_apply) {
              console.log('⏭️  Not Easy Apply — skipping for now')
              await logAction(matchData.job_id, 'skipped', { reason: 'Not Easy Apply' })
              continue
            }

            // Start Easy Apply
            const started = await startEasyApply(page)
            if (!started) {
              await logAction(matchData.job_id, 'error', { reason: 'Could not click Easy Apply' })
              continue
            }
            await logAction(matchData.job_id, 'form_detected', {})

            // Get profile for form filling
            let statusData: any = {}
            try {
              const statusPayload = `user_id=${config.user_id}`
              const profileRes = await fetch(`${API_BASE}/api/autoapply/status?user_id=${config.user_id}`, {
                headers: signRequest(statusPayload)
              })
              if (profileRes.ok) statusData = await profileRes.json()
            } catch {}

            const dummyProfile: ParsedCV = {
              name: '', email: '', phone: '', location: '', linkedin_url: null,
              github_url: null, portfolio_url: null, headline: '', summary: '',
              years_of_experience: 0, skills: { languages: [], frameworks: [], tools: [], databases: [], soft_skills: [] },
              experience: [], education: [], projects: [], certifications: [],
            }

            const profileToUse = statusData?.parsed_data || cachedProfile || dummyProfile
            
            // Bug 27: Save adjusted snapshot
            const adjustedProfile = applyPersona(profileToUse, matchData.persona_used)
            try {
              await supabase.from('generated_content').insert({
                user_id: config.user_id,
                job_id: matchData.job_id,
                content_type: 'resume_summary',
                question: `Persona: ${matchData.persona_used}`,
                answer: JSON.stringify({
                  headline: adjustedProfile.headline,
                  summary: adjustedProfile.summary,
                  top_skills: [...(adjustedProfile.skills?.frameworks || [])].slice(0, 8),
                  top_projects: (adjustedProfile.projects || []).slice(0, 3).map(p => p.name),
                }),
              })
            } catch {}

            const result = await handleMultiStep(page, adjustedProfile, matchData.job_id, config.user_id, {
              title: listing.title,
              company: listing.company,
              description: details.description || ''
            })

            if (result === 'submitted') {
              appliedCount++
              await updateJobStatus(matchData.job_id, 'applied')
              await logAction(matchData.job_id, 'submitted', { application_number: appliedCount })
              console.log(`✅ Applied! (${appliedCount}/${config.max_daily} today)`)
            } else if (result === 'captcha') {
              await updateJobStatus(matchData.job_id, 'failed', 'CAPTCHA required')
              await logAction(matchData.job_id, 'captcha_hit', {})
            } else {
              await updateJobStatus(matchData.job_id, 'failed', 'Form filling error')
              await logAction(matchData.job_id, 'error', { step: 'multi-step' })
            }

            const dismissBtn = await page.$('button[aria-label="Dismiss"], button:has-text("Discard"), .artdeco-modal__dismiss')
            if (dismissBtn) await dismissBtn.click().catch(() => {})
            await humanDelay(1000, 2000)

          } catch (err) {
            console.error(`❌ Error processing "${listing.title}":`, err)
          }
        }
      } finally {
        await page.close() // Close the tab for this role
        await humanDelay(3000, 6000)
      }
    }

  } catch (err) {
    console.error('🔥 Agent fatal error:', err)
  } finally {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`📊 Session complete: Applied to ${appliedCount} jobs`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
    await closeBrowser()
  }
}

async function checkShouldContinue(userId: string): Promise<boolean> {
  try {
    const payload = `user_id=${userId}`

    const res = await fetch(`${API_BASE}/api/autoapply/status?user_id=${userId}`, {
      headers: signRequest(payload)
    })
    const data = await res.json()
    return data.is_running === true
  } catch {
    return false
  }
}

async function updateJobStatus(jobId: string, status: string, failureReason?: string) {
  try {
    const updateData: any = { status }
    if (status === 'applied') updateData.applied_at = new Date().toISOString()
    if (failureReason) updateData.failure_reason = failureReason

    await supabase.from('jobs').update(updateData).eq('id', jobId)
  } catch {}
}

async function logAction(jobId: string, action: string, details: Record<string, unknown>) {
  try {
    await supabase.from('application_log').insert({
      job_id: jobId,
      action: action,
      details: details,
    })
    console.log(`📝 Log: ${action} for job ${jobId.slice(0, 8)}...`)
  } catch (err) {
    console.error('logAction failed:', err)
  }
}

// ─── CLI Entry Point ────────────────────────────────────────────
if (require.main === module) {
  const userId = process.argv[2] || process.env.AUTOAPPLY_USER_ID
  if (!userId) {
    console.error('Usage: npx ts-node agents/runner.ts <user_id>')
    process.exit(1)
  }

  const payload = `user_id=${userId}`
  fetch(`${API_BASE}/api/autoapply/status?user_id=${userId}`, {
    headers: signRequest(payload),
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) throw new Error(`Status API error: ${data.error}`)
      const prefs = data.job_preferences || {}
      
      startAutoApply({
        user_id: userId,
        max_daily: prefs.max_applications_per_day || 25,
        threshold: prefs.auto_apply_threshold || 7,
        roles: prefs.roles?.length ? prefs.roles : ['Software Developer'],
        locations: prefs.locations?.length ? prefs.locations : ['Remote'],
      })
    })
    .catch(err => {
      console.error('Failed to fetch config:', err)
      process.exit(1)
    })
}
