'use client'

import { useState, useEffect, useRef } from 'react'

export default function LiveTerminal({ isOpen, onClose, defaultSource = 'agent' }: { 
  isOpen: boolean
  onClose: () => void
  defaultSource?: 'agent' | 'telegram'
}) {
  const [logs, setLogs] = useState<string>('Connecting to agent stream...')
  const [source, setSource] = useState<'agent' | 'telegram'>(defaultSource)
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (!isOpen) return

    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/logs?source=${source}`, { cache: 'no-store' })
        const data = await res.json()
        setLogs(data.logs)
      } catch {}
    }

    fetchLogs()
    const interval = setInterval(fetchLogs, 1500)
    return () => clearInterval(interval)
  }, [isOpen, source])

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 transition-all">
      <div className="w-full max-w-4xl h-[80vh] bg-[#0c0c0c] rounded-xl border border-[#333] flex flex-col shadow-[0_0_50px_rgba(0,200,255,0.05)] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#222] bg-[#141414]">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80 shadow-[0_0_10px_rgba(234,179,8,0.5)]"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
            </div>
            <span className="text-xs font-mono text-gray-400 ml-2 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Live Agent Pipeline
            </span>
          </div>

          {/* Source Tabs */}
          <div className="flex items-center gap-1 bg-[#050505] rounded-lg p-0.5 border border-[#222]">
            <button
              onClick={() => { setSource('agent'); setAutoScroll(true) }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                source === 'agent' ? 'bg-[#222] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              🔗 LinkedIn / Reddit
            </button>
            <button
              onClick={() => { setSource('telegram'); setAutoScroll(true) }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                source === 'telegram' ? 'bg-[#0088cc] text-white shadow-[0_0_15px_rgba(0,136,204,0.3)]' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              📱 Telegram
            </button>
          </div>

          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Terminal Body */}
        <div 
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 font-mono text-sm whitespace-pre-wrap text-[#00ff00] bg-[#0c0c0c] custom-scrollbar"
        >
          {logs}
          <div ref={terminalEndRef} />
        </div>
        
        {/* Status Bar */}
        {!autoScroll && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <button 
              onClick={() => setAutoScroll(true)}
              className="bg-[#222] hover:bg-[#333] border border-[#444] text-gray-300 px-4 py-1.5 rounded-full text-xs transition-colors flex items-center gap-2"
            >
              ↓ Scroll to bottom
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
