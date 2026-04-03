import { inngest } from './client'
import { groq } from '@/lib/groq'
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

    for (const lead of leads) {
      await step.run(`score-lead-${lead.id}`, async () => {
        const prompt = `You are a lead scoring AI for a freelance full-stack developer.

Score this post 1-10 for hiring/buying intent.
9-10: Direct hire. "Need React dev", "hiring freelancer", "looking for developer"
7-8: Strong implied. "Need a website", "freelancer recommendations?"
4-6: Tangential. Tech discussion without clear hiring need
1-3: Not a lead. News, opinions, memes

Post Title: ${lead.post_title}
Post Body: ${lead.post_body?.slice(0, 500) || 'No body'}

JSON only: {"score": 8, "reason": "one sentence explanation"}`

        const res = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        })

        const content = res.choices[0].message.content || '{}'
        const { score, reason } = JSON.parse(content)

        console.log(`Lead: "${lead.post_title.slice(0, 40)}" → Score: ${score}`)

        const minScore = lead.campaigns?.min_score ?? 7

        if (score >= minScore) {
          await supabase
            .from('leads')
            .update({ score, score_reason: reason })
            .eq('id', lead.id)
        } else {
          await supabase.from('leads').delete().eq('id', lead.id)
        }

        return { score, reason }
      })
    }
  }
)
