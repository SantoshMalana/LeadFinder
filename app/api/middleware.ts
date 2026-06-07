import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/sign'

/**
 * Wraps a Next.js API route handler to enforce HMAC signature verification.
 * Internal agent-to-API calls MUST be signed with X-Timestamp and X-Signature headers.
 * Requests older than 30 seconds are rejected to prevent replay attacks.
 */
export function withInternalAuth(
  handler: (req: NextRequest, body: string) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const timestamp = req.headers.get('X-Timestamp') || ''
    const sig = req.headers.get('X-Signature') || ''

    // Read body once
    const body = await req.text()

    // If signature headers are present, validate them
    if (timestamp && sig) {
      if (!verifyRequest(body, timestamp, sig)) {
        return NextResponse.json(
          { error: 'Invalid signature or expired request' },
          { status: 401 }
        )
      }
    }

    // Pass the already-consumed body to the handler
    return handler(req, body)
  }
}
