'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type ScanState = 'idle' | 'scanning' | 'done' | 'error'

export default function ScanButton() {
  const router = useRouter()
  const [state, setState] = useState<ScanState>('idle')
  const [saved, setSaved] = useState(0)
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (resetRef.current) clearTimeout(resetRef.current)
      abortRef.current?.abort()
    }
  }, [])

  function startPolling() {
    // Refresh server data every 18s so leads appear progressively
    pollRef.current = setInterval(() => router.refresh(), 18_000)
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  async function handleScan() {
    if (state === 'scanning') return

    // Cancel any in-flight request from a previous scan
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setState('scanning')
    setSaved(0)
    startPolling()

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        signal: abortRef.current.signal,
      })

      const data = await res.json()
      stopPolling()

      const count = data.saved ?? 0
      setSaved(count)
      setState('done')

      // Final fresh pull — picks up anything found in the last poll window
      router.refresh()

      // Auto-reset button label after 4s
      resetRef.current = setTimeout(() => setState('idle'), 4000)

    } catch (err: unknown) {
      stopPolling()

      // AbortError = unmounted or re-triggered; don't update state
      if (err instanceof Error && err.name === 'AbortError') return

      setState('error')
      router.refresh() // still try to pick up any partial results
      resetRef.current = setTimeout(() => setState('idle'), 3000)
    }
  }

  // ─── Styles ──────────────────────────────────────────────────────────────

  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: state === 'scanning' ? 'not-allowed' : 'pointer',
    border: 'none',
    transition: 'background 0.15s, color 0.15s',
    whiteSpace: 'nowrap',
  }

  const variants: Record<ScanState, React.CSSProperties> = {
    idle:     { background: 'var(--accent)',        color: '#fff' },
    scanning: { background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid var(--accent)' },
    done:     { background: 'var(--green-subtle)',  color: 'var(--green)',   border: '1px solid #1f4a38' },
    error:    { background: 'var(--bg-elevated)',   color: 'var(--text-muted)', border: '1px solid var(--border)' },
  }

  const label: Record<ScanState, string> = {
    idle:     'Scan Now',
    scanning: 'Scanning…',
    done:     saved > 0 ? `${saved} lead${saved !== 1 ? 's' : ''} found` : 'Up to date',
    error:    'Scan failed',
  }

  return (
    <button
      onClick={handleScan}
      disabled={state === 'scanning'}
      style={{ ...base, ...variants[state] }}
      title={state === 'scanning' ? 'Scanning Reddit for leads…' : 'Scan Reddit now'}
    >
      {state === 'scanning' ? <Spinner /> : <ScanIcon state={state} />}
      {label[state]}
    </button>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.2"
      style={{ animation: 'lf-spin 0.75s linear infinite', flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
      <style>{`@keyframes lf-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  )
}

function ScanIcon({ state }: { state: ScanState }) {
  if (state === 'done') {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
        <polyline points="3 8 6.5 11.5 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5.5v2.5l1.5 1" strokeLinecap="round" />
    </svg>
  )
}
