import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { scrapeAllSubreddits, DEFAULT_SUBREDDITS } from '@/scrapers/reddit'
import { groq } from '@/lib/groq'
import type { Campaign } from '@/types'

interface RawPost {
  post_id: string
  post_title: string
  post_body?: string
  post_url: string
  author: string
  platform: string
}

async function scorePost(post: RawPost): Promise<{ score: number; reason: string }> {
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Score this Reddit post 1-10 for freelance/hiring intent.
9-10: Direct hire. "Need React dev", "hiring freelancer"
7-8: Strong implied. "Need a website", "looking for developer"
4-6: Tangential
1-3: Not a lead

Post: ${post.post_title}
${post.post_body?.slice(0, 200) || ''}

JSON only: {"score": 8, "reason": "one sentence"}`,
      }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 60,
    })

    const { score, reason } = JSON.parse(res.choices[0].message.content || '{}')
    return { score: Number(score) || 0, reason: reason || '' }
  } catch {
    return { score: 0, reason: 'scoring failed' }
  }
}

async function processCampaign(
  campaign: Campaign,
  supabase: SupabaseClient
): Promise<number> {
  const subreddits = campaign.subreddits?.length ? campaign.subreddits : DEFAULT_SUBREDDITS

  // All subreddits scraped in parallel (fixed in reddit.ts)
  const posts = await scrapeAllSubreddits(subreddits, campaign.keywords || [])
  if (!posts.length) return 0

  // Score ALL posts in parallel — Groq is fast enough, no need for batching waterfall
  const scored = await Promise.all(
    posts.map(async post => {
      const { score, reason } = await scorePost(post)
      return { post, score, reason }
    })
  )

  const minScore = campaign.min_score ?? 6
  const goodLeads = scored.filter(p => p.score >= minScore)
  if (!goodLeads.length) return 0

  const { error } = await supabase.from('leads').insert(
    goodLeads.map(({ post, score, reason }) => ({
      campaign_id: campaign.id,
      platform:    post.platform,
      post_id:     post.post_id,
      post_title:  post.post_title,
      post_body:   post.post_body,
      post_url:    post.post_url,
      author:      post.author,
      score,
      score_reason: reason,
      status:      'new',
    }))
  )

  if (error) console.error('Insert error:', error.message)
  return goodLeads.length
}

export async function POST() {
  try {
    const supabase: SupabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .eq('is_active', true)

    if (!campaigns?.length) {
      return NextResponse.json({ message: 'No active campaigns' })
    }

    // All campaigns processed in parallel
    const counts = await Promise.all(
      campaigns.map(c => processCampaign(c, supabase))
    )

    const totalSaved = counts.reduce((a, b) => a + b, 0)
    return NextResponse.json({ success: true, saved: totalSaved })

  } catch (err: unknown) {
    console.error('Scrape error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}