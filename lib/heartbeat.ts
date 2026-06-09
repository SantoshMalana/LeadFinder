import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export async function sendHeartbeat(agentName: string, userId: string) {
  const key = `heartbeat:${agentName}:${userId}`
  await redis.set(key, Date.now().toString(), { ex: 300 }) // 5min TTL
}

export async function isAgentAlive(agentName: string, userId: string): Promise<boolean> {
  const key = `heartbeat:${agentName}:${userId}`
  return (await redis.get(key)) !== null
}
