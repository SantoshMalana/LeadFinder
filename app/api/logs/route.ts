import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const source = searchParams.get('source') || 'agent' // 'agent' or 'telegram'
    
    const logFile = source === 'telegram' ? 'telegram_agent.log' : 'agent.log'
    const logPath = path.join(process.cwd(), logFile)
    
    if (!fs.existsSync(logPath)) {
      return NextResponse.json({ logs: `Waiting for ${source} agent to start...` })
    }

    const content = fs.readFileSync(logPath, 'utf-8')
    const lines = content.trim().split('\n')
    const lastLines = lines.slice(-100).join('\n')

    return NextResponse.json({ logs: lastLines })
  } catch {
    return NextResponse.json({ logs: 'Error reading logs' })
  }
}
