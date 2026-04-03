import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scrapeAllSubreddits, DEFAULT_SUBREDDITS } from '@/scrapers/reddit'
import { groq } from '@/lib/groq'

async function scorePost(post: any, minScore: number) {
  try {
    const prompt = `Score this post 1-10 for hiring/freelance intent.
9-10: Direct hire. "Need React dev", "hiring freelancer"
7-8: Strong implied. "Need a website", "looking for developer"  
4-6: Tangential
1-3: Not a lead

Post: ${post.post_title}
${post.post_body?.slice(0, 200) || ''}

JSON only: {"score": 8, "reason": "one sentence"}`

    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 60,
    })

    const { score, reason } = JSON.parse(res.choices[0].message.content || '{}')
    return { score, reason }
  } catch {
    return { score: 0, reason: 'scoring failed' }
  }
}

export async function POST() {
  try {
    const supabase = createClient(
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

    let totalSaved = 0

    for (const campaign of campaigns) {
      const subreddits = campaign.subreddits?.length
        ? campaign.subreddits
        : DEFAULT_SUBREDDITS

      // Scrape all subreddits
      const posts = await scrapeAllSubreddits(subreddits, campaign.keywords || [])

      if (!posts.length) continue

      // Score in parallel batches of 5
      const BATCH_SIZE = 5
      const scoredPosts: { post: any; score: number; reason: string }[] = []

      for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch = posts.slice(i, i + BATCH_SIZE)
        const scores = await Promise.all(
          batch.map(post => scorePost(post, campaign.min_score))
        )
        batch.forEach((post, idx) => {
          scoredPosts.push({ post, ...scores[idx] })
        })
      }

      // Save only high score leads
      const goodLeads = scoredPosts.filter(p => p.score >= (campaign.min_score ?? 6))

      if (goodLeads.length) {
        await supabase.from('leads').insert(
          goodLeads.map(({ post, score, reason }) => ({
            campaign_id: campaign.id,
            platform: post.platform,
            post_id: post.post_id,
            post_title: post.post_title,
            post_body: post.post_body,
            post_url: post.post_url,
            author: post.author,
            score,
            score_reason: reason,
            status: 'new',
          }))
        )
        totalSaved += goodLeads.length
      }
    }

    return NextResponse.json({ success: true, saved: totalSaved })

  } catch (err: any) {
    console.error('Scrape error:', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}