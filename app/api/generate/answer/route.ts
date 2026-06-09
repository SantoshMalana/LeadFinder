import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateScreeningAnswer } from '@/lib/cover-letter'
import { withInternalAuth } from '@/app/api/middleware'

export const POST = withInternalAuth(async (req: NextRequest, body: string) => {
  try {
    const { job_id, question, user_id } = JSON.parse(body)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: job } = await supabase.from('jobs').select('*').eq('id', job_id).single()
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const uid = user_id || job.user_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('parsed_data')
      .eq('user_id', uid)
      .single()

    if (!profile?.parsed_data) {
      return NextResponse.json({ error: 'No profile' }, { status: 400 })
    }

    const answer = await generateScreeningAnswer(question, job, profile.parsed_data, job_id)

    await supabase.from('generated_content').insert({
      job_id,
      content_type: 'answer',
      question,
      answer,
    })

    return NextResponse.json({ answer })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
