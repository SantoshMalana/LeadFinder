import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scrapeAllSubreddits, DEFAULT_SUBREDDITS } from '@/scrapers/reddit'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (!campaigns?.length) {
      return NextResponse.json({ message: 'No active campaigns' })
    }

    let totalSaved = 0

    for (const campaign of campaigns) {
      const subreddits = campaign.subreddits?.length
        ? campaign.subreddits
        : DEFAULT_SUBREDDITS

      const posts = await scrapeAllSubreddits(subreddits, campaign.keywords || [])

      for (const post of posts) {
        await supabase.from('leads').insert({
          campaign_id: campaign.id,
          platform: post.platform,
          post_id: post.post_id,
          post_title: post.post_title,
          post_body: post.post_body,
          post_url: post.post_url,
          author: post.author,
          status: 'new',
        })
        totalSaved++
      }
    }

    return NextResponse.json({ success: true, saved: totalSaved })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
