'use client'

import { useState, useEffect } from 'react'
import { updateJobPreferences } from '@/actions/profile.actions'
import type { JobPreferences } from '@/types'

const DEFAULT_STEALTH = {
  proxies: [],
  typing_profile: 'normal' as const,
  captcha_key: '',
  max_actions_per_hour: 50,
}

export default function StealthSettingsForm({ userId, existing }: {
  userId: string
  existing?: JobPreferences
}) {
  const [stealth, setStealth] = useState(existing?.stealth || DEFAULT_STEALTH)
  const [proxiesText, setProxiesText] = useState(stealth.proxies.join('\n'))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (existing?.stealth) {
      setStealth(existing.stealth)
      setProxiesText(existing.stealth.proxies.join('\n'))
    }
  }, [existing])

  async function handleSave() {
    if (!existing) return
    setSaving(true)
    setErrorMsg(null)
    try {
      const finalStealth = {
        ...stealth,
        proxies: proxiesText.split('\n').map(s => s.trim()).filter(Boolean),
      }
      
      const updatedPrefs = {
        ...existing,
        stealth: finalStealth,
      }
      
      await updateJobPreferences(updatedPrefs)
      setStealth(finalStealth)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      console.error(err)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save stealth settings')
    }
    setSaving(false)
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13,
    outline: 'none',
  }

  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 600 as const, color: 'var(--text-muted)',
    textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6,
  }

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#f87171' }}>
        🕵️ Ghost Protocol Settings
      </h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Typing Profile */}
        <div>
          <label style={labelStyle}>Human Typing Speed</label>
          <select
            style={inputStyle}
            value={stealth.typing_profile}
            onChange={(e) => setStealth({ ...stealth, typing_profile: e.target.value as any })}
          >
            <option value="fast">Fast (85 WPM, 2% typos)</option>
            <option value="normal">Normal (55 WPM, 4% typos)</option>
            <option value="slow">Slow (35 WPM, 6% typos)</option>
          </select>
        </div>

        {/* Captcha API Key */}
        <div>
          <label style={labelStyle}>2Captcha API Key (Optional)</label>
          <input
            style={inputStyle}
            type="password"
            value={stealth.captcha_key || ''}
            onChange={(e) => setStealth({ ...stealth, captcha_key: e.target.value })}
            placeholder="Enter key to auto-solve CAPTCHAs"
          />
        </div>

        {/* Max Actions Per Hour */}
        <div>
          <label style={labelStyle}>
            Circuit Breaker Threshold: <span style={{ color: '#f87171' }}>{stealth.max_actions_per_hour} actions/hr</span>
          </label>
          <input
            type="range" min="10" max="200" step="10"
            style={{ width: '100%', accentColor: '#f87171' }}
            value={stealth.max_actions_per_hour}
            onChange={(e) => setStealth({ ...stealth, max_actions_per_hour: Number(e.target.value) })}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>10 (Ultra Safe)</span><span>100 (Risky)</span><span>200 (Aggressive)</span>
          </div>
        </div>

        {/* Proxies */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Residential Proxies (One per line)</label>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Format: <code>username:password@ip:port</code> or <code>ip:port</code>
          </p>
          <textarea
            style={{ ...inputStyle, minHeight: 100, fontFamily: 'monospace' }}
            value={proxiesText}
            onChange={(e) => setProxiesText(e.target.value)}
            placeholder="user:pass@192.168.1.1:8080"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !existing}
        style={{
          marginTop: 24, padding: '12px 32px', borderRadius: 10, border: 'none',
          background: saved ? 'var(--green)' : '#f87171',
          color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          transition: 'all 0.2s',
          opacity: existing ? 1 : 0.5,
        }}
      >
        {saving ? 'Saving...' : saved ? '✓ Settings Saved!' : 'Save Ghost Protocol'}
      </button>
      {errorMsg && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{errorMsg}</p>}
    </div>
  )
}
