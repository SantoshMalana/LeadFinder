import type { Page } from 'playwright'

interface TypingProfile {
  wpm: number          // Words per minute base
  errorRate: number    // 0-1, probability of typo per character
  correctionDelay: number // ms before correcting typo
}

const PROFILES: Record<string, TypingProfile> = {
  fast: { wpm: 85, errorRate: 0.02, correctionDelay: 300 },
  normal: { wpm: 55, errorRate: 0.04, correctionDelay: 500 },
  slow: { wpm: 35, errorRate: 0.06, correctionDelay: 800 },
}

function getProfile(profileName: 'fast' | 'normal' | 'slow' | string): TypingProfile {
  return PROFILES[profileName] || PROFILES.normal
}

function charDelay(profile: TypingProfile): number {
  // Gaussian-distributed around base WPM
  const baseMs = (60 / (profile.wpm * 5)) * 1000 // avg ms per char
  const jitter = (Math.random() - 0.5) * baseMs * 0.5
  return Math.max(20, baseMs + jitter)
}

function nearbyKey(char: string): string {
  const keyboard: Record<string, string[]> = {
    'a': ['s', 'q', 'z'], 'e': ['r', 'w', 'd'], 'i': ['u', 'o', 'k'],
    'o': ['i', 'p', 'l'], 'n': ['m', 'b', 'h'], 's': ['a', 'd', 'w'],
    't': ['r', 'y', 'g'], 'r': ['e', 't', 'f'], 'h': ['g', 'j', 'y'],
    'l': ['k', 'o', 'p'], 'd': ['s', 'f', 'e'], 'u': ['y', 'i', 'j'],
  }
  const nearby = keyboard[char.toLowerCase()]
  if (!nearby) return char
  return nearby[Math.floor(Math.random() * nearby.length)]
}

export async function humanTypeText(page: Page, selector: string, text: string, profileName: 'fast' | 'normal' | 'slow' = 'normal'): Promise<void> {
  const profile = getProfile(profileName)
  const el = await page.$(selector)
  if (!el) return
  
  await el.click()
  // Triple-click to select all existing content so new text replaces it
  await el.click({ clickCount: 3 })
  await new Promise(r => setTimeout(r, 100 + Math.random() * 200))

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    
    // Random typo
    if (Math.random() < profile.errorRate && char.match(/[a-z]/i)) {
      const typoChar = nearbyKey(char)
      await page.keyboard.type(typoChar)
      await new Promise(r => setTimeout(r, charDelay(profile)))
      
      // Correction delay
      await new Promise(r => setTimeout(r, profile.correctionDelay + Math.random() * 300))
      await page.keyboard.press('Backspace')
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100))
    }
    
    // Type actual character
    await page.keyboard.type(char)
    
    // Longer pause at spaces (simulates word completion)
    if (char === ' ') {
      await new Promise(r => setTimeout(r, charDelay(profile) * 1.5))
    } else {
      await new Promise(r => setTimeout(r, charDelay(profile)))
    }

    // Random mid-typing pause (thinking)
    if (Math.random() < 0.02) {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1500))
    }
  }
}
