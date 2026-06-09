import type { Page } from 'playwright'
import { humanDelay } from './browser'

/**
 * Add random human-like behavior to avoid detection
 */
export async function addHumanBehavior(page: Page): Promise<void> {
  // Random scroll
  const scrollAmount = Math.floor(Math.random() * 500) + 100
  await page.evaluate((amount) => window.scrollBy(0, amount), scrollAmount)
  await humanDelay(800, 2000)

  // Random mouse movement
  await randomMouseMove(page)
}

/**
 * Random delay with gaussian distribution
 */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs) + minMs)
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if we should take a break (anti-detection)
 */
export function shouldTakeBreak(actionsCount: number): boolean {
  if (actionsCount < 5) return false

  // Logistic fatigue curve: probability rises from 5% at action 5 to 80% at action 30
  const fatigueProbability = 1 / (1 + Math.exp(-(actionsCount - 15) / 4))
  const roll = Math.random()

  return roll < fatigueProbability * 0.6 // cap at 48% per check
}

/**
 * Mandatory long break regardless of probability
 */
export function requiresMandatoryBreak(actionsCount: number): boolean {
  return actionsCount > 0 && actionsCount % 25 === 0
}

/**
 * Get a random break duration (3-10 minutes)
 */
export function getBreakDuration(): number {
  return Math.floor(Math.random() * 7 * 60 * 1000) + 3 * 60 * 1000
}

function bezierPoint(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

/**
 * Move mouse in a natural bezier curve
 */
export async function randomMouseMove(page: Page): Promise<void> {
  const viewport = page.viewportSize()
  if (!viewport) return

  // Current approximate position (assume center if unknown)
  const startX = Math.floor(Math.random() * viewport.width)
  const startY = Math.floor(Math.random() * viewport.height)
  const endX = Math.floor(Math.random() * viewport.width * 0.8) + viewport.width * 0.1
  const endY = Math.floor(Math.random() * viewport.height * 0.8) + viewport.height * 0.1

  // Random control points for natural curve
  const cp1x = startX + (Math.random() - 0.5) * 200
  const cp1y = startY + (Math.random() - 0.5) * 200
  const cp2x = endX + (Math.random() - 0.5) * 200
  const cp2y = endY + (Math.random() - 0.5) * 200

  const steps = Math.floor(Math.random() * 20) + 15 // 15-35 steps

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = bezierPoint(startX, cp1x, cp2x, endX, t)
    const y = bezierPoint(startY, cp1y, cp2y, endY, t)

    // Micro-jitter to break perfect curve detection
    const jX = (Math.random() - 0.5) * 2
    const jY = (Math.random() - 0.5) * 2

    await page.mouse.move(x + jX, y + jY)

    // Variable speed: slower at start/end (like real mouse deceleration)
    const speed = t < 0.2 || t > 0.8 ? 20 + Math.random() * 20 : 5 + Math.random() * 10
    await new Promise(r => setTimeout(r, speed))
  }
}

/**
 * Random tab switching behavior
 */
export async function simulateTabSwitch(page: Page): Promise<void> {
  if (Math.random() > 0.85) { // 15% chance per action
    console.log('🔄 Simulating tab switch behavior...')
    await page.evaluate(() => document.hidden) // Simulate focus loss
    await humanDelay(2000, 8000)
  }
}

/**
 * Check if LinkedIn shows any warning/restriction
 */
export async function checkForRestriction(page: Page): Promise<boolean> {
  const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase())
  
  const restrictionSignals = [
    'unusual activity',
    'account restricted',
    'temporarily limited',
    'too many requests',
    'security verification',
    'please verify',
    'we noticed some unusual',
    'your account has been',
  ]

  const isRestricted = restrictionSignals.some(signal => bodyText.includes(signal))

  if (isRestricted) {
    console.log('🚨 LinkedIn restriction detected via content analysis!')
    // We should take a screenshot and optionally push alert to Redis
    try {
      await page.screenshot({ path: `restriction-${Date.now()}.png` })
      console.log('📸 Screenshot saved')
    } catch (err) {}
  }

  return isRestricted
}
