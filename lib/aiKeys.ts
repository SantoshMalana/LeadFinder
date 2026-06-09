import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

function getKeys(prefix: string): string[] {
  const keys: string[] = []
  // Check exact match (e.g. GROQ_API_KEY)
  if (process.env[prefix]) {
    // some keys might be comma separated strings
    const split = process.env[prefix]!.split(',').map(s => s.trim()).filter(Boolean)
    keys.push(...split)
  }
  
  // Check _N variants (e.g. GROQ_API_KEY_2)
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix + '_') && value) {
      const split = value.split(',').map(s => s.trim()).filter(Boolean)
      keys.push(...split)
    }
  }

  // Check plural variant (e.g. GEMINI_API_KEYS)
  const plural = prefix + 'S'
  if (process.env[plural]) {
    const split = process.env[plural]!.split(',').map(s => s.trim()).filter(Boolean)
    keys.push(...split)
  }

  return Array.from(new Set(keys))
}

export function getRandomGroqKey(): string {
  const keys = getKeys('GROQ_API_KEY')
  if (keys.length === 0) return ''
  return keys[Math.floor(Math.random() * keys.length)]
}

export function getRandomGeminiKey(): string {
  const keys = getKeys('GEMINI_API_KEY')
  if (keys.length === 0) return ''
  return keys[Math.floor(Math.random() * keys.length)]
}

export function getRandomGemini3Key(): string {
  const keys = getKeys('GEMINI3_API_KEY')
  if (keys.length === 0) return ''
  return keys[Math.floor(Math.random() * keys.length)]
}

export function getRandomCerebrasKey(): string {
  const keys = getKeys('CEREBRAS_API_KEY')
  if (keys.length === 0) return ''
  return keys[Math.floor(Math.random() * keys.length)]
}
