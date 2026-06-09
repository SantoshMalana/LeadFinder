import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { getRandomGeminiKey } from '@/lib/aiKeys'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createAuthClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { lead_id } = await req.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: lead } = await supabase
      .from('leads')
      .select('*, campaigns!inner(user_id)')
      .eq('id', lead_id)
      .eq('campaigns.user_id', user.id)
      .single()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found or access denied' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id, voice_profile, portfolio_summary')
      .eq('id', user.id)
      .single()

    const gemini = new GoogleGenerativeAI(getRandomGeminiKey() || process.env.GEMINI_API_KEY!)
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
      user_id: user.id,
      generated_reply: reply,
      sent: false,
    })

    return NextResponse.json({ reply })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('REPLY ERROR:', message)
    return NextResponse.json({
      error: message
    }, { status: 500 })
  }
}