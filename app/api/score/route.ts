import { NextResponse } from 'next/server'
import { groq } from '@/lib/groq'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get unscored leads for this user
    const { data: leads } = await supabase
      .from('leads')
      .select('*, campaigns!inner(user_id, min_score)')
      .eq('campaigns.user_id', user.id)
      .is('score', null)
      .limit(20)

    if (!leads?.length) {
      return NextResponse.json({ message: 'No unscored leads' })
    }

    let scored = 0

    for (const lead of leads) {
      const prompt = `You are a lead scoring AI for a freelance full-stack developer.

Score this post 1-10 for hiring intent.
9-10: Direct hire. "Need React dev", "hiring freelancer"
7-8: Strong implied. "Need a website", "freelancer recommendations"
4-6: Tangential. Tech discussion without hiring need
1-3: Not a lead at all

Post: ${lead.post_title}
${lead.post_body?.slice(0, 400) || ''}

JSON only: {"score": 8, "reason": "..."}`

      const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      })

      const { score, reason } = JSON.parse(res.choices[0].message.content || '{}')
      const minScore = lead.campaigns?.min_score ?? 7

      if (score >= minScore) {
        await supabase
          .from('leads')
          .update({ score, score_reason: reason })
          .eq('id', lead.id)
        scored++
      } else {
        await supabase.from('leads').delete().eq('id', lead.id)
      }
    }

    return NextResponse.json({ success: true, scored })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
