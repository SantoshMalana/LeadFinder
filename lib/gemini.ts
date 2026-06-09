import { GoogleGenerativeAI } from '@google/generative-ai'
import { getRandomGeminiKey } from './aiKeys'

export const gemini = new Proxy({} as GoogleGenerativeAI, {
  get(target, prop) {
    const key = getRandomGeminiKey()
    if (!key) throw new Error('GEMINI_API_KEY is missing')
    const _gemini = new GoogleGenerativeAI(key)
    return (_gemini as any)[prop]
  }
})

export const flashModel = new Proxy({} as any, {
  get(target, prop) {
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' })
    return (model as any)[prop]
  }
})