import type { Page } from 'playwright'
import { humanDelay, humanClick, humanType } from './browser'

export interface JobListing {
  title: string
  company: string
  location: string
  job_url: string
  job_type: string
  is_easy_apply: boolean
  posted_time: string
  description?: string
}

/**
 * Search LinkedIn Jobs with keywords and filters
 */
export async function searchJobs(
  page: Page,
  keywords: string,
  location: string = '',
  filters: { easyApply?: boolean; datePosted?: '24h' | 'week' | 'month' } = {}
): Promise<void> {
  const url = new URL('https://www.linkedin.com/jobs/search/')
  url.searchParams.set('keywords', keywords)
  if (location) url.searchParams.set('location', location)
  if (filters.datePosted === '24h') url.searchParams.set('f_TPR', 'r86400')
  if (filters.datePosted === 'week') url.searchParams.set('f_TPR', 'r604800')
  if (filters.easyApply) url.searchParams.set('f_AL', 'true')

  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' })
  await humanDelay(2000, 4000)
  console.log(`🔍 Searching: "${keywords}" in "${location || 'anywhere'}"`)
}

/**
 * Extract job listings from LinkedIn search results page
 */
export async function extractJobListings(page: Page): Promise<JobListing[]> {
  await humanDelay(1500, 3000)

  const listings = await page.evaluate(() => {
    const cards = document.querySelectorAll('.job-card-container, .jobs-search-results__list-item, [data-job-id]')
    const results: {
      title: string; company: string; location: string;
      job_url: string; job_type: string; is_easy_apply: boolean; posted_time: string
    }[] = []

    cards.forEach(card => {
      const titleEl = card.querySelector('.job-card-list__title, .job-card-container__link, a[data-control-name]')
      const companyEl = card.querySelector('.job-card-container__primary-description, .job-card-container__company-name, .artdeco-entity-lockup__subtitle')
      const locationEl = card.querySelector('.job-card-container__metadata-item, .artdeco-entity-lockup__caption')
      const easyApplyEl = card.querySelector('.job-card-container__apply-method, [data-is-easy-apply]')

      if (titleEl) {
        results.push({
          title: (titleEl as HTMLElement).innerText?.trim() || '',
          company: (companyEl as HTMLElement)?.innerText?.trim() || '',
          location: (locationEl as HTMLElement)?.innerText?.trim() || '',
          job_url: (titleEl as HTMLAnchorElement)?.href || '',
          job_type: '',
          is_easy_apply: !!easyApplyEl || card.innerHTML.includes('Easy Apply'),
          posted_time: '',
        })
      }
    })
    return results
  })

  console.log(`📋 Found ${listings.length} job listings`)
  return listings
}

/**
 * Navigate to a specific job and extract full details
 */
export async function getJobDetails(page: Page, jobUrl: string): Promise<{ description: string; is_easy_apply: boolean }> {
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded' })
  await humanDelay(2000, 4000)

  const details = await page.evaluate(() => {
    const descEl = document.querySelector('.jobs-description__content, .jobs-box__html-content, #job-details')
    const easyApplyBtn = document.querySelector('.jobs-apply-button--top-card, button[data-control-name="jobdetails_topcard_inapply"]')

    return {
      description: (descEl as HTMLElement)?.innerText?.trim() || '',
      is_easy_apply: !!easyApplyBtn && (easyApplyBtn.innerHTML.includes('Easy Apply') || easyApplyBtn.getAttribute('aria-label')?.includes('Easy Apply') || false),
    }
  })

  return details
}

/**
 * Check if current job page has Easy Apply
 */
export async function isEasyApply(page: Page): Promise<boolean> {
  const btn = await page.$('button:has-text("Easy Apply"), .jobs-apply-button:has-text("Easy Apply")')
  return !!btn
}
