import { groq } from './groq'
import { flashModel } from './gemini'
import type { ParsedCV, ScoreResult } from '@/types'
import { Redis } from '@upstash/redis'
import crypto from 'crypto'
import { markKeyExhausted } from './aiKeys'

// Lazy Redis — must not call Redis.fromEnv() at module level because
// child processes (runner.ts) load dotenv AFTER module evaluation.
let _redis: Redis | null = null
function getRedis(): Redis | null {
  if (_redis) return _redis
  try {
    _redis = Redis.fromEnv()
    return _redis
  } catch {
    return null
  }
}

/**
 * Score a Reddit post for freelance/hiring intent
 */
export async function scoreLeadPost(post: {
  post_title: string
  post_body?: string | null
}): Promise<ScoreResult> {
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `You are a lead scoring AI for a freelance full-stack developer.

Score this post 1-10 for hiring/buying intent.
9-10: Direct hire. "Need React dev", "hiring freelancer", "looking for developer"
7-8: Strong implied. "Need a website", "freelancer recommendations?"
4-6: Tangential. Tech discussion without clear hiring need
1-3: Not a lead. News, opinions, memes

Post Title: ${post.post_title}
Post Body: ${post.post_body?.slice(0, 500) || 'No body'}

JSON only: {"score": 8, "reason": "one sentence explanation"}`,
      }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 80,
    })

    const content = res.choices?.[0]?.message?.content || '{}'
    const { score, reason } = JSON.parse(content)
    return { score: Number(score) || 0, reason: reason || '' }
  } catch (err) {
    console.error('[Scoring] scoreLeadPost failed:', err)
    return { score: 0, reason: 'scoring failed' }
  }
}

/**
 * Build the scoring prompt (shared between Groq and Gemini)
 */
function buildScoringPrompt(
  job: { title: string; company: string; description?: string | null; location?: string | null; job_type?: string | null },
  profile: ParsedCV,
  preferences?: { roles?: string[]; locations?: string[]; remote_preference?: string }
): string {
  return `You are a job-matching AI. Score how well this job matches the candidate's profile.

JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Type: ${job.job_type || 'Not specified'}
Description: ${job.description?.slice(0, 600) || 'No description'}

CANDIDATE:
Name: ${profile.name}
Headline: ${profile.headline}
Skills: ${[...(profile.skills?.languages || []), ...(profile.skills?.frameworks || []), ...(profile.skills?.tools || [])].join(', ')}
Experience: ${profile.years_of_experience} years
Recent roles: ${(profile.experience || []).slice(0, 2).map(e => `${e.title} at ${e.company}`).join('; ')}
Education: ${(profile.education || []).map(e => `${e.degree} in ${e.field}`).join('; ')}
Preferred roles: ${preferences?.roles?.join(', ') || 'Any'}
Preferred locations: ${preferences?.locations?.join(', ') || 'Any'}

Score 1-10:
9-10: Perfect match — skills align, experience level fits, role matches preferences
7-8: Strong match — most skills align, reasonable fit
5-6: Moderate — some overlap but notable gaps
3-4: Weak — significant skill mismatch or overqualified/underqualified
1-2: No match

JSON only: {"score": 8, "reason": "one sentence", "should_apply": true}`
}

/**
 * Try scoring with Groq first, fall back to Gemini if Groq fails
 */
async function scoreWithAI(prompt: string): Promise<{ score: number; reason: string; should_apply: boolean }> {
  // ── Attempt 1: Groq ──
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 100,
    })
    const content = res.choices?.[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)
    return {
      score: Number(parsed.score) || 0,
      reason: parsed.reason || '',
      should_apply: parsed.should_apply ?? (Number(parsed.score) >= 7),
    }
  } catch (groqErr: any) {
    console.log(`[Scoring] Groq failed (${groqErr?.status || groqErr?.message}), falling back to Gemini...`)
  }

  // ── Attempt 2: Gemini Flash ──
  try {
    const result = await flashModel.generateContent(prompt + '\n\nRespond with valid JSON only, nothing else.')
    const text = result.response.text().trim()
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```json\s*/, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      score: Number(parsed.score) || 0,
      reason: parsed.reason || '',
      should_apply: parsed.should_apply ?? (Number(parsed.score) >= 7),
    }
  } catch (geminiErr: any) {
    console.error(`[Scoring] Gemini also failed:`, geminiErr?.message)
  }

  return { score: 0, reason: 'All AI providers failed', should_apply: false }
}

/**
 * Score how well a job matches a student's CV/profile
 */
export async function scoreJobMatch(
  job: { title: string; company: string; description?: string | null; location?: string | null; job_type?: string | null },
  profile: ParsedCV,
  preferences?: { roles?: string[]; locations?: string[]; remote_preference?: string }
): Promise<ScoreResult & { should_apply: boolean }> {
  const redis = getRedis()
  const cacheKey = `job_match:${crypto.createHash('sha256').update(job.title + job.company + profile.name + (preferences?.roles?.join(',') || '')).digest('hex')}`
  
  if (redis) {
    try {
      const cached = await redis.get<ScoreResult & { should_apply: boolean }>(cacheKey)
      if (cached) return cached
    } catch {}
  }

  // Validate that profile has real data
  if (!profile?.name && !profile?.headline && (!profile?.skills?.languages?.length)) {
    console.error('[Scoring] scoreJobMatch called with EMPTY profile — cannot score. Profile keys:', Object.keys(profile || {}))
    return { score: 0, reason: 'Empty profile — upload and parse CV first', should_apply: false }
  }

  console.log(`[Scoring] Scoring "${job.title}" at ${job.company} for ${profile.name}`)

  const prompt = buildScoringPrompt(job, profile, preferences)
  const result = await scoreWithAI(prompt)

  console.log(`[Scoring] Result: score=${result.score}, reason="${result.reason}", should_apply=${result.should_apply}`)

  if (redis && result.score > 0) {
    try {
      await redis.set(cacheKey, result, { ex: 604800 })
    } catch {}
  }

  return result
}
