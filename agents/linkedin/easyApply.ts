import type { Page } from 'playwright'
import { humanDelay, humanClick, humanType, takeScreenshot } from './browser'
import type { ParsedCV } from '../../types'

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/**
 * Click the Easy Apply button on a LinkedIn job page
 */
export async function startEasyApply(page: Page): Promise<boolean> {
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
    if (!val) await humanType(page, 'input[name*="phone"], input[id*="phone"]', profile.phone)
  }

  // Fill email if empty
  const emailInput = await page.$('input[name*="email"], input[type="email"]')
  if (emailInput) {
    const val = await emailInput.inputValue()
    if (!val) await humanType(page, 'input[name*="email"], input[type="email"]', profile.email)
  }

  // Fill location/city
  const cityInput = await page.$('input[name*="city"], input[aria-label*="city" i], input[aria-label*="location" i]')
  if (cityInput) {
    const val = await cityInput.inputValue()
    if (!val) await humanType(page, 'input[name*="city"]', profile.location)
  }

  // Handle text areas (cover letter, additional info)
  const textareas = await page.$$('textarea')
  for (const ta of textareas) {
    const label = await ta.getAttribute('aria-label') || await ta.getAttribute('placeholder') || ''
    if (label.toLowerCase().includes('cover') || label.toLowerCase().includes('additional')) {
      const val = await ta.inputValue()
      if (!val) {
        await ta.fill(`I'm excited about this opportunity. With ${profile.years_of_experience}+ years of experience in ${profile.skills.frameworks.slice(0, 3).join(', ')}, I believe I can make a strong contribution to your team.`)
      }
    }
  }

  // Handle dropdowns (years of experience, education level, etc.)
  const selects = await page.$$('select')
  for (const sel of selects) {
    const label = await sel.getAttribute('aria-label') || ''
    const labelLower = label.toLowerCase()

    if (labelLower.includes('experience') || labelLower.includes('years')) {
      const years = String(profile.years_of_experience)
      await sel.selectOption({ label: years })
        .catch(() => sel.selectOption({ index: Math.min(profile.years_of_experience, 5) })
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
  jobId: string
): Promise<void> {
  const questions = await page.$$('.jobs-easy-apply-form-section__grouping, .fb-dash-form-element')

  for (const q of questions) {
    const labelEl = await q.$('label, .fb-dash-form-element__label, span[aria-hidden]')
    const inputEl = await q.$('input:not([type="hidden"]), textarea, select')
    if (!labelEl || !inputEl) continue

    const questionText = await labelEl.innerText().catch(() => '')
    if (!questionText.trim()) continue

    const tagName = await inputEl.evaluate(el => el.tagName.toLowerCase())
    const inputType = await inputEl.getAttribute('type') || ''

    // Skip already filled
    if (tagName === 'input' || tagName === 'textarea') {
      const val = await inputEl.inputValue().catch(() => '')
      if (val) continue
    }

    // For radio buttons / yes-no — try to select "Yes" first
    if (inputType === 'radio') {
      const yesOption = await q.$('label:has-text("Yes"), input[value="Yes"]')
      if (yesOption) { await yesOption.click(); continue }
    }

    // For text inputs — call AI to generate answer
    if (tagName === 'input' || tagName === 'textarea') {
      try {
        const res = await fetch(`${API_BASE}/api/generate/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, question: questionText }),
        })
        const data = await res.json()
        if (data.answer) {
          await inputEl.fill(data.answer)
        }
      } catch (err) {
        console.error(`⚠️ Failed to answer: "${questionText}"`, err)
      }
    }

    await humanDelay(500, 1200)
  }
}

/**
 * Upload resume file
 */
export async function uploadResume(page: Page, resumePath: string): Promise<boolean> {
  try {
    const fileInput = await page.$('input[type="file"]')
    if (fileInput) {
      await fileInput.setInputFiles(resumePath)
      await humanDelay(1500, 3000)
      console.log('📎 Resume uploaded')
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
  jobId: string
): Promise<'submitted' | 'captcha' | 'error'> {
  const MAX_STEPS = 8

  for (let step = 0; step < MAX_STEPS; step++) {
    await humanDelay(1000, 2000)

    // Check for CAPTCHA
    const captcha = await page.$('[class*="captcha"], #captcha, iframe[src*="captcha"]')
    if (captcha) {
      console.log('🛑 CAPTCHA detected — needs human intervention')
      await takeScreenshot(page, `captcha-step-${step}`)
      return 'captcha'
    }

    // Fill any visible form fields
    await fillEasyApplyForm(page, profile)
    await handleScreeningQuestion(page, jobId)

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
    await takeScreenshot(page, `stuck-step-${step}`)
    break
  }

  return 'error'
}
