import { inngest } from './client'
import { scrapeAllSubreddits, DEFAULT_SUBREDDITS } from '@/scrapers/reddit'
import { createClient } from '@supabase/supabase-js'

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
        }

        console.log(`✅ Saved ${posts.length} leads for campaign: ${campaign.name}`)
        return { saved: posts.length }
      })
    }
  }
)
