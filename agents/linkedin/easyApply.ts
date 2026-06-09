import type { Page } from 'playwright'
import { humanDelay, humanClick, takeScreenshot } from './browser'
import { humanTypeText } from './humanTyping'
import { PlatformCircuitBreaker } from './circuitBreaker'
import { generateCoverLetter } from './pdfGenerator'
import { solveCaptcha } from './captchaSolver'
import { signRequest } from '../../lib/sign'
import type { ParsedCV } from '../../types'

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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
        await ta.fill(`I am highly interested in this opportunity. With ${profile.years_of_experience || 3}+ years of experience in ${profile.skills?.frameworks?.slice(0, 3).join(', ') || 'software development'}, I believe I can make a strong contribution to your team.`)
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
 * Handle screening questions using AI
 */
export async function handleScreeningQuestion(
  page: Page,
  jobId: string,
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
      // Check if any is already checked
      let isChecked = false
      for (const radio of radioInputs) {
        if (await radio.isChecked()) isChecked = true
      }
      if (isChecked) continue

      // Use AI for radio buttons as well, or skip. Blindly clicking "Yes" is dangerous.
      try {
        const payload = { job_id: jobId, question: questionText, user_id: userId }
        const res = await fetch(`${API_BASE}/api/generate/answer`, {
          method: 'POST',
          headers: signRequest(payload),
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('AI answer API failed')
        const data = await res.json()
        if (data.answer) {
          // Find radio option matching the answer (e.g. Yes/No)
          const answerOption = await q.$(`label:text-is("${data.answer}"), input[value="${data.answer}"]`)
          if (answerOption) {
            await answerOption.click({ force: true }).catch(() => {})
          }
        }
      } catch (err) {
        console.log('⚠️ Failed to answer radio question via AI.')
      }
      continue
    }

    if (!inputEl) continue
    const tagName = await inputEl.evaluate(el => el.tagName.toLowerCase())

    // Skip already filled text inputs
    if (tagName === 'input' || tagName === 'textarea') {
      const val = await inputEl.inputValue().catch(() => '')
      if (val) continue

      // For text inputs — call AI to generate answer
      try {
        const payload = { job_id: jobId, question: questionText, user_id: userId }
        const res = await fetch(`${API_BASE}/api/generate/answer`, {
          method: 'POST',
          headers: signRequest(payload),
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('AI answer API failed')
        const data = await res.json()
        if (data.answer) {
          await inputEl.fill(data.answer)
        } else {
          // AI returned no answer — use a safe fallback for text inputs
          try {
            if (tagName === 'input' || tagName === 'textarea') {
              await inputEl.fill('N/A')
            }
            // For radios, skip silently to avoid invalidating the form
          } catch (fallbackErr) {
            console.log('⚠️ Failed to apply fallback value to input.')
          }
        }
      } catch (err) {
        console.error(`⚠️ Failed to answer: "${questionText}"`, err)
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
       // Just upload to the first available file input if not specified
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
  userId?: string
): Promise<'submitted' | 'captcha' | 'error'> {
  const MAX_STEPS = 8

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
         // Get job details from the page or pass it down. We'll extract a bit of context here.
         const jobContext = await page.evaluate(() => document.querySelector('.jobs-description-content')?.textContent || 'Software Developer')
         const pdfPath = await generateCoverLetter(profile, jobContext.substring(0, 500))
         await uploadResume(page, pdfPath)
       } catch (err) {
         console.error('⚠️ Failed to attach cover letter:', err)
       }
    }

    // Fill any visible form fields
    await fillEasyApplyForm(page, profile)
    await handleScreeningQuestion(page, jobId, userId)

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
      await nextBtn.click()
      await humanDelay(1500, 3000)
      continue
    }

    // No submit and no next — we're stuck
    console.log(`⚠️ Stuck at step ${step + 1}`)
    
    // Attempt to dismiss "Discard application?" modal if it popped up somehow
    const discardBtn = await page.$('button:has-text("Discard")')
    if (discardBtn) {
      console.log('Dismissing Discard modal...')
      await discardBtn.click()
      await humanDelay(1000, 2000)
    }

    await takeScreenshot(page, `stuck-step-${step}`)
    break
  }

  return 'error'
}
