import { chromium, type Browser, type Page, type BrowserContext } from 'playwright'
import * as path from 'path'
import * as os from 'os'

let browser: Browser | null = null
let context: BrowserContext | null = null

const USER_DATA_DIR = path.join(os.homedir(), '.leadfinder', 'chrome-profile')

/**
 * Launch real Chrome with persistent profile (keeps LinkedIn session)
 */
export async function launchBrowser(): Promise<BrowserContext> {
  if (context) return context

  context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: 'chrome', // Use real Chrome, not Chromium
    viewport: { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  })

  console.log('🌐 Browser launched with persistent profile')
  return context
}

export async function getPage(): Promise<Page> {
  const ctx = await launchBrowser()
  const pages = ctx.pages()
  return pages.length > 0 ? pages[0] : await ctx.newPage()
}

export async function closeBrowser() {
  if (context) { await context.close(); context = null }
  if (browser) { await browser.close(); browser = null }
  console.log('🔒 Browser closed')
}

/**
 * Human-like delay between actions
 */
export function humanDelay(minMs = 1500, maxMs = 4000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs) + minMs)
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Type text with random keystroke delays (like a human)
 */
export async function humanType(page: Page, selector: string, text: string) {
  await page.click(selector)
  await humanDelay(200, 500)
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.random() * 120 + 30 })
  }
}

/**
 * Click with small random delay before and after
 */
export async function humanClick(page: Page, selector: string) {
  await humanDelay(300, 800)
  const el = await page.$(selector)
  if (el) {
    const box = await el.boundingBox()
    if (box) {
      // Click at random position within the element
      const x = box.x + Math.random() * box.width
      const y = box.y + Math.random() * box.height
      await page.mouse.click(x, y)
    } else {
      await el.click()
    }
  }
  await humanDelay(500, 1500)
}

/**
 * Save screenshot for debugging / application log
 */
export async function takeScreenshot(page: Page, name: string): Promise<string> {
  const dir = path.join(os.homedir(), '.leadfinder', 'screenshots')
  const filepath = path.join(dir, `${name}-${Date.now()}.png`)
  await page.screenshot({ path: filepath, fullPage: false })
  return filepath
}
