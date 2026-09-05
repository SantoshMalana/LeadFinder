'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface LiveTerminalProps {
  type: 'agent' | 'telegram'
  userId: string
  isOpen: boolean
  onClose: () => void
}

const BASE_POLL_MS = 2_000
const MAX_POLL_MS = 30_000

export default function LiveTerminal({ isOpen, onClose, type: initialType, userId }: LiveTerminalProps) {
  const [logs, setLogs] = useState<string[]>([])
  const [source, setSource] = useState<'agent' | 'telegram'>(initialType)
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'degraded' | 'offline'>('connected')

  useEffect(() => {
    if (!isOpen || !userId) return
    let timeoutId: NodeJS.Timeout
    let consecutiveFailures = 0

    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/logs?type=${source}&limit=50&user_id=${userId}`, { cache: 'no-store' })

        if (!res.ok) {
          consecutiveFailures++
          if (consecutiveFailures === 1) {
            // Only append the error message once, not on every failure
            setLogs(prev => [...prev, `> Log store unreachable (Status: ${res.status}). Retrying with backoff...`])
          }
          setConnectionStatus('offline')
        } else {
          const data = await res.json()

          // Check if the API reported Redis as unavailable (still returns 200)
          if (data.status === 'unavailable' || data.status === 'error') {
            if (consecutiveFailures === 0) {
              setLogs(typeof data.logs === 'string' ? [data.logs] : ['Log store offline.'])
            }
            consecutiveFailures++
            setConnectionStatus('degraded')
          } else {
            // Successful fetch — reset backoff
            consecutiveFailures = 0
            setConnectionStatus('connected')

            if (typeof data.logs === 'string') {
              setLogs(data.logs.split('\n').filter(Boolean))
            } else if (Array.isArray(data.logs)) {
              setLogs(data.logs.map((l: unknown) => typeof l === 'string' ? l : JSON.stringify(l)))
            }
          }
        }
      } catch {
        consecutiveFailures++
        if (consecutiveFailures === 1) {
          setLogs(prev => [...prev, '> Connection lost. Retrying with backoff...'])
        }
        setConnectionStatus('offline')
      }

      // Exponential backoff: 2s → 4s → 8s → 16s → 30s (capped)
      const delay = Math.min(BASE_POLL_MS * Math.pow(2, consecutiveFailures), MAX_POLL_MS)
      timeoutId = setTimeout(fetchLogs, delay)
    }

    fetchLogs()
    return () => clearTimeout(timeoutId)
  }, [isOpen, source, userId])

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }, [])

  if (!isOpen) return null

  const statusColors = {
    connected: 'bg-green-500',
    degraded: 'bg-yellow-500',
    offline: 'bg-red-500',
  }
  const statusLabels = {
    connected: 'Live Agent Pipeline',
    degraded: 'Log Store Offline — Retrying',
    offline: 'Disconnected — Retrying',
  }

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
                {connectionStatus === 'connected' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${statusColors[connectionStatus]}`}></span>
              </span>
              {statusLabels[connectionStatus]}
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
          {logs.length === 0 && (
            <div className="text-gray-600">Waiting for logs...</div>
          )}
          {logs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          <div ref={terminalEndRef} />
        </div>
        
        {/* Scroll-to-bottom button */}
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
