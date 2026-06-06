'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LiveTerminal from '@/components/LiveTerminal'
import type { AutoApplyStats } from '@/types'

export default function AutoApplyPanel({ userId, hasProfile, isRunning: initialRunning, stats }: {
  userId: string
  hasProfile: boolean
  isRunning: boolean
  stats: AutoApplyStats
}) {
  const [running, setRunning] = useState(initialRunning)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isTerminalOpen, setIsTerminalOpen] = useState(false)
  const router = useRouter()

  async function toggleAutoApply() {
    setLoading(true)
    try {
      const endpoint = running ? '/api/autoapply/stop' : '/api/autoapply/start'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      if (res.ok) {
        setRunning(!running)
        router.refresh()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
    setLoading(false)
  }

  return (
    <div style={{
      background: running
        ? 'linear-gradient(135deg, #0f2520 0%, #111116 100%)'
        : 'var(--bg-surface)',
      border: `1px solid ${running ? '#1a3d2e' : 'var(--border)'}`,
      borderRadius: 16, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ padding: '24px 28px' }}>
        {/* Pulsing glow when running */}
        {running && (
          <div style={{
            position: 'absolute', top: -50, right: -50,
            width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(52,209,123,0.15) 0%, transparent 70%)',
            animation: 'pulse-glow 2s ease-in-out infinite',
          }} />
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: running ? 'var(--green)' : 'var(--text-muted)',
                boxShadow: running ? '0 0 8px var(--green)' : 'none',
                animation: running ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
              }} />
              <span style={{
                fontSize: 15, fontWeight: 600,
                color: running ? 'var(--green)' : 'var(--text-secondary)',
              }}>
                {running ? 'AutoApply Running' : 'AutoApply Stopped'}
              </span>
            </div>

            {running ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 400 }}>
                Agent is actively searching and applying to jobs. Applied {stats.today_applied}/{stats.today_limit} today.
              </p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 400 }}>
                Start the agent to begin auto-applying to jobs matching your profile.
                {!hasProfile && ' Upload your CV in Profile first.'}
              </p>
            )}
            
            {error && (
              <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>
                ❌ {error}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 160 }}>
            <button
              onClick={toggleAutoApply}
              disabled={loading || !hasProfile}
              style={{
                padding: '12px 24px', borderRadius: 12, border: 'none',
                fontSize: 14, fontWeight: 700, cursor: hasProfile ? 'pointer' : 'not-allowed',
                background: running
                  ? 'rgba(239, 68, 68, 0.1)'
                  : hasProfile
                    ? 'var(--accent)'
                    : 'var(--bg-elevated)',
                color: running ? '#ef4444' : '#fff',
                opacity: loading ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
            >
              {loading ? '...' : running ? '⏹ Stop Agent' : '🚀 Start Agent'}
            </button>
            <button
              onClick={() => setIsTerminalOpen(true)}
              style={{
                padding: '12px 24px', borderRadius: 12, border: '1px solid var(--border)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
              }}
            >
              View Live Progress
            </button>
          </div>
        </div>
      </div>

      <LiveTerminal isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
