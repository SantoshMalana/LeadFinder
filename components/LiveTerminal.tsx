'use client'

import { useState, useEffect, useRef } from 'react'

export default function LiveTerminal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [logs, setLogs] = useState<string>('Connecting to agent...')
  const terminalEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/logs')
        const data = await res.json()
        setLogs(data.logs)
      } catch (err) {}
    }

    fetchLogs() // initial fetch
    const interval = setInterval(fetchLogs, 2000) // poll every 2s

    return () => clearInterval(interval)
  }, [isOpen])

  useEffect(() => {
    // Auto-scroll to bottom
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl h-[80vh] bg-[#111] rounded-xl border border-[var(--border)] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] bg-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <span className="text-sm font-mono text-gray-400 ml-2">Live Agent Progress</span>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Terminal Body */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-sm whitespace-pre-wrap text-green-400">
          {logs}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  )
}
