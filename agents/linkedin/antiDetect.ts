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
 * Takes a break every 8-12 actions
 */
export function shouldTakeBreak(actionsCount: number): boolean {
  const breakEvery = Math.floor(Math.random() * 5) + 8 // 8-12
  return actionsCount > 0 && actionsCount % breakEvery === 0
}

/**
 * Get a random break duration (3-10 minutes)
 */
export function getBreakDuration(): number {
  return Math.floor(Math.random() * 7 * 60 * 1000) + 3 * 60 * 1000
}

/**
 * Move mouse in a natural bezier curve
 */
export async function randomMouseMove(page: Page): Promise<void> {
  const viewport = page.viewportSize()
  if (!viewport) return

  const targetX = Math.floor(Math.random() * viewport.width * 0.8) + viewport.width * 0.1
  const targetY = Math.floor(Math.random() * viewport.height * 0.8) + viewport.height * 0.1

  // Move in small steps (bezier approximation)
  const steps = Math.floor(Math.random() * 10) + 5
  for (let i = 0; i < steps; i++) {
    const progress = i / steps
    const x = targetX * progress + Math.random() * 20 - 10
    const y = targetY * progress + Math.random() * 20 - 10
    await page.mouse.move(x, y)
    await new Promise(r => setTimeout(r, Math.random() * 30 + 10))
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
  const restricted = await page.$('[class*="restriction"], [class*="blocked"], [class*="limit"]')
  if (restricted) {
    console.log('🚨 LinkedIn restriction detected!')
    return true
  }
  return false
}
