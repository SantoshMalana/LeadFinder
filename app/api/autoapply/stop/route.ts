import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    let userId: string | null = null
    try {
      const body = await req.json()
      userId = body.user_id || null
    } catch {}

    if (!userId) {
      const authClient = await createAuthClient()
      const { data: { user } } = await authClient.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      userId = user.id
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase
      .from('profiles')
      .update({ autoapply_running: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)

    return NextResponse.json({ stopped: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
