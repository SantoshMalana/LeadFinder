import Groq from 'groq-sdk'

let _groq: Groq | null = null

export const groq = new Proxy({} as Groq, {
  get(target, prop) {
    if (!_groq) {
      if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is missing')
      _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    }
    return (_groq as any)[prop]
  }
})