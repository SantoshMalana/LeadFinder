import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const authClient = await createAuthClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const userId = user.id

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: profile } = await supabase
      .from('profiles')
      .select('autoapply_running, job_preferences, parsed_data')
      .eq('user_id', userId)
      .single()

    const today = new Date().toISOString().split('T')[0]
    const { count: todayApplied } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'applied')
      .gte('applied_at', today)

    const { data: recentJobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userId)
      .order('discovered_at', { ascending: false })
      .limit(10)

    const { data: queuedJobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'queued')
      .order('match_score', { ascending: false })
      .limit(20)

    return NextResponse.json({
      is_running: profile?.autoapply_running ?? false,
      today_applied: todayApplied || 0,
      today_limit: profile?.job_preferences?.max_applications_per_day || 25,
      threshold: profile?.job_preferences?.auto_apply_threshold || 7,
      recent_jobs: recentJobs || [],
      queued_jobs: queuedJobs || [],
      parsed_data: profile?.parsed_data || null,
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
