import { Redis } from '@upstash/redis'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const redis = Redis.fromEnv()

const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]'],
  [/\+?\d[\d\s\-().]{7,}\d/g, '[PHONE]'],
  [/(?:Bearer\s+)[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [TOKEN]'],
  [/(?:password|passwd|secret|key|token)\s*[:=]\s*\S+/gi, '[REDACTED]'],
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]'],
]

export function scrubPII(text: string): string {
  let scrubbed = text
  for (const [pattern, replacement] of PII_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement)
  }
  return scrubbed
}

export function createLogger(namespace: string, userId?: string) {
  const logKey = userId ? `agent_logs:${userId}` : 'agent_logs'
  return {
    info: (msg: string, ...args: unknown[]) => {
      const cleanArgs = args.length > 0 ? ' ' + scrubPII(JSON.stringify(args)) : ''
      const cleanMsg = scrubPII(`[${namespace}] ${msg}${cleanArgs}`)
      const line = `[${new Date().toLocaleTimeString()}] ${cleanMsg}`
      console.log(line)
      redis.lpush(logKey, line).catch(() => {})
      redis.ltrim(logKey, 0, 200).catch(() => {})
    },
    error: (msg: string, err?: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err)
      const clean = scrubPII(`[${namespace}] ERROR: ${msg} — ${errMsg}`)
      console.error(clean)
      redis.lpush(logKey, `[${new Date().toLocaleTimeString()}] ${clean}`).catch(() => {})
    },
    warn: (msg: string) => {
      const clean = scrubPII(`[${namespace}] WARN: ${msg}`)
      console.warn(clean)
    },
  }
}
