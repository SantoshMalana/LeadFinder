import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scoreLeadPost } from '@/lib/scoring'

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

    const scoredResults = await Promise.all(
      leads.map(async (lead) => {
        const { score, reason } = await scoreLeadPost(lead)
        return { lead, score, reason }
      })
    )

    const toUpdate: any[] = []
    const toDelete: string[] = []

    for (const result of scoredResults) {
      const minScore = result.lead.campaigns?.min_score ?? 7
      if (result.score >= minScore) {
        toUpdate.push({
          id: result.lead.id,
          score: result.score,
          score_reason: result.reason,
        })
      } else {
        toDelete.push(result.lead.id)
      }
    }

    // Process deletes
    if (toDelete.length > 0) {
      await supabase.from('leads').delete().in('id', toDelete)
    }

    // Process updates (upsert to handle batching)
    if (toUpdate.length > 0) {
      // Supabase upsert works as batch update if IDs exist
      // But we need to make sure we only update score and score_reason, not nullifying other fields.
      // So we use individual updates in a Promise.all or an upsert with full row if we read it.
      // Since we didn't read all fields explicitly (we did select * though), we could upsert.
      // Alternatively, just Promise.all updates:
      await Promise.all(
        toUpdate.map(u => 
          supabase.from('leads').update({ score: u.score, score_reason: u.score_reason }).eq('id', u.id)
        )
      )
    }

    return NextResponse.json({ success: true, scored: toUpdate.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
