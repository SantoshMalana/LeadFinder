import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { verifyRequest } from '@/lib/sign'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    
    // Path 1: internal daemon call — HMAC signed, passes user_id as param
    const hmacTimestamp = req.headers.get('X-Timestamp') || ''
    const hmacSig       = req.headers.get('X-Signature')  || ''
    const paramUserId   = searchParams.get('user_id')

    if (hmacTimestamp && hmacSig && paramUserId) {
      // Verify signature over the query string
      const payload = `user_id=${paramUserId}`
      if (!verifyRequest(payload, hmacTimestamp, hmacSig)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
      return buildStatusResponse(paramUserId)
    }

    // Path 2: browser session call
    const authClient = await createAuthClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    
    return buildStatusResponse(user.id)
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function buildStatusResponse(userId: string) {
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
}
