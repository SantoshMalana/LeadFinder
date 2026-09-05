import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

let redisInstance: Redis | null = null
let redisUnavailable = false
let lastRedisAttempt = 0
const REDIS_RETRY_INTERVAL = 60_000 // retry Redis connection every 60s

function getRedis(): Redis | null {
  if (redisInstance) return redisInstance

  // If Redis was previously unreachable, only retry after the cooldown
  if (redisUnavailable && Date.now() - lastRedisAttempt < REDIS_RETRY_INTERVAL) {
    return null
  }

  try {
    lastRedisAttempt = Date.now()
    redisInstance = Redis.fromEnv()
    redisUnavailable = false
    return redisInstance
  } catch {
    redisUnavailable = true
    return null
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'agent'
    const limit = parseInt(searchParams.get('limit') || '50')

    const authClient = await createAuthClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const userId = user.id

    const redis = getRedis()
    if (!redis) {
      // Return empty logs with 200 — Redis is simply unavailable, not an error
      return NextResponse.json({
        logs: 'No live logs available — log store is offline.',
        status: 'unavailable',
      })
    }

    const listKey = type === 'telegram' ? `telegram_logs:${userId}` : `agent_logs:${userId}`
    const logs = await redis.lrange(listKey, 0, limit - 1)
    const reversed = [...logs]
      .reverse()
      .map(l => typeof l === 'string' ? l : JSON.stringify(l))
      .join('\n')

    return NextResponse.json({ logs: reversed })
  } catch (err: unknown) {
    console.error('Redis log error:', err)

    // Mark Redis as unavailable so we don't keep hammering a dead connection
    redisInstance = null
    redisUnavailable = true
    lastRedisAttempt = Date.now()

    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({
      logs: `Log store temporarily unavailable: ${message}`,
      status: 'error',
    })
    // Return 200 — the terminal can still display the message without flooding 500s
  }
}
