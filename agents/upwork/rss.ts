import Parser from 'rss-parser'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { getRandomGroqKey } from '../../lib/aiKeys'
import { scoreJobMatch } from '../../lib/scoring'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
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
      const { data: existing } = await supabase.from('jobs').select('id').eq('source_id', `upwork_${jobId}`).limit(1)
      if (existing && existing.length > 0) continue

      console.log(`🔎 Analyzing new Upwork job: "${item.title}"`)

      // Draft Proposal
      const prompt = `Write a highly specific, compelling Upwork proposal for this job.
Job Title: ${item.title}
Description: ${item.contentSnippet || item.content}

Return ONLY the text of the proposal. Keep it short, focused on results, and start with a hook.`

      let proposalDraft = ''

      let retries = 3
      while (retries > 0) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${getRandomGroqKey()}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.3,
            })
          })

          if (res.status === 429) {
            retries--
            if (retries === 0) break
            console.log(`⚠️ Rate limited by Groq. Retrying in 5s...`)
            await new Promise(r => setTimeout(r, 5000))
            continue
          }

          if (res.ok) {
            const data = await res.json()
            proposalDraft = data.choices?.[0]?.message?.content?.trim() || ''
          }
          break
        } catch (e) {
          console.error('⚠️ Failed to generate Upwork proposal')
          break
        }
      }

      // Fetch user profile to score against their CV
      const { data: profile } = await supabase
        .from('profiles')
        .select('parsed_data')
        .eq('user_id', USER_ID)
        .single()

      let matchScore = 5
      let matchReason = 'Matched Upwork RSS search'

      if (profile?.parsed_data) {
        const result = await scoreJobMatch(
          {
            title: item.title || 'Upwork Job',
            company: 'Upwork Client',
            description: item.contentSnippet || item.content || '',
            job_type: 'freelance',
          },
          profile.parsed_data
        )
        matchScore = result.score
        matchReason = result.reason

        // Skip low matches (below threshold of 6)
        if (!result.should_apply) {
          console.log(`⏭️  Skipping low-match Upwork job: "${item.title}" (score: ${matchScore})`)
          continue
        }
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
        match_score: matchScore,
        match_reason: matchReason,
        status: 'discovered',
        discovered_at: new Date().toISOString(),
        generated_content: { cover_letter: proposalDraft },
      })

      console.log(`✅ Saved Upwork job (score: ${matchScore}/10) and proposal draft to DB!`)
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
