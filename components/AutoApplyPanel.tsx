'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AutoApplyStats } from '@/types'

export default function AutoApplyPanel({ userId, hasProfile, isRunning: initialRunning, stats }: {
  userId: string
  hasProfile: boolean
  isRunning: boolean
  stats: AutoApplyStats
}) {
  const [running, setRunning] = useState(initialRunning)
  const [loading, setLoading] = useState(false)
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
    } catch {}
    setLoading(false)
  }

  return (
    <div style={{
      background: running
        ? 'linear-gradient(135deg, #0f2520 0%, #111116 100%)'
        : 'var(--bg-surface)',
      border: `1px solid ${running ? '#1a3d2e' : 'var(--border)'}`,
      borderRadius: 16, padding: '24px 28px',
      position: 'relative', overflow: 'hidden',
    }}>
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
            {/* Status indicator */}
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
              Open the terminal running <code style={{ color: 'var(--accent)', fontSize: 11 }}>npx ts-node agents/runner.ts</code> to see live progress.
            </p>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 400 }}>
              Start the agent to begin auto-applying to jobs matching your profile.
              {!hasProfile && ' Upload your CV in Profile first.'}
            </p>
          )}
        </div>

        {/* Toggle Button */}
        <button
          onClick={toggleAutoApply}
          disabled={loading || !hasProfile}
          style={{
            padding: '14px 32px', borderRadius: 12, border: 'none',
            fontSize: 15, fontWeight: 700, cursor: hasProfile ? 'pointer' : 'not-allowed',
            background: running
              ? 'linear-gradient(135deg, #c62828, #b71c1c)'
              : hasProfile
                ? 'linear-gradient(135deg, var(--accent), #6a58e8)'
                : 'var(--bg-elevated)',
            color: hasProfile ? '#fff' : 'var(--text-muted)',
            opacity: loading ? 0.6 : 1,
            transition: 'all 0.2s',
            minWidth: 160,
          }}
        >
          {loading ? '...' : running ? '⏹ Stop Agent' : '🚀 Start Agent'}
        </button>
      </div>

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
