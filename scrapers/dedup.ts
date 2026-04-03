import { redis } from '@/lib/redis'

const TTL_30_DAYS = 60 * 60 * 24 * 30

export async function isDuplicate(postId: string): Promise<boolean> {
  const key = `seen:${postId}`
  const exists = await redis.get(key)
  return exists !== null
}

export async function markAsSeen(postId: string): Promise<void> {
  const key = `seen:${postId}`
  await redis.set(key, '1', { ex: TTL_30_DAYS })
}