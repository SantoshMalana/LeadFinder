import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const exhaustedKeys = new Map<string, number>()

export function markKeyExhausted(key: string, cooldownMs = 60000) {
  if (!key) return
  console.log(`[AI Key] Marking key starting with ${key.slice(0, 8)}... as exhausted for ${cooldownMs / 1000}s`)
  exhaustedKeys.set(key, Date.now() + cooldownMs)
}

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

  const now = Date.now()
  const uniqueKeys = Array.from(new Set(keys))
  const validKeys = uniqueKeys.filter(k => {
    const exp = exhaustedKeys.get(k)
    return !exp || now > exp
  })

  // Fallback to all keys if all are exhausted
  return validKeys.length > 0 ? validKeys : uniqueKeys
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
