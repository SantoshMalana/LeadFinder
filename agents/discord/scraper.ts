import { Client, GatewayIntentBits } from 'discord.js'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { spawn } from 'child_process'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const USER_ID = process.argv[2] || process.env.AUTOAPPLY_USER_ID || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Channels to monitor (e.g., job-board, freelance-gigs)
const TARGET_CHANNELS = process.env.DISCORD_CHANNELS?.split(',') || []

export async function startDiscordScraper() {
  if (!DISCORD_TOKEN || !USER_ID) {
    console.log('❌ DISCORD_TOKEN or AUTOAPPLY_USER_ID missing. Cannot start Discord Scraper.')
    return
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  client.on('ready', () => {
    console.log(`🤖 Discord Scraper logged in as ${client.user?.tag}`)
    console.log(`🔍 Monitoring ${TARGET_CHANNELS.length} channels for job leads...`)
  })

  client.on('messageCreate', async (message) => {
    // Ignore bots
    if (message.author.bot) return

    // If TARGET_CHANNELS is not empty, only process messages from those channels
    if (TARGET_CHANNELS.length > 0 && !TARGET_CHANNELS.includes(message.channel.id) && !TARGET_CHANNELS.includes((message.channel as any).name)) {
      return
    }

    const text = message.content
    if (text.length < 50) return

    // Quick filter
    const keywords = ['hiring', 'looking for', 'freelance', 'developer', 'react', 'nextjs']
    const isMatch = keywords.some(k => text.toLowerCase().includes(k))
    if (!isMatch) return

    console.log(`🔎 Found potential lead in #${(message.channel as any).name || message.channel.id}...`)

    // Call Groq AI to score
    try {
      const prompt = `Analyze this Discord message and determine if it's a job/freelance lead.
Message:
"""
${text.substring(0, 2000)}
"""
Return JSON only:
{
  "is_lead": boolean,
  "score": number (1-10),
  "title": string,
  "company": string,
  "apply_email": string | null,
  "apply_link": string | null,
  "summary": string
}`

      let retries = 3
      let analysis: any = null

      while (retries > 0) {
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
              temperature: 0.1,
            })
          })

          if (res.status === 429) {
            retries--
            if (retries === 0) throw new Error('Rate limited by Groq')
            console.log(`⚠️ Rate limited by Groq. Retrying in 5s...`)
            await new Promise(r => setTimeout(r, 5000))
            continue
          }

          if (!res.ok) throw new Error('Groq API Error')

          const data = await res.json()
          let content = data.choices?.[0]?.message?.content || ''
          content = content.replace(/^```json/, '').replace(/```$/, '').trim()
          analysis = JSON.parse(content)
          break
        } catch (err) {
          if (retries === 1) throw err
          retries--
          await new Promise(r => setTimeout(r, 5000))
        }
      }

      if (analysis && analysis.is_lead && analysis.score >= 5) {
        console.log(`🎯 Discord Lead Found! Score: ${analysis.score}/10`)

        // Check for duplicates
        const sourceId = `discord_${message.id}`
        const { data: existing } = await supabase.from('jobs').select('id').eq('source_id', sourceId).limit(1)
        
        if (!existing || existing.length === 0) {
          const { data: insertedJob } = await supabase.from('jobs').insert({
            user_id: USER_ID,
            source: 'discord',
            source_id: sourceId,
            company: analysis.company || message.author.username,
            title: analysis.title || 'Discord Lead',
            description: text.substring(0, 3000),
            job_url: analysis.apply_link || `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`,
            job_type: 'freelance',
            match_score: analysis.score,
            match_reason: analysis.summary,
            status: 'discovered',
            discovered_at: new Date().toISOString()
          }).select('id').single()

          console.log(`✅ Saved Discord lead to DB`)

          // Auto-apply logic
          if (analysis.apply_email && insertedJob) {
            console.log(`✉️ Found email: ${analysis.apply_email}. Spawning mailer...`)
            const pythonCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
            spawn(pythonCmd, ['tsx', 'agents/email/mailer.ts', USER_ID, analysis.apply_email, insertedJob.id], { stdio: 'ignore', detached: true }).unref()
          } else if (analysis.apply_link && (analysis.apply_link.includes('forms.gle') || analysis.apply_link.includes('google.com/forms'))) {
            console.log(`📝 Found Google Form. Spawning form filler...`)
            const pythonCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
            spawn(pythonCmd, ['tsx', 'agents/forms/googleForms.ts', USER_ID, analysis.apply_link, insertedJob?.id || ''], { stdio: 'ignore', detached: true }).unref()
          }
        }
      }

    } catch (err) {
      console.error('⚠️ Error processing Discord message:', err)
    }
  })

  client.login(DISCORD_TOKEN)
}

// If run directly
const isMain = typeof require !== 'undefined' && require.main === module;
if (isMain) {
  startDiscordScraper()
}
