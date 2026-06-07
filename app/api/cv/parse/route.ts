import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { structureCV } from '@/lib/cv-parser'

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
      .select('raw_cv_text')
      .eq('user_id', userId)
      .single()

    if (!profile?.raw_cv_text) {
      return NextResponse.json({ error: 'No CV text found. Upload a CV first.' }, { status: 400 })
    }

    const parsedData = await structureCV(profile.raw_cv_text)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
        parsed_data: parsedData,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, parsed: parsedData })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Parse failed'
    console.error('CV PARSE ERROR:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
