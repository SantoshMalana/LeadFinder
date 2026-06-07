import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic' // Ensure Vercel doesn't cache this route

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'agent'
    const limit = parseInt(searchParams.get('limit') || '50')
    const userId = searchParams.get('user_id')

    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    const authClient = await createAuthClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    
    // Connect to Upstash Redis
    const redis = Redis.fromEnv()
    const listKey = type === 'telegram' ? 'telegram_logs' : 'agent_logs'
    const logs = await redis.lrange(listKey, 0, limit - 1)
    const reversed = [...logs].reverse().map(l => typeof l === 'string' ? l : JSON.stringify(l)).join('\n')

    return NextResponse.json({ logs: reversed })
  } catch (err) {
    console.error('Redis log error:', err)
    return NextResponse.json({ logs: 'Error reading logs from database' }, { status: 500 })
  }
}
