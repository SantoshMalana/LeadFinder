import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scoreJobMatch } from '@/lib/scoring'

export async function POST(req: NextRequest) {
  try {
    const { title, company, description, location, job_type, source, job_url, user_id } = await req.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: profile } = await supabase
      .from('profiles')
      .select('parsed_data, job_preferences')
      .eq('user_id', user_id)
      .single()

    if (!profile?.parsed_data) {
      return NextResponse.json({ error: 'No parsed profile. Upload and parse CV first.' }, { status: 400 })
    }

    const result = await scoreJobMatch(
      { title, company, description, location, job_type },
      profile.parsed_data,
      profile.job_preferences
    )

    // Auto-insert as discovered job
    const threshold = profile.job_preferences?.auto_apply_threshold ?? 7
    const status = result.should_apply && result.score >= threshold ? 'queued' : 'discovered'

    const { data: job } = await supabase.from('jobs').insert({
      user_id,
      source: source || 'linkedin',
      company, title, description, location,
      job_url: job_url || '',
      job_type,
      match_score: result.score,
      match_reason: result.reason,
      status,
    }).select().single()

    return NextResponse.json({
      score: result.score,
      reason: result.reason,
      should_apply: result.should_apply,
      status,
      job_id: job?.id,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Match failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
