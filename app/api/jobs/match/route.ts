import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { scoreJobMatch } from '@/lib/scoring'
import { verifyRequest } from '@/lib/sign'

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text()
    const payload = JSON.parse(bodyText)

    const hmacTimestamp = req.headers.get('X-Timestamp') || ''
    const hmacSig = req.headers.get('X-Signature') || ''
    
    let user_id = payload.user_id

    // Check auth
    const hasValidHmac = hmacTimestamp && hmacSig && verifyRequest(bodyText, hmacTimestamp, hmacSig)
    if (!hasValidHmac) {
      const authClient = await createAuthClient()
      const { data: { user } } = await authClient.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      user_id = user.id
    }

    if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

    const { title, company, description, location, job_type, source, job_url, persona_used, cv_version } = payload
    if (!title || !company) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    
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

    if (job_url) {
      const { data: existing } = await supabase.from('jobs').select('id').eq('user_id', user_id).eq('job_url', job_url).maybeSingle()
      if (existing) return NextResponse.json({ error: 'Job already exists' }, { status: 400 })
    }

    const result = await scoreJobMatch(
      { title, company, description, location, job_type },
      profile.parsed_data,
      profile.job_preferences
    )

    // Auto-insert as discovered job
    const threshold = profile.job_preferences?.auto_apply_threshold ?? 7
    const status = result.should_apply && result.score >= threshold ? 'queued' : 'discovered'

    const { data: job, error: insertError } = await supabase.from('jobs').insert({
      user_id,
      source: source || 'linkedin',
      company, title, description, location,
      job_url: job_url || '',
      job_type,
      match_score: result.score,
      match_reason: result.reason,
      status,
      persona_used: persona_used || 'default',
      cv_version: cv_version || 'v1',
    }).select().single()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

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
