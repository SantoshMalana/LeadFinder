import crypto from 'crypto'

// Use a fallback for build time, but throw in production if missing
const getSecret = () => {
  const secret = process.env.INTERNAL_HMAC_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('INTERNAL_HMAC_SECRET not set in .env.local')
    }
    return 'dev-fallback-secret'
  }
  return secret
}

export function signRequest(body: unknown): Record<string, string> {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  const timestamp = Date.now().toString()
  const sig = crypto
    .createHmac('sha256', getSecret())
    .update(`${timestamp}.${payload}`)
    .digest('hex')

  return {
    'X-Timestamp': timestamp,
    'X-Signature': sig,
    'Content-Type': 'application/json',
  }
}

export function verifyRequest(body: string, timestamp: string, sig: string): boolean {
  if (!timestamp || !sig) return false
  
  const age = Date.now() - parseInt(timestamp)
  if (age > 30000) return false // Reject requests older than 30s

  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(`${timestamp}.${body}`)
    .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}
