import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractTextFromPDF } from '@/lib/cv-parser'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('cv') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    if (!file.name.endsWith('.pdf')) return NextResponse.json({ error: 'Only PDF files accepted' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const rawText = await extractTextFromPDF(buffer)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get user from auth header or use first user (for agent calls)
    const userId = req.headers.get('x-user-id')

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
