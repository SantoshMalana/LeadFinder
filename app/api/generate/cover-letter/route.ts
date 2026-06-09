import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateCoverLetter } from '@/lib/cover-letter'
import { withInternalAuth } from '@/app/api/middleware'
import { applyPersona, atsScore, type Persona } from '@/lib/persona'

export const POST = withInternalAuth(async (req: NextRequest, body: string) => {
  try {
    const { job_id, persona } = JSON.parse(body)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: job } = await supabase.from('jobs').select('*').eq('id', job_id).single()
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('parsed_data, raw_cv_text')
      .eq('user_id', job.user_id)
      .single()

    if (!profile?.parsed_data) {
      return NextResponse.json({ error: 'No profile data' }, { status: 400 })
    }

    // Apply persona adjustment
    const cvData = applyPersona(profile.parsed_data, (persona as Persona) || 'default')
    
    // Check ATS
    const rawCvText = profile.raw_cv_text || JSON.stringify(profile.parsed_data)
    const ats = await atsScore(rawCvText, job.description || '')

    const coverLetter = await generateCoverLetter(job, cvData, ats.missing_keywords)

    await supabase.from('generated_content').insert({
      job_id,
      content_type: 'cover_letter',
      question: null,
      answer: coverLetter,
    })

    return NextResponse.json({ cover_letter: coverLetter, persona: persona || 'default' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
