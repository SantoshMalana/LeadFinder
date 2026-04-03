import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const { data: users } = await supabase
      .from('users')
      .select('voice_profile, portfolio_summary')
      .limit(1)

    const profile = users?.[0]

    const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const result = await model.generateContent(`
You are writing a reply for a freelance full-stack developer.

Voice: ${profile?.voice_profile || 'Casual and helpful, not salesy'}
Skills: ${profile?.portfolio_summary || 'React, Next.js, Node.js, TypeScript, MongoDB'}

Post Title: ${lead.post_title}
Post Body: ${lead.post_body?.slice(0, 400) || ''}

Write a 2-3 sentence casual reply that:
- References something specific from the post
- Mentions 1 relevant skill
- Ends with a soft question
- Has NO links or business names yet

Reply only, nothing else.`)

    const reply = result.response.text()

    await supabase.from('outreach_log').insert({
      lead_id,
      user_id: users?.[0]?.id || null,
      generated_reply: reply,
      sent: false,
    })

    return NextResponse.json({ reply })

  } catch (err: any) {
    console.error('REPLY ERROR:', err?.message)
    return NextResponse.json({
      error: err?.message || 'Unknown error'
    }, { status: 500 })
  }
}