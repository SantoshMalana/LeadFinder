import Groq from 'groq-sdk'
import { getRandomGroqKey } from './aiKeys'

export const groq = new Proxy({} as Groq, {
  get(target, prop) {
    const key = getRandomGroqKey()
    if (!key) throw new Error('GROQ_API_KEY is missing')
    
    // We instantiate a new Groq client on every access to pick up dynamic key rotation
    const _groq = new Groq({ apiKey: key })
    return (_groq as any)[prop]
  }
})