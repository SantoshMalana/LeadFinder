import { GoogleGenerativeAI } from '@google/generative-ai'

let _gemini: GoogleGenerativeAI | null = null

export const gemini = new Proxy({} as GoogleGenerativeAI, {
  get(target, prop) {
    if (!_gemini) {
      if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing')
      _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    }
    return (_gemini as any)[prop]
  }
})

let _flashModel: any = null
export const flashModel = new Proxy({} as any, {
  get(target, prop) {
    if (!_flashModel) {
      _flashModel = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' })
    }
    return _flashModel[prop]
  }
})