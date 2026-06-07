import Parser from 'rss-parser'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const USER_ID = process.argv[2] || process.env.AUTOAPPLY_USER_ID || ''

// For Upwork, you can generate an RSS feed based on your search query on the site.
// Example: https://www.upwork.com/ab/feed/jobs/rss?q=react&sort=recency
const UPWORK_RSS_URL = process.env.UPWORK_RSS_URL || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const parser = new Parser()

export async function checkUpworkRSS() {
  if (!UPWORK_RSS_URL || !USER_ID) {
    console.log('❌ UPWORK_RSS_URL or AUTOAPPLY_USER_ID missing. Cannot check Upwork.')
    return
  }

  console.log(`🌐 Fetching Upwork RSS Feed...`)

  try {
    const feed = await parser.parseURL(UPWORK_RSS_URL)
    console.log(`📋 Found ${feed.items.length} jobs in RSS feed.`)

    for (const item of feed.items.slice(0, 10)) { // Check top 10 newest
      const jobId = item.guid || item.link
      if (!jobId) continue

      // Check for duplicates
      const { data: existing } = await supabase.from('jobs').select('id').eq('source_id', `upwork_${jobId}`).maybeSingle()
      if (existing) continue

      console.log(`🔎 Analyzing new Upwork job: "${item.title}"`)

      // Draft Proposal
      const prompt = `Write a highly specific, compelling Upwork proposal for this job.
Job Title: ${item.title}
Description: ${item.contentSnippet || item.content}

Return ONLY the text of the proposal. Keep it short, focused on results, and start with a hook.`

      let proposalDraft = ''

      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
          })
        })

        if (res.ok) {
          const data = await res.json()
          proposalDraft = data.choices?.[0]?.message?.content?.trim() || ''
        }
      } catch (e) {
        console.error('⚠️ Failed to generate Upwork proposal')
      }

      await supabase.from('jobs').insert({
        user_id: USER_ID,
        source: 'upwork',
        source_id: `upwork_${jobId}`,
        company: 'Upwork Client',
        title: item.title || 'Upwork Job',
        description: item.contentSnippet || item.content || '',
        job_url: item.link || '',
        job_type: 'freelance',
        match_score: 8, // Assume high if it matched RSS
        match_reason: 'Matched Upwork RSS search',
        status: 'discovered', // We don't auto-apply on Upwork yet, just save draft
        discovered_at: new Date().toISOString()
        // Save proposalDraft somewhere, maybe append to description or metadata
      })

      console.log(`✅ Saved Upwork job and proposal draft to DB!`)
    }

  } catch (error) {
    console.error('❌ Failed to fetch/parse Upwork RSS:', error)
  }
}

// If run directly
const isMain = typeof require !== 'undefined' && require.main === module;
if (isMain) {
  checkUpworkRSS()
}
