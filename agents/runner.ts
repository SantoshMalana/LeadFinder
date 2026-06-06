import { launchBrowser, getPage, closeBrowser, humanDelay, takeScreenshot } from './linkedin/browser'
import { searchJobs, extractJobListings, getJobDetails } from './linkedin/search'
import { startEasyApply, handleMultiStep } from './linkedin/easyApply'
import { shouldTakeBreak, getBreakDuration, addHumanBehavior, checkForRestriction } from './linkedin/antiDetect'
import type { ParsedCV } from '../types'

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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

  let appliedCount = 0
  let actionsCount = 0

  try {
    await launchBrowser()
    const page = await getPage()

    // Navigate to LinkedIn first
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' })
    await humanDelay(3000, 5000)

    // Check if logged in
    const isLoggedIn = await page.$('.global-nav__me, .feed-identity-module, button.share-box-feed-entry__trigger, .scaffold-layout')
    if (!isLoggedIn) {
      console.log('⚠️  Not logged into LinkedIn. Please log in manually.')
      console.log('   The browser window is open — log in and the agent will continue.')
      await page.waitForSelector('.global-nav__me, .feed-identity-module, button.share-box-feed-entry__trigger, .scaffold-layout', { timeout: 300_000 }) // 5 min
      console.log('✅ LinkedIn login detected!')
    }

    // Main loop — search for each role
    for (const role of config.roles) {
      if (appliedCount >= config.max_daily) break
      if (!(await checkShouldContinue(config.user_id))) break

      const location = config.locations[0] || ''
      console.log(`\n🔍 Searching for: "${role}" in "${location}"`)

      await searchJobs(page, role, location, { easyApply: true, datePosted: '24h' })
      await addHumanBehavior(page)

      const listings = await extractJobListings(page)
      console.log(`📋 Found ${listings.length} listings`)

      for (const listing of listings) {
        if (appliedCount >= config.max_daily) break
        if (!(await checkShouldContinue(config.user_id))) break

        // Anti-detection breaks
        actionsCount++
        if (shouldTakeBreak(actionsCount)) {
          const breakMs = getBreakDuration()
          console.log(`☕ Taking a ${Math.round(breakMs / 60000)}min break...`)
          await new Promise(r => setTimeout(r, breakMs))
        }

        // Score the job
        try {
          const matchRes = await fetch(`${API_BASE}/api/jobs/match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: listing.title,
              company: listing.company,
              location: listing.location,
              source: 'linkedin',
              job_url: listing.job_url,
              user_id: config.user_id,
            }),
          })
          const matchData = await matchRes.json()

          if (matchData.score < config.threshold) {
            console.log(`⏭️  Skip: "${listing.title}" at ${listing.company} (score: ${matchData.score})`)
            continue
          }

          console.log(`\n🎯 Match! "${listing.title}" at ${listing.company} (score: ${matchData.score})`)

          // Navigate to job
          if (listing.job_url) {
            await page.goto(listing.job_url, { waitUntil: 'domcontentloaded' })
            await humanDelay(2000, 4000)
          }

          // Check for restriction
          if (await checkForRestriction(page)) {
            console.log('🛑 LinkedIn restriction — stopping for today')
            break
          }

          // Get full details
          const details = await getJobDetails(page, listing.job_url)

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
          const profileRes = await fetch(`${API_BASE}/api/autoapply/status?user_id=${config.user_id}`)
          const statusData = await profileRes.json()

          // Fill form (we need parsed_data from profile)
          const profileDataRes = await fetch(`${API_BASE}/api/cv/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: config.user_id }),
          })

          // Handle multi-step form
          const dummyProfile: ParsedCV = {
            name: '', email: '', phone: '', location: '', linkedin_url: null,
            github_url: null, portfolio_url: null, headline: '', summary: '',
            years_of_experience: 0, skills: { languages: [], frameworks: [], tools: [], databases: [], soft_skills: [] },
            experience: [], education: [], projects: [], certifications: [],
          }

          // Use actual profile from earlier match if available
          const result = await handleMultiStep(page, dummyProfile, matchData.job_id)

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

          // Close any modal
          const dismissBtn = await page.$('button[aria-label="Dismiss"], button:has-text("Discard"), .artdeco-modal__dismiss')
          if (dismissBtn) await dismissBtn.click().catch(() => {})
          await humanDelay(1000, 2000)

        } catch (err) {
          console.error(`❌ Error processing "${listing.title}":`, err)
        }
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
    const res = await fetch(`${API_BASE}/api/autoapply/status?user_id=${userId}`)
    const data = await res.json()
    return data.is_running === true
  } catch {
    return false
  }
}

async function updateJobStatus(jobId: string, status: string, failureReason?: string) {
  try {
    await fetch(`${API_BASE}/api/jobs/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, status, failure_reason: failureReason }),
    })
  } catch {}
}

async function logAction(jobId: string, action: string, details: Record<string, unknown>) {
  try {
    // Direct Supabase call would be better here, but keeping it simple for now
    console.log(`📝 Log: ${action} for job ${jobId.slice(0, 8)}...`)
  } catch {}
}

// ─── CLI Entry Point ────────────────────────────────────────────
if (require.main === module) {
  const userId = process.argv[2] || process.env.AUTOAPPLY_USER_ID
  if (!userId) {
    console.error('Usage: npx ts-node agents/runner.ts <user_id>')
    process.exit(1)
  }

  // Fetch config from API
  fetch(`${API_BASE}/api/autoapply/status?user_id=${userId}`)
    .then(r => r.json())
    .then(data => {
      startAutoApply({
        user_id: userId,
        max_daily: data.today_limit || 25,
        threshold: data.threshold || 7,
        roles: ['Full Stack Developer', 'React Developer', 'Frontend Developer'],
        locations: ['Remote', ''],
      })
    })
    .catch(err => {
      console.error('Failed to fetch config:', err)
      process.exit(1)
    })
}
