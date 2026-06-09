import { inngest } from './client'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY!)

export const alertJob = inngest.createFunction(
  {
    id: 'alert-leads',
    name: 'Alert on High Score Leads',
    triggers: [{ cron: '30 */6 * * *' }],
  },
  async ({ step }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: leads } = await supabase
      .from('leads')
      .select('*, campaigns(*)')
      .gte('score', 9)
      .eq('status', 'new')
      .limit(20)

    if (!leads?.length) {
      return { message: 'No high score leads to alert' }
    }

    for (const lead of leads) {
      await step.run(`alert-lead-${lead.id}`, async () => {
        const userId = lead.campaigns?.user_id
        if (!userId) return

        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId)
        if (!authUser?.email) return

        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: authUser.email,
          subject: `🔥 ${lead.score}/10 lead: ${lead.post_title.slice(0, 60)}`,
          html: `
            <h2>🔥 New High-Intent Lead!</h2>
            <p><strong>Score:</strong> ${lead.score}/10</p>
            <p><strong>Why:</strong> ${lead.score_reason}</p>
            <p><strong>Post:</strong> ${lead.post_title}</p>
            <a href="${lead.post_url}" style="background:#7c3aed;color:white;padding:10px 20px;border-radius:8px;text-decoration:none">
              View Post →
            </a>
            <br/><br/>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}">Open Dashboard →</a>
          `,
        })

        await supabase
          .from('leads')
          .update({ status: 'seen' })
          .eq('id', lead.id)
      })
    }

    return { alerted: leads.length }
  }
)
