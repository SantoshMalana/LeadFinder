import { Redis } from '@upstash/redis'
import { flashModel } from './gemini'
import { groq } from './groq'
import type { ParsedCV, Job } from '@/types'

const redis = Redis.fromEnv()

/**
 * Generate a tailored cover letter for a specific job
 */
export async function generateCoverLetter(
  job: Pick<Job, 'title' | 'company' | 'description' | 'location'>,
  profile: ParsedCV,
  missingKeywords: string[] = []
): Promise<string> {
  const keywordPrompt = missingKeywords.length > 0 
    ? `\nCRITICAL: Naturally weave in the following missing keywords from the job description: ${missingKeywords.join(', ')}`
    : ''

  const result = await flashModel.generateContent(`
You are writing a cover letter for a job application.

CANDIDATE:
Name: ${profile.name}
Headline: ${profile.headline}
Summary: ${profile.summary}
Key Skills: ${[...profile.skills.languages, ...profile.skills.frameworks].slice(0, 10).join(', ')}
Experience: ${profile.experience.slice(0, 2).map(e => `${e.title} at ${e.company} (${e.duration})`).join('; ')}
Notable Projects: ${profile.projects.slice(0, 2).map(p => `${p.name}: ${p.description}`).join('; ')}

JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Description: ${job.description?.slice(0, 800) || 'No description available'}

Write a concise, professional cover letter (200-300 words) that:
- Opens with genuine enthusiasm for the specific role
- Highlights 2-3 relevant skills/experiences that match the job
- References a specific project or achievement
- Shows knowledge of the company if possible
- Ends with a confident call to action
- Sounds human and authentic, NOT generic or AI-generated
- Does NOT use phrases like "I am writing to express my interest" or "I believe I would be a great fit"${keywordPrompt}

Cover letter only, no subject line or formatting instructions.`)

  return result.response.text()
}

/**
 * Generate an answer to a screening question
 */
export async function generateScreeningAnswer(
  question: string,
  job: Pick<Job, 'title' | 'company' | 'description'>,
  profile: ParsedCV,
  jobId?: string
): Promise<string> {
  // Try cache first
  const cacheKey = `ans:${jobId || 'global'}:${Buffer.from(question).toString('base64').slice(0, 32)}`
  const cached = await redis.get<string>(cacheKey)
  if (cached) return cached

  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `You are helping a job candidate answer a screening question on a job application.

CANDIDATE PROFILE:
Name: ${profile.name}
Skills: ${[...profile.skills.languages, ...profile.skills.frameworks, ...profile.skills.tools].join(', ')}
Experience: ${profile.years_of_experience} years
Recent role: ${profile.experience[0]?.title || 'N/A'} at ${profile.experience[0]?.company || 'N/A'}
Education: ${profile.education[0]?.degree || 'N/A'} in ${profile.education[0]?.field || 'N/A'}

JOB: ${job.title} at ${job.company}

SCREENING QUESTION: ${question}

Write a concise, honest answer (2-4 sentences). Be specific, reference real skills/experience from the profile. Sound natural and confident.

Answer only, nothing else.`,
    }],
    temperature: 0.3,
    max_tokens: 200,
  })

  const answer = res.choices[0].message.content || ''
  
  // Cache for 24 hours
  if (answer) {
    await redis.setex(cacheKey, 86400, answer)
  }

  return answer
}

/**
 * Tailor resume summary for a specific job
 */
export async function tailorResumeSummary(
  job: Pick<Job, 'title' | 'company' | 'description'>,
  profile: ParsedCV
): Promise<string> {
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `Rewrite this professional summary to better target a "${job.title}" role at ${job.company}.

ORIGINAL SUMMARY: ${profile.summary}
SKILLS: ${[...profile.skills.languages, ...profile.skills.frameworks].join(', ')}
JOB DESCRIPTION: ${job.description?.slice(0, 400) || 'Not available'}

Write a 2-3 sentence professional summary that emphasizes the most relevant skills and experience for this specific role. Sound natural and confident.

Summary only, nothing else.`,
    }],
    temperature: 0.3,
    max_tokens: 150,
  })

  return res.choices[0].message.content || profile.summary
}
