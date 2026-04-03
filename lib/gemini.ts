import { GoogleGenerativeAI } from '@google/generative-ai'

export const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export const flashModel = gemini.getGenerativeModel({
  model: 'gemini-2.5-flash',
})