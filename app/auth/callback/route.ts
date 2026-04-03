import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Create user profile in our users table if first time
      await supabase.from('users').upsert({
        id: data.user.id,
        email: data.user.email!,
        name: data.user.user_metadata?.full_name || null,
        plan: 'free',
      }, { onConflict: 'id' })
    }
  }

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/`)
}
