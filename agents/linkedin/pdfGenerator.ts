import * as path from 'path'
import * as fs from 'fs'
import PDFDocument from 'pdfkit'
import type { ParsedCV } from '../../types'
import * as dotenv from 'dotenv'
import { getRandomGroqKey } from '../../lib/aiKeys'
import { tailorResumeSummary } from '../../lib/cover-letter'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

export async function generateCoverLetter(
  profile: ParsedCV,
  jobDetails: string,
  jobTitle: string = 'Software Engineer',
  company: string = 'the company'
): Promise<string> {
  console.log('🧠 Tailoring resume summary...')
  const tailoredSummary = await tailorResumeSummary(
    { title: jobTitle, company: company, description: jobDetails },
    profile
  )

  console.log('🧠 Using Groq AI to draft PDF cover letter...')

  const prompt = `Write a professional, concise cover letter for the following job description.
Use my profile details to make it highly relevant.

MY PROFILE:
Name: ${profile.name}
Experience: ${profile.years_of_experience} years
Skills: ${profile.skills?.frameworks?.join(', ')}
Summary: ${tailoredSummary}

JOB DESCRIPTION:
${jobDetails}

Return ONLY the text of the cover letter. No markdown formatting, no placeholders like [Company Name], try to infer it from the job description. Keep it under 250 words.`

  let coverLetterText = 'I am writing to express my strong interest in this position. My background and skills align well with the requirements.'

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
        temperature: 0.2,
      })
    })

    if (res.ok) {
      const data = await res.json()
      if (data.choices?.[0]?.message?.content) {
        coverLetterText = data.choices[0].message.content.trim()
      }
    }
  } catch (err) {
    console.error('⚠️ Failed to generate cover letter text with AI, using fallback.')
  }

  // Generate PDF
  const dir = path.join(process.cwd(), '.leadfinder', 'cover_letters')
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    console.error('⚠️ Failed to create cover letter directory:', err)
    // Fallback to os tmp dir or just fail gracefully
    return Promise.reject(err)
  }

  const filePath = path.join(dir, `CoverLetter_${Date.now()}.pdf`)

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 })
      const stream = fs.createWriteStream(filePath)
      
      doc.pipe(stream)

      // Header
      doc.fontSize(20).text(profile.name, { align: 'center' })
      doc.fontSize(10).text(`${profile.email} | ${profile.phone || ''}`, { align: 'center' })
      doc.moveDown(2)

      // Date
      doc.fontSize(12).text(new Date().toLocaleDateString(), { align: 'left' })
      doc.moveDown(1)

      // Body
      doc.text(coverLetterText, {
        align: 'left',
        lineGap: 4
      })

      doc.moveDown(2)
      doc.text('Sincerely,')
      doc.moveDown(1)
      doc.text(profile.name)

      doc.end()

      stream.on('finish', () => resolve(filePath))
      stream.on('error', reject)
    } catch (e) {
      reject(e)
    }
  })
}
