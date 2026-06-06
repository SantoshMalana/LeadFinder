import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

export async function GET() {
  try {
    const logPath = path.join(process.cwd(), 'agent.log')
    
    if (!fs.existsSync(logPath)) {
      return NextResponse.json({ logs: 'Waiting for agent to start...' })
    }

    // Read the last 50 lines or so
    const content = fs.readFileSync(logPath, 'utf-8')
    const lines = content.trim().split('\n')
    const lastLines = lines.slice(-100).join('\n')

    return NextResponse.json({ logs: lastLines })
  } catch (err) {
    return NextResponse.json({ logs: 'Error reading logs' })
  }
}
