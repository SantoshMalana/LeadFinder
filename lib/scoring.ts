import { groq } from './groq'
import type { ParsedCV, ScoreResult } from '@/types'
import { Redis } from '@upstash/redis'
import crypto from 'crypto'
import { markKeyExhausted } from './aiKeys'

const redis = Redis.fromEnv()

/**
 * Score a Reddit post for freelance/hiring intent (extracted from 3 duplicate locations)
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
  } catch {
    return { score: 0, reason: 'scoring failed' }
  }
}

/**
 * Score how well a job matches a student's CV/profile
 */
export async function scoreJobMatch(
  job: { title: string; company: string; description?: string | null; location?: string | null; job_type?: string | null },
  profile: ParsedCV,
  preferences?: { roles?: string[]; locations?: string[]; remote_preference?: string }
): Promise<ScoreResult & { should_apply: boolean }> {
  const cacheKey = `job_match:${crypto.createHash('sha256').update(job.title + job.company + profile.name + (preferences?.roles?.join(',') || '')).digest('hex')}`
  
  try {
    const cached = await redis.get<ScoreResult & { should_apply: boolean }>(cacheKey)
    if (cached) return cached
  } catch {}

  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `You are a job-matching AI. Score how well this job matches the candidate's profile.

JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Type: ${job.job_type || 'Not specified'}
Description: ${job.description?.slice(0, 600) || 'No description'}

CANDIDATE:
Name: ${profile.name}
Headline: ${profile.headline}
Skills: ${[...profile.skills.languages, ...profile.skills.frameworks, ...profile.skills.tools].join(', ')}
Experience: ${profile.years_of_experience} years
Recent roles: ${profile.experience.slice(0, 2).map(e => `${e.title} at ${e.company}`).join('; ')}
Education: ${profile.education.map(e => `${e.degree} in ${e.field}`).join('; ')}
Preferred roles: ${preferences?.roles?.join(', ') || 'Any'}
Preferred locations: ${preferences?.locations?.join(', ') || 'Any'}

Score 1-10:
9-10: Perfect match — skills align, experience level fits, role matches preferences
7-8: Strong match — most skills align, reasonable fit
5-6: Moderate — some overlap but notable gaps
3-4: Weak — significant skill mismatch or overqualified/underqualified
1-2: No match

EXAMPLES:
- Job: "Senior React Dev, 5+ yrs", Candidate: "Frontend Dev, 2 yrs React" -> {"score": 4, "reason": "Underqualified on experience.", "should_apply": false}
- Job: "Full Stack Node/React", Candidate: "Full Stack Dev, 4 yrs Node/React" -> {"score": 9, "reason": "Perfect skill alignment.", "should_apply": true}

JSON only: {"score": 8, "reason": "one sentence", "should_apply": true}`,
      }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 100,
    })

    const content = res.choices?.[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)
    const result = {
      score: Number(parsed.score) || 0,
      reason: parsed.reason || '',
      should_apply: parsed.should_apply ?? (Number(parsed.score) >= 7),
    }

    try {
      await redis.set(cacheKey, result, { ex: 604800 }) // cache for 7 days
    } catch {}

    return result
  } catch (err: any) {
    if (err?.status === 429 && err?.headers) {
       // Optional: we don't know exactly which key failed without intercepting, 
       // but if we were storing it we could mark it. We'll rely on global rotation.
    }
    return { score: 0, reason: 'scoring failed', should_apply: false }
  }
}
