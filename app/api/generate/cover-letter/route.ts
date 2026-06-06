import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateCoverLetter } from '@/lib/cover-letter'

export async function POST(req: NextRequest) {
  try {
    const { job_id, persona } = await req.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: job } = await supabase.from('jobs').select('*').eq('id', job_id).single()
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('parsed_data')
      .eq('user_id', job.user_id)
      .single()

    if (!profile?.parsed_data) {
      return NextResponse.json({ error: 'No profile data' }, { status: 400 })
    }

    // Apply persona adjustment if provided
    let cvData = profile.parsed_data
    if (persona === 'startup') {
      cvData = { ...cvData, headline: `${cvData.headline} | Move Fast, Ship Daily` }
    } else if (persona === 'enterprise') {
      cvData = { ...cvData, headline: `${cvData.headline} | Scalable Architecture` }
    } else if (persona === 'ai_research') {
      cvData = { ...cvData, headline: `${cvData.headline} | AI/ML Engineer` }
    }

    const coverLetter = await generateCoverLetter(job, cvData)

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
}
