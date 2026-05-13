import { RawPost } from '@/types'
import { redis } from '@/lib/redis'

export const DEFAULT_SUBREDDITS = [
  'forhire',
  'slavelabour',
  'startups',
  'entrepreneur',
  'webdev',
  'hiring',
]

interface RedditChild {
  data: {
    id: string
    title: string
    selftext: string
    permalink: string
    author: string
    subreddit: string
  }
}

const TTL_30_DAYS = 60 * 60 * 24 * 30

/**
 * Batch-check + batch-mark duplicate post IDs via Redis pipeline.
 * Returns a Set of IDs that are NOT yet seen (fresh), and marks them all seen atomically.
 */
async function filterAndMarkFresh(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()

  // Pipeline: MGET all keys in one round-trip
  const keys = ids.map(id => `seen:${id}`)
  const results = await redis.mget<(string | null)[]>(...keys)

  const freshIds = new Set<string>()
  const pipeline = redis.pipeline()

  for (let i = 0; i < ids.length; i++) {
    if (results[i] === null) {
      // Not seen yet — mark it and collect it
      freshIds.add(ids[i])
      pipeline.set(keys[i], '1', { ex: TTL_30_DAYS })
    }
  }

  if (freshIds.size > 0) await pipeline.exec()

  return freshIds
}

export async function scrapeSubreddit(
  subreddit: string,
  keywords: string[],
  limit = 100
): Promise<RawPost[]> {
  try {
    console.log(`🔍 Scraping r/${subreddit}...`)

    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/new/.json?limit=${limit}`,
      {
        headers: { 'User-Agent': 'LeadFinder/1.0' },
        // 8s hard timeout per subreddit — don't let one slow sub block others
        signal: AbortSignal.timeout(8_000),
      }
    )

    if (!res.ok) {
      console.error(`❌ r/${subreddit} returned ${res.status}`)
      return []
    }

    const json = await res.json()
    const posts: RedditChild[] = json?.data?.children || []

    // 1. Keyword filter first (pure CPU — no I/O)
    const lowKw = keywords.map(k => k.toLowerCase())
    const candidates = posts.filter(({ data: p }) => {
      const text = (p.title + ' ' + p.selftext).toLowerCase()
      return lowKw.some(kw => text.includes(kw))
    })

    if (!candidates.length) {
      console.log(`✅ r/${subreddit} → 0 new matching posts`)
      return []
    }

    // 2. Batch dedup — single Redis round-trip for all candidates
    const ids = candidates.map(({ data: p }) => p.id)
    const freshIds = await filterAndMarkFresh(ids)

    const results: RawPost[] = candidates
      .filter(({ data: p }) => freshIds.has(p.id))
      .map(({ data: p }) => ({
        post_id:    p.id,
        post_title: p.title,
        post_body:  p.selftext || '',
        post_url:   `https://reddit.com${p.permalink}`,
        author:     p.author || 'unknown',
        platform:   'reddit',
        subreddit:  p.subreddit,
      }))

    console.log(`✅ r/${subreddit} → ${results.length} new matching posts`)
    return results

  } catch (err) {
    console.error(`❌ Failed r/${subreddit}:`, err)
    return []
  }
}

/**
 * Scrape all subreddits in parallel (no more sequential + delay loop).
 * Uses Promise.allSettled so a single failed sub doesn't abort the rest.
 */
export async function scrapeAllSubreddits(
  subreddits: string[],
  keywords: string[]
): Promise<RawPost[]> {
  const settled = await Promise.allSettled(
    subreddits.map(sub => scrapeSubreddit(sub, keywords))
  )

  const all: RawPost[] = []
  for (const result of settled) {
    if (result.status === 'fulfilled') all.push(...result.value)
  }

  console.log(`\n🎯 Total leads found: ${all.length}`)
  return all
}