import { RawPost } from '@/types'
import { isDuplicate, markAsSeen } from './dedup'

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

export async function scrapeSubreddit(
  subreddit: string,
  keywords: string[],
  limit = 100
): Promise<RawPost[]> {
  try {
    console.log(`🔍 Scraping r/${subreddit}...`)

    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/new/.json?limit=${limit}`,
      { headers: { 'User-Agent': 'LeadFinder/1.0' } }
    )

    if (!res.ok) {
      console.error(`❌ r/${subreddit} returned ${res.status}`)
      return []
    }

    const json = await res.json()
    const posts: RedditChild[] = json?.data?.children || []
    const results: RawPost[] = []

    for (const { data: post } of posts) {
      const duplicate = await isDuplicate(post.id)
      if (duplicate) continue

      const text = (post.title + ' ' + post.selftext).toLowerCase()
      const hasKeyword = keywords.some(kw => text.includes(kw.toLowerCase()))
      if (!hasKeyword) continue

      await markAsSeen(post.id)

      results.push({
        post_id: post.id,
        post_title: post.title,
        post_body: post.selftext || '',
        post_url: `https://reddit.com${post.permalink}`,
        author: post.author || 'unknown',
        platform: 'reddit',
        subreddit: post.subreddit,
      })
    }

    console.log(`✅ r/${subreddit} → ${results.length} new matching posts`)
    return results

  } catch (err) {
    console.error(`❌ Failed r/${subreddit}:`, err)
    return []
  }
}

export async function scrapeAllSubreddits(
  subreddits: string[],
  keywords: string[]
): Promise<RawPost[]> {
  const all: RawPost[] = []
  for (const sub of subreddits) {
    const posts = await scrapeSubreddit(sub, keywords)
    all.push(...posts)
    await new Promise(r => setTimeout(r, 1500))
  }
  console.log(`\n🎯 Total leads found: ${all.length}`)
  return all
}