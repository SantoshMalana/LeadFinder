import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
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
      .select('parsed_data, job_preferences')
      .eq('user_id', userId)
      .single()

    if (!profile?.parsed_data) {
      return NextResponse.json({ error: 'Upload and parse your CV first' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ autoapply_running: true, updated_at: new Date().toISOString() })
      .eq('user_id', userId)

    if (updateError) throw updateError

    return NextResponse.json({
      started: true,
      config: {
        max_daily: profile.job_preferences?.max_applications_per_day || 25,
        threshold: profile.job_preferences?.auto_apply_threshold || 7,
        roles: profile.job_preferences?.roles || [],
        locations: profile.job_preferences?.locations || [],
      },
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
