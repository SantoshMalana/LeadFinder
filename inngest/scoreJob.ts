import { inngest } from './client'
import { scoreLeadPost } from '@/lib/scoring'
import { createClient } from '@supabase/supabase-js'

export const scoreJob = inngest.createFunction(
  {
    id: 'score-leads',
    name: 'Score Leads with AI',
    triggers: [{ cron: '15 */6 * * *' }],
  },
  async ({ step }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: leads } = await supabase
      .from('leads')
      .select('*, campaigns(min_score)')
      .is('score', null)
      .limit(50)

    console.log('Unscored leads found:', leads?.length)

    if (!leads?.length) {
      return { message: 'No unscored leads' }
    }

    // Score all leads in parallel via canonical scoreLeadPost
    const scored = await step.run('score-all-leads', async () => {
      return Promise.all(
        leads.map(async (lead) => {
          const { score, reason } = await scoreLeadPost({
            post_title: lead.post_title,
            post_body: lead.post_body,
          })
          return { lead, score, reason }
        })
      )
    })

    // Separate into updates and deletes
    const toUpdate = scored.filter(({ lead, score }) => score >= (lead.campaigns?.min_score ?? 7))
    const toDelete = scored.filter(({ lead, score }) => score < (lead.campaigns?.min_score ?? 7))

    // Batch update
    if (toUpdate.length > 0) {
      await step.run('batch-update-leads', async () => {
        return Promise.all(
          toUpdate.map(({ lead, score, reason }) =>
            supabase.from('leads').update({ score, score_reason: reason }).eq('id', lead.id)
          )
        )
      })
    }

    // Batch delete
    if (toDelete.length > 0) {
      const deleteIds = toDelete.map(({ lead }) => lead.id)
      await step.run('batch-delete-leads', async () => {
        return supabase.from('leads').delete().in('id', deleteIds)
      })
    }

    return { updated: toUpdate.length, deleted: toDelete.length }
  }
)
