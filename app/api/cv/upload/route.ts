import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { extractTextFromPDF } from '@/lib/cv-parser'

export async function POST(req: NextRequest) {
  try {
    // Authenticate user via cookies first, fall back to header for agent calls
    let userId = req.headers.get('x-user-id')
    if (!userId) {
      const authClient = await createAuthClient()
      const { data: { user } } = await authClient.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      userId = user.id
    }

    const formData = await req.formData()
    const file = formData.get('cv') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    if (!file.name.toLowerCase().endsWith('.pdf')) return NextResponse.json({ error: 'Only PDF files accepted' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const rawText = await extractTextFromPDF(buffer)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await supabase.from('profiles').upsert({
      user_id: userId,
      raw_cv_text: rawText,
      raw_cv_url: file.name,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    if (error) throw error

    return NextResponse.json({ success: true, text_length: rawText.length, filename: file.name })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    console.error('CV UPLOAD ERROR:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
