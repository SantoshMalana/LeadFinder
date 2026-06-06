import { groq } from './groq'
import type { ParsedCV } from '@/types'

export type Persona = 'startup' | 'enterprise' | 'ai_research' | 'default'

interface PersonaConfig {
  name: string
  emphasis: string[]
  tone: string
  project_priority: string[]
  headline_suffix: string
}

const PERSONAS: Record<Persona, PersonaConfig> = {
  startup: {
    name: 'Startup Builder',
    emphasis: ['speed', 'shipping', 'full-stack', 'MVP', 'agile', 'ownership'],
    tone: 'energetic, scrappy, builder mentality',
    project_priority: ['LeadFinder', 'Shadow Shelf', 'SyncSpace'],
    headline_suffix: '| Ship Fast, Build Smart',
  },
  enterprise: {
    name: 'Enterprise Engineer',
    emphasis: ['scalability', 'architecture', 'security', 'testing', 'CI/CD', 'microservices'],
    tone: 'professional, methodical, architecture-focused',
    project_priority: ['SyncSpace', 'Loan System', 'LeadFinder'],
    headline_suffix: '| Scalable Architecture & Clean Code',
  },
  ai_research: {
    name: 'AI/ML Engineer',
    emphasis: ['RAG', 'embeddings', 'LLM', 'pipelines', 'data', 'ML ops'],
    tone: 'technical, research-oriented, data-driven',
    project_priority: ['Turing Annotation', 'RAG Pipeline', 'LeadFinder'],
    headline_suffix: '| AI/ML & Intelligent Systems',
  },
  default: {
    name: 'Balanced',
    emphasis: [],
    tone: 'professional and confident',
    project_priority: [],
    headline_suffix: '',
  },
}

/**
 * Auto-select the best persona based on job description
 */
export async function selectPersona(
  jobTitle: string,
  jobDescription: string
): Promise<Persona> {
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Classify this job into ONE category based on what type of candidate they want.

Job Title: ${jobTitle}
Description: ${jobDescription.slice(0, 500)}

Categories:
- "startup" — fast-paced, early-stage, scrappy, building MVPs, wearing many hats
- "enterprise" — large company, scalable systems, enterprise software, banking/fintech
- "ai_research" — AI, ML, data science, NLP, computer vision, LLMs, embeddings
- "default" — doesn't clearly fit any category

Reply with ONLY the category name, nothing else.`,
      }],
      temperature: 0.1,
      max_tokens: 10,
    })

    const result = (res.choices[0].message.content || 'default').trim().toLowerCase() as Persona
    return PERSONAS[result] ? result : 'default'
  } catch {
    return 'default'
  }
}

/**
 * Tailor CV data for a specific persona
 */
export function applyPersona(profile: ParsedCV, persona: Persona): ParsedCV {
  const config = PERSONAS[persona]
  if (persona === 'default') return profile

  return {
    ...profile,
    headline: profile.headline + (config.headline_suffix ? ` ${config.headline_suffix}` : ''),
    summary: profile.summary, // Will be rewritten by tailorResumeSummary
    // Reorder projects to prioritize persona-relevant ones
    projects: [...profile.projects].sort((a, b) => {
      const aMatch = config.project_priority.some(p => a.name.toLowerCase().includes(p.toLowerCase()))
      const bMatch = config.project_priority.some(p => b.name.toLowerCase().includes(p.toLowerCase()))
      return (bMatch ? 1 : 0) - (aMatch ? 1 : 0)
    }),
    // Reorder skills to prioritize persona-relevant ones
    skills: {
      ...profile.skills,
      frameworks: [...profile.skills.frameworks].sort((a, b) => {
        const aMatch = config.emphasis.some(e => a.toLowerCase().includes(e.toLowerCase()))
        const bMatch = config.emphasis.some(e => b.toLowerCase().includes(e.toLowerCase()))
        return (bMatch ? 1 : 0) - (aMatch ? 1 : 0)
      }),
    },
  }
}

/**
 * Score CV against job description for ATS compatibility
 */
export async function atsScore(
  cvText: string,
  jobDescription: string
): Promise<{ score: number; missing_keywords: string[]; suggestions: string[] }> {
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `You are an ATS (Applicant Tracking System) scanner. Score how well this CV matches the job description.

CV:
${cvText.slice(0, 2000)}

JOB DESCRIPTION:
${jobDescription.slice(0, 1500)}

Analyze:
1. Keyword overlap (technical skills, tools, frameworks)
2. Experience level match
3. Education match
4. Role-specific terminology

JSON response:
{
  "score": 78,
  "missing_keywords": ["Docker", "CI/CD", "PostgreSQL"],
  "suggestions": ["Add Docker experience", "Mention testing frameworks"]
}`,
      }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 200,
    })

    return JSON.parse(res.choices[0].message.content || '{"score":0,"missing_keywords":[],"suggestions":[]}')
  } catch {
    return { score: 0, missing_keywords: [], suggestions: [] }
  }
}

export { PERSONAS }
