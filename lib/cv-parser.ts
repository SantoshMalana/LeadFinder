import { groq } from './groq'
import type { ParsedCV } from '@/types'

/**
 * Extract text from a PDF buffer.
 * Uses pdf-parse v1 which works as a simple function call.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Import from lib directly to avoid pdf-parse's test file loading bug
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse/lib/pdf-parse.js')
  const result = await pdfParse(buffer)
  return result.text
}

/**
 * Parse raw CV text into structured data using Groq
 */
export async function structureCV(rawText: string): Promise<ParsedCV> {
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `You are a CV/resume parser. Extract structured information from this resume text.

RESUME TEXT:
${rawText.slice(0, 4000)}

Extract all information into this exact JSON structure. If a field is not found, use reasonable defaults or empty strings/arrays.

{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "+1234567890",
  "location": "City, Country",
  "linkedin_url": "https://linkedin.com/in/..." or null,
  "github_url": "https://github.com/..." or null,
  "portfolio_url": "https://..." or null,
  "headline": "Short professional headline, e.g. 'Full Stack Developer | React | Node.js'",
  "summary": "2-3 sentence professional summary",
  "years_of_experience": 2,
  "skills": {
    "languages": ["JavaScript", "Python"],
    "frameworks": ["React", "Next.js", "Express"],
    "tools": ["Git", "Docker", "VS Code"],
    "databases": ["PostgreSQL", "MongoDB"],
    "soft_skills": ["Team leadership", "Communication"]
  },
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "duration": "Jan 2023 - Present",
      "highlights": ["Key achievement 1", "Key achievement 2"]
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "degree": "B.Tech",
      "field": "Computer Science",
      "year": "2024",
      "gpa": "8.5/10"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "Brief description",
      "tech_stack": ["React", "Node.js"],
      "url": "https://..." or null
    }
  ],
  "certifications": ["AWS Certified", "etc"]
}

JSON only, no extra text.`,
    }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 2000,
  })

  const content = res.choices[0].message.content || '{}'
  return JSON.parse(content) as ParsedCV
}

/**
 * Full pipeline: PDF buffer → structured CV data
 */
export async function parseCV(pdfBuffer: Buffer): Promise<ParsedCV> {
  const rawText = await extractTextFromPDF(pdfBuffer)
  return structureCV(rawText)
}
