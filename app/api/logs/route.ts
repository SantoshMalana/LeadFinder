import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

export const dynamic = 'force-dynamic' // Ensure Vercel doesn't cache this route

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const source = searchParams.get('source') || 'agent'
    
    // Connect to Upstash Redis
    const redis = Redis.fromEnv()
    const listName = source === 'telegram' ? 'telegram_logs' : 'agent_logs'
    
    // Fetch last 100 logs
    const logs = await redis.lrange(listName, 0, 100)
    
    if (!logs || logs.length === 0) {
      return NextResponse.json({ logs: `Waiting for ${source} agent to start or no recent logs...` })
    }

    // Upstash returns newest first (since we use lpush), reverse to show chronological order
    const reversed = [...logs].reverse().join('\n')

    return NextResponse.json({ logs: reversed })
  } catch (err) {
    console.error('Redis log error:', err)
    return NextResponse.json({ logs: 'Error reading logs from database' }, { status: 500 })
  }
}
