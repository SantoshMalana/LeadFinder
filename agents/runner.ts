import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { launchBrowser, getPage, closeBrowser, humanDelay, takeScreenshot } from './linkedin/browser'
import { searchJobs, extractJobListings, getJobDetails } from './linkedin/search'
import { startEasyApply, handleMultiStep } from './linkedin/easyApply'
import { shouldTakeBreak, getBreakDuration, addHumanBehavior, checkForRestriction } from './linkedin/antiDetect'
import type { ParsedCV } from '../types'
import { Redis } from '@upstash/redis'
import { selectPersona, applyPersona } from '../lib/persona'
import { createClient } from '@supabase/supabase-js'
import { getBestStrategies } from '../lib/rejection-engine'
import { sendHeartbeat } from '../lib/heartbeat'
import { scoreJobMatch } from '../lib/scoring'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Override console.log to stream to Upstash Redis for the Live Terminal
const originalLog = console.log
const originalError = console.error
let redis: Redis | null = null
try { redis = Redis.fromEnv() } catch { /* Redis unavailable — log to stdout only */ }

const USER_ID = process.argv[2] || process.env.AUTOAPPLY_USER_ID || 'global'
const logKey = `agent_logs:${USER_ID}`

console.log = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`
  
  if (redis) {
    redis.lpush(logKey, line).catch(() => {})
    redis.ltrim(logKey, 0, 499).catch(() => {})
  }
  
  originalLog(line)
}

console.error = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
  const line = `[${new Date().toLocaleTimeString()}] ❌ ${msg}`
  
  if (redis) {
    redis.lpush(logKey, line).catch(() => {})
    redis.ltrim(logKey, 0, 499).catch(() => {})
  }
  
  originalError(line)
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
 * Main AutoApply orchestrator — runs as a separate Node.js process.
 * Loops continuously until stopped via the dashboard toggle.
 */
export async function startAutoApply(config: AgentConfig) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🚀 AutoApply Agent Started')
  console.log(`   User: ${config.user_id}`)
  console.log(`   Daily limit: ${config.max_daily}`)
  console.log(`   Threshold: ${config.threshold}/10`)
  console.log(`   Roles: ${config.roles.join(', ')}`)
  console.log(`   Locations: ${config.locations.join(', ')}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Query how many applications were already made today (survives crash + restart)
  let appliedCount = 0
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count } = await supabase
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
    if (!redis) return 0
    const count = await redis.incr(sessionKey)
    await redis.expire(sessionKey, 86400)
    return count
  }

  // ── Load profile ONCE and validate ──────────────────────
  let cachedProfile: ParsedCV | null = null
  try {
    const { data } = await supabase
      .from('profiles')
      .select('parsed_data')
      .eq('user_id', config.user_id)
      .single()
    cachedProfile = data?.parsed_data || null
  } catch { /* keep null */ }

  if (!cachedProfile || !cachedProfile.name) {
    console.error('🚨 FATAL: No parsed CV found for this user. Upload and parse your CV first!')
    console.error('   The agent cannot score or apply to jobs without a parsed profile.')
    return
  }

  console.log(`📄 Loaded profile: ${cachedProfile.name}`)
  console.log(`   Skills: ${[...(cachedProfile.skills?.languages || []), ...(cachedProfile.skills?.frameworks || [])].join(', ')}`)
  console.log(`   Experience: ${cachedProfile.years_of_experience} years`)

  try {
    const ctx = await launchBrowser()

    // ── CONTINUOUS LOOP ──────────────────────────────────
    // The agent runs until: daily limit hit, dashboard toggle off, or fatal error
    while (true) {
      if (appliedCount >= config.max_daily) {
        console.log(`🎉 Daily limit reached! Applied to ${appliedCount}/${config.max_daily} jobs today.`)
        break
      }
      if (!(await checkShouldContinue(config.user_id))) {
        console.log('🛑 Dashboard toggle turned OFF — stopping agent.')
        break
      }

      // Fetch best strategies (refreshes each cycle)
      const { bestPersona, platformMultipliers } = await getBestStrategies(config.user_id)

      for (const role of config.roles) {
        if (appliedCount >= config.max_daily) break
        if (!(await checkShouldContinue(config.user_id))) break

        const page = await ctx.newPage()

        try {
          const location = config.locations[0] || ''
          console.log(`\n🔍 Searching for: "${role}" in "${location}"`)

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
          console.log(`📋 Found ${listings.length} listings for "${role}"`)

          for (const listing of listings) {
            if (appliedCount >= config.max_daily) break
            if (!(await checkShouldContinue(config.user_id))) break

            await sendHeartbeat('linkedin', config.user_id)

            // Anti-detection breaks
            const actionsCount = await incrementActionsCount()
            if (shouldTakeBreak(actionsCount)) {
              const breakMs = getBreakDuration()
              console.log(`☕ Taking a ${Math.round(breakMs / 60000)}min break...`)
              await sendHeartbeat('linkedin', config.user_id)
              await new Promise(r => setTimeout(r, breakMs))
            }

            let matchData: any = null
            let details: any = {}
            try {
              // Navigate to job directly
              if (listing.job_url) {
                await page.goto(listing.job_url, { waitUntil: 'domcontentloaded' })
                await humanDelay(2000, 4000)
              }

              // Extract description and Easy Apply status from the page
              details = await page.evaluate(() => {
                const descEl = document.querySelector('.jobs-description__content, .jobs-box__html-content, #job-details')
                const easyApplyBtn = document.querySelector('.jobs-apply-button--top-card, .jobs-apply-button')
                return {
                  description: (descEl as HTMLElement)?.innerText?.trim() || '',
                  is_easy_apply: !!easyApplyBtn && easyApplyBtn.textContent?.includes('Easy Apply'),
                }
              })

              const effectivePersona = bestPersona ? bestPersona : await selectPersona(listing.title, details.description || '')

              // ── SCORE THE JOB ──────────────────────────
              // Pass cachedProfile DIRECTLY (it's already parsed_data)
              const matchRes = await scoreJobMatch(
                { title: listing.title, company: listing.company, description: details.description || '', location: listing.location, job_type: '' },
                cachedProfile,  // ✅ FIX: no more double-nesting
                { roles: config.roles, locations: config.locations }  // ✅ FIX: correct type
              )

              // Skip if below threshold
              const multiplier = platformMultipliers['linkedin'] || 1.0
              const adjustedThreshold = config.threshold / multiplier

              if (matchRes.score < adjustedThreshold) {
                console.log(`⏭️  Skip: "${listing.title}" at ${listing.company} (score: ${matchRes.score}, threshold: ${adjustedThreshold.toFixed(1)}, reason: ${matchRes.reason})`)
                continue
              }

              console.log(`\n🎯 Match! "${listing.title}" at ${listing.company} (score: ${matchRes.score})`)
              console.log(`   Reason: ${matchRes.reason}`)

              // Insert job row into database
              const status = matchRes.should_apply && matchRes.score >= adjustedThreshold ? 'queued' : 'discovered'
              const { data: jobRow } = await supabase.from('jobs').upsert({
                user_id: config.user_id,
                source: 'linkedin',
                source_id: 'li_' + (listing.job_url?.split('/view/')[1]?.split('/')[0] || Math.random().toString(36).substring(7)),
                company: listing.company,
                title: listing.title,
                description: (details.description || '').substring(0, 5000),
                location: listing.location,
                job_url: listing.job_url,
                match_score: matchRes.score,
                match_reason: matchRes.reason,  // ✅ FIX: was incorrectly `matchRes.summary`
                persona_used: effectivePersona,
                status,
                discovered_at: new Date().toISOString(),
              }, { onConflict: 'user_id,job_url' }).select('id').single()

              matchData = { ...matchRes, job_id: jobRow?.id || null, persona_used: effectivePersona }
            } catch (err: any) {
              console.error(`⚠️ Score/insert error for "${listing.title}":`, err?.message || err)
              continue
            }

            // ── APPLY TO THE JOB ──────────────────────────
            try {
              if (await checkForRestriction(page)) {
                console.log('🛑 LinkedIn restriction — stopping for today')
                break
              }

              await logAction(matchData.job_id, 'page_opened', { url: listing.job_url })

              if (!listing.is_easy_apply && !details.is_easy_apply) {
                console.log('⏭️  Not Easy Apply — skipping')
                await logAction(matchData.job_id, 'skipped', { reason: 'Not Easy Apply' })
                continue
              }

              // Click Easy Apply button
              const started = await startEasyApply(page)
              if (!started) {
                console.log('⚠️ Could not click Easy Apply button')
                await logAction(matchData.job_id, 'error', { reason: 'Could not click Easy Apply' })
                continue
              }
              await logAction(matchData.job_id, 'form_detected', {})

              // Apply persona adjustments
              const adjustedProfile = applyPersona(cachedProfile, matchData.persona_used)

              // Save persona snapshot
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
                    top_projects: (adjustedProfile.projects || []).slice(0, 3).map((p: any) => p.name),
                  }),
                })
              } catch {}

              // ── FILL THE FORM & SUBMIT ──────────────────
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
                console.log('🛑 CAPTCHA blocked this application')
              } else {
                await updateJobStatus(matchData.job_id, 'failed', 'Form filling error')
                await logAction(matchData.job_id, 'error', { step: 'multi-step' })
                console.log('⚠️ Form filling failed')
              }

              // Dismiss any lingering modals
              const dismissBtn = await page.$('button[aria-label="Dismiss"], button:has-text("Discard"), .artdeco-modal__dismiss')
              if (dismissBtn) await dismissBtn.click().catch(() => {})
              await humanDelay(1000, 2000)

            } catch (err: any) {
              console.error(`❌ Error applying to "${listing.title}":`, err?.message || err)
            }
          }
        } finally {
          await page.close()
          await humanDelay(3000, 6000)
        }
      }

      // ── Cooldown between cycles ──────────────────────
      if (appliedCount < config.max_daily && await checkShouldContinue(config.user_id)) {
        const cooldownMin = 3 + Math.floor(Math.random() * 4) // 3-6 minutes
        console.log(`\n💤 Cycle complete. Applied ${appliedCount} so far. Next search in ${cooldownMin} minutes...`)
        await new Promise(r => setTimeout(r, cooldownMin * 60 * 1000))
      }
    }

  } catch (err) {
    console.error('🔥 Agent fatal error:', err)
  } finally {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`📊 Session complete: Applied to ${appliedCount} jobs`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    await closeBrowser()
  }
}

async function checkShouldContinue(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('profiles').select('autoapply_running').eq('user_id', userId).single()
    if (error) {
      console.error("checkShouldContinue error:", error.message)
      return true // keep running on transient DB errors
    }
    return data?.autoapply_running === true
  } catch (err: any) {
    console.error("checkShouldContinue catch:", err?.message)
    return true // keep running on network errors
  }
}

async function updateJobStatus(jobId: string, status: string, failureReason?: string) {
  if (!jobId) return
  try {
    const updateData: any = { status }
    if (status === 'applied') updateData.applied_at = new Date().toISOString()
    if (failureReason) updateData.failure_reason = failureReason

    await supabase.from('jobs').update(updateData).eq('id', jobId)
  } catch {}
}

async function logAction(jobId: string, action: string, details: Record<string, unknown>) {
  if (!jobId) return
  try {
    await supabase.from('application_log').insert({
      job_id: jobId,
      action: action,
      details: details,
    })
    console.log(`📝 Log: ${action} for job ${jobId.slice(0, 8)}...`)
  } catch (err: any) {
    console.error('logAction failed:', err?.message)
  }
}

// ─── CLI Entry Point ────────────────────────────────────────────
if (require.main === module) {
  const userId = process.argv[2] || process.env.AUTOAPPLY_USER_ID
  if (!userId) {
    console.error('Usage: npx tsx agents/runner.ts <user_id>')
    process.exit(1)
  }

  Promise.resolve(
    supabase.from('profiles').select('job_preferences').eq('user_id', userId).single()
  )
    .then(({ data, error }) => {
      if (error) throw new Error(`Supabase error: ${error.message}`)
      const prefs = data?.job_preferences || {}
      
      startAutoApply({
        user_id: userId,
        max_daily: prefs.max_applications_per_day || 25,
        threshold: prefs.auto_apply_threshold || 7,
        roles: prefs.roles?.length ? prefs.roles : ['Software Developer'],
        locations: prefs.locations?.length ? prefs.locations : ['Remote'],
      }).catch(err => {
        console.error('Fatal error in AutoApply:', err)
        process.exit(1)
      })
    })
    .catch(err => {
      console.error('Failed to fetch config:', err)
      process.exit(1)
    })
}
