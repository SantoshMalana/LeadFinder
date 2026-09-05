import type { Page } from 'playwright'
import { humanDelay, humanClick, takeScreenshot } from './browser'
import { humanTypeText } from './humanTyping'
import { PlatformCircuitBreaker } from './circuitBreaker'
import { generateCoverLetter as generateCoverLetterPdf } from './pdfGenerator'
import { solveCaptcha } from './captchaSolver'
import { generateScreeningAnswer } from '../../lib/cover-letter'
import type { ParsedCV } from '../../types'
import { createClient } from '@supabase/supabase-js'

// Direct DB access — no more localhost API calls
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Click the Easy Apply button on a LinkedIn job page
 */
export async function startEasyApply(page: Page): Promise<boolean> {
  const circuitBreaker = new PlatformCircuitBreaker('linkedin')
  if (!(await circuitBreaker.canProceed())) {
    console.log('🛑 Circuit Breaker open: Cannot start application.')
    return false
  }

  try {
    const btn = await page.$('button:has-text("Easy Apply"), .jobs-apply-button:has-text("Easy Apply")')
    if (!btn) {
      console.log('❌ No Easy Apply button found')
      return false
    }
    await humanClick(page, 'button:has-text("Easy Apply")')
    await humanDelay(1500, 3000)
    return true
  } catch {
    return false
  }
}

/**
 * Fill Easy Apply form fields using CV data
 */
export async function fillEasyApplyForm(page: Page, profile: ParsedCV): Promise<void> {
  // Fill phone if empty
  const phoneInput = await page.$('input[name*="phone"], input[id*="phone"], input[aria-label*="phone" i]')
  if (phoneInput) {
    const val = await phoneInput.inputValue()
    if (!val && profile.phone) await humanTypeText(page, 'input[name*="phone"], input[id*="phone"]', profile.phone)
  }

  // Fill email if empty
  const emailInput = await page.$('input[name*="email"], input[type="email"]')
  if (emailInput) {
    const val = await emailInput.inputValue()
    if (!val && profile.email) await humanTypeText(page, 'input[name*="email"], input[type="email"]', profile.email)
  }

  // Fill location/city
  const cityInput = await page.$('input[name*="city"], input[aria-label*="city" i], input[aria-label*="location" i]')
  if (cityInput) {
    const val = await cityInput.inputValue()
    if (!val && profile.location) await humanTypeText(page, 'input[name*="city"], input[aria-label*="city" i]', profile.location)
  }

  // Handle text areas (cover letter, additional info)
  const textareas = await page.$$('textarea')
  for (const ta of textareas) {
    const label = await ta.getAttribute('aria-label') || await ta.getAttribute('placeholder') || ''
    if (label.toLowerCase().includes('cover') || label.toLowerCase().includes('additional')) {
      const val = await ta.inputValue()
      if (!val) {
        const fallbacks = [
          `${profile.experience[0]?.title || 'Engineer'} with ${profile.years_of_experience || 3}+ years shipping production ${(profile.skills.frameworks || []).slice(0, 2).join(' and ')} applications. Excited to bring that to this role.`,
          `My work on ${profile.projects[0]?.name || 'recent projects'} — ${profile.projects[0]?.description?.slice(0, 80) || 'production-grade systems'} — aligns directly with what you're building.`,
          `${profile.years_of_experience || 3} years of ${(profile.skills.languages || [])[0] || 'full-stack'} development, focused on ${(profile.skills.frameworks || []).slice(0, 3).join(', ')}. Happy to share more specifics.`,
        ]
        const text = fallbacks[Math.floor(Math.random() * fallbacks.length)]
        await ta.fill(text)
      }
    }
  }

  // Handle dropdowns (years of experience, education level, etc.)
  const selects = await page.$$('select')
  for (const sel of selects) {
    const label = await sel.getAttribute('aria-label') || ''
    const labelLower = label.toLowerCase()

    if (labelLower.includes('experience') || labelLower.includes('years')) {
      const years = String(profile.years_of_experience || 2)
      await sel.selectOption({ label: years })
        .catch(() => sel.selectOption({ index: Math.min(profile.years_of_experience || 2, 5) })
        .catch(() => {}))
    }
  }

  await humanDelay(500, 1000)
}

/**
 * Handle screening questions using AI — calls scoring/generation DIRECTLY,
 * no localhost API needed.
 */
export async function handleScreeningQuestion(
  page: Page,
  profile: ParsedCV,
  jobId: string,
  jobMeta: { title: string; company: string; description: string },
  userId?: string
): Promise<void> {
  const questions = await page.$$('.jobs-easy-apply-form-section__grouping, .fb-dash-form-element')

  for (const q of questions) {
    const labelEl = await q.$('label, .fb-dash-form-element__label, span[aria-hidden="true"]')
    const inputEl = await q.$('input:not([type="hidden"]), textarea, select')
    
    // Some radio buttons are grouped differently
    const radioInputs = await q.$$('input[type="radio"]')

    if (!labelEl && radioInputs.length === 0) continue

    const questionText = labelEl ? await labelEl.innerText().catch(() => '') : ''
    if (!questionText.trim() && radioInputs.length === 0) continue

    // Handle standalone radio groups (e.g. Yes/No questions)
    if (radioInputs.length > 0) {
      let isChecked = false
      for (const radio of radioInputs) {
        if (await radio.isChecked()) isChecked = true
      }
      if (isChecked) continue

      const radioLabels = await q.$$eval(
        'label',
        (labels) => labels.map(l => ({ text: l.textContent?.trim() || '', forId: l.getAttribute('for') || '' }))
      )

      if (radioLabels.length === 0) continue

      try {
        // ✅ Direct call — no localhost fetch
        const answer = await generateScreeningAnswer(
          questionText + '\nOptions: ' + radioLabels.map(l => l.text).join(', '),
          jobMeta,
          profile,
          jobId
        )

        if (answer) {
          const answerLower = answer.toLowerCase().trim()
          const bestMatch = radioLabels.find(l => l.text.toLowerCase().includes(answerLower))
            || radioLabels.find(l => answerLower.includes(l.text.toLowerCase()))
            || radioLabels[0]

          const targetLabel = await q.$(`label[for="${bestMatch.forId}"]`)
          if (targetLabel) await targetLabel.click({ force: true })
          console.log(`   📝 Radio "${questionText}" → "${bestMatch.text}"`)
        }
      } catch {
        // Fallback: click first option (usually "Yes")
        const firstLabel = await q.$('label')
        if (firstLabel) await firstLabel.click({ force: true }).catch(() => {})
      }

      // Save generated answer
      try {
        await supabase.from('generated_content').insert({
          job_id: jobId,
          content_type: 'answer',
          question: questionText,
          answer: radioLabels[0]?.text || 'fallback',
        })
      } catch {}

      continue
    }

    if (!inputEl) continue
    const tagName = await inputEl.evaluate(el => el.tagName.toLowerCase())

    // Skip already filled text inputs
    if (tagName === 'input' || tagName === 'textarea') {
      const val = await inputEl.inputValue().catch(() => '')
      if (val) continue

      try {
        // ✅ Direct call — no localhost fetch
        const answer = await generateScreeningAnswer(
          questionText,
          jobMeta,
          profile,
          jobId
        )
        
        if (answer) {
          await inputEl.fill(answer)
          console.log(`   📝 Text "${questionText.substring(0, 40)}..." → "${answer.substring(0, 50)}..."`)

          // Save to DB
          try {
            await supabase.from('generated_content').insert({
              job_id: jobId,
              content_type: 'answer',
              question: questionText,
              answer: answer,
            })
          } catch {}
        } else {
          // Fallback for empty answers
          try {
            await inputEl.fill('N/A')
          } catch {}
        }
      } catch (err: any) {
        console.error(`⚠️ Failed to answer: "${questionText}"`, err?.message)
        // Fill with N/A rather than leaving blank (which blocks form submission)
        try { await inputEl.fill('N/A') } catch {}
      }
    }

    await humanDelay(500, 1200)
  }
}

/**
 * Upload resume or cover letter file
 */
export async function uploadResume(page: Page, resumePath: string): Promise<boolean> {
  try {
    const fileInputs = await page.$$('input[type="file"]')
    let uploaded = false
    for (const input of fileInputs) {
       await input.setInputFiles(resumePath)
       uploaded = true
       break
    }
    if (uploaded) {
      await humanDelay(1500, 3000)
      console.log('📎 File uploaded')
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Handle multi-step Easy Apply flow (Next → Next → Submit)
 */
export async function handleMultiStep(
  page: Page,
  profile: ParsedCV,
  jobId: string,
  userId?: string,
  jobMeta?: { title: string; company: string; description: string }
): Promise<'submitted' | 'captcha' | 'error'> {
  const MAX_STEPS = 15
  let consecutiveNoProgress = 0
  const meta = jobMeta || { title: 'Unknown', company: 'Unknown', description: '' }

  for (let step = 0; step < MAX_STEPS; step++) {
    await humanDelay(1000, 2000)

    // Check for CAPTCHA
    const captcha = await page.$('[class*="captcha"], #captcha, iframe[src*="captcha"]')
    if (captcha) {
      console.log('🛑 CAPTCHA detected')
      const solved = await solveCaptcha(page)
      if (!solved) {
        console.log('❌ Failed to solve CAPTCHA — needs human intervention')
        await takeScreenshot(page, `captcha-step-${step}`)
        return 'captcha'
      }
    }

    // Check if Cover Letter upload is requested
    const fileInputText = await page.evaluate(() => document.body.innerText)
    if (fileInputText.toLowerCase().includes('cover letter') && !fileInputText.toLowerCase().includes('no cover letter') && await page.$('input[type="file"]')) {
       console.log('📝 Cover letter requested! Generating dynamic PDF...')
       try {
         const jobContext = await page.evaluate(() => document.querySelector('.jobs-description-content')?.textContent || 'Software Developer')
         const pdfPath = await generateCoverLetterPdf(
           profile,
           jobContext.substring(0, 500),
           meta.title,
           meta.company
         )
         await uploadResume(page, pdfPath)
       } catch (err: any) {
         console.error('⚠️ Failed to attach cover letter:', err?.message)
       }
    }

    // Fill any visible form fields
    await fillEasyApplyForm(page, profile)
    // ✅ FIX: pass profile and jobMeta directly instead of fetching from localhost
    await handleScreeningQuestion(page, profile, jobId, meta, userId)

    // Check for Submit button
    const submitBtn = await page.$('button:has-text("Submit application"), button:has-text("Submit"), button[aria-label*="Submit"]')
    if (submitBtn) {
      await humanClick(page, 'button:has-text("Submit application"), button:has-text("Submit")')
      await humanDelay(2000, 4000)
      console.log('✅ Application submitted!')
      return 'submitted'
    }

    // Click "Next" or "Review" or "Continue"
    const nextBtn = await page.$('button:has-text("Next"), button:has-text("Review"), button:has-text("Continue"), button[aria-label*="next" i]')
    if (nextBtn) {
      consecutiveNoProgress = 0
      await nextBtn.click()
      await humanDelay(1500, 3000)
      continue
    }

    consecutiveNoProgress++
    if (consecutiveNoProgress >= 2) {
      console.log(`⚠️ No progress for 2 consecutive steps — aborting at step ${step + 1}`)
      
      const discardBtn = await page.$('button:has-text("Discard")')
      if (discardBtn) {
        console.log('Dismissing Discard modal...')
        await discardBtn.click()
        await humanDelay(1000, 2000)
      }

      await takeScreenshot(page, `no-progress-step-${step}`)
      break
    }
  }

  return 'error'
}
