import { inngest } from './client'
import { scrapeAllSubreddits, DEFAULT_SUBREDDITS } from '@/scrapers/reddit'
import { createClient } from '@supabase/supabase-js'
import { scoreLeadPost } from '@/lib/scoring'

export const scrapeJob = inngest.createFunction(
  {
    id: 'scrape-reddit',
    name: 'Scrape Reddit Leads',
    triggers: [{ cron: '0 */6 * * *' }],
  },
  async ({ step }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('is_active', true)

    console.log('Found campaigns:', campaigns?.length, error)

    if (!campaigns?.length) {
      console.log('No active campaigns found')
      return { message: 'No active campaigns' }
    }

    for (const campaign of campaigns) {
      await step.run(`scrape-campaign-${campaign.id}`, async () => {
        const subreddits = campaign.subreddits?.length
          ? campaign.subreddits
          : DEFAULT_SUBREDDITS

        const posts = await scrapeAllSubreddits(
          subreddits,
          campaign.keywords || []
        )

        if (posts.length > 0) {
          // Score all posts first
          const scored = await Promise.all(
            posts.map(async post => {
              const { score, reason } = await scoreLeadPost(post)
              return { post, score, reason }
            })
          )

          const minScore = campaign.min_score ?? 6
          const passing = scored.filter(s => s.score >= minScore)

          if (passing.length > 0) {
            await supabase.from('leads').insert(
              passing.map(({ post, score, reason }) => ({
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
          }
          
          console.log(`✅ Saved ${passing.length} leads (out of ${posts.length} found) for campaign: ${campaign.name}`)
          return { saved: passing.length }
        }

        return { saved: 0 }
      })
    }
  }
)
