'use client'

import { useState, useEffect, useRef } from 'react'
import { updateJobPreferences } from '@/actions/profile.actions'
import type { JobPreferences } from '@/types'

const DEFAULT_PREFS: JobPreferences = {
  roles: ['Full Stack Developer', 'Frontend Developer', 'React Developer'],
  locations: ['Remote', 'Bangalore'],
  remote_preference: 'remote',
  salary_min: null,
  salary_max: null,
  job_types: ['full-time', 'internship'],
  industries: ['SaaS', 'Fintech', 'AI/ML'],
  company_sizes: ['startup', 'mid', 'any'],
  max_applications_per_day: 25,
  auto_apply_threshold: 7,
}

export default function PreferencesForm({ userId, existing }: {
  userId: string
  existing?: JobPreferences
}) {
  const init = existing || DEFAULT_PREFS
  const [prefs, setPrefs] = useState<JobPreferences>(init)
  const [rolesText, setRolesText] = useState(init.roles.join(', '))
  const [locationsText, setLocationsText] = useState(init.locations.join(', '))
  const [industriesText, setIndustriesText] = useState(init.industries.join(', '))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (existing) {
      setPrefs(existing)
      setRolesText(existing.roles.join(', '))
      setLocationsText(existing.locations.join(', '))
      setIndustriesText(existing.industries.join(', '))
    }
  }, [existing])

  async function handleSave() {
    setSaving(true)
    setErrorMsg(null)
    try {
      const finalPrefs = {
        ...prefs,
        roles: rolesText.split(',').map(s => s.trim()).filter(Boolean),
        locations: locationsText.split(',').map(s => s.trim()).filter(Boolean),
        industries: industriesText.split(',').map(s => s.trim()).filter(Boolean),
      }
      await updateJobPreferences(finalPrefs)
      setPrefs(finalPrefs)
      setSaved(true)
      // Cleanup timeout correctly to avoid overlapping
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      console.error(err)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save preferences')
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
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Roles */}
        <div>
          <label style={labelStyle}>Target Roles (comma-separated)</label>
          <input
            style={inputStyle}
            value={rolesText}
            onChange={(e) => setRolesText(e.target.value)}
            placeholder="Full Stack Developer, React Developer"
          />
        </div>

        {/* Locations */}
        <div>
          <label style={labelStyle}>Preferred Locations</label>
          <input
            style={inputStyle}
            value={locationsText}
            onChange={(e) => setLocationsText(e.target.value)}
            placeholder="Remote, Bangalore, Mumbai"
          />
        </div>

        {/* Remote Preference */}
        <div>
          <label style={labelStyle}>Remote Preference</label>
          <select
            style={inputStyle}
            value={prefs.remote_preference}
            onChange={(e) => setPrefs({ ...prefs, remote_preference: e.target.value as JobPreferences['remote_preference'] })}
          >
            <option value="remote">Remote Only</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
            <option value="any">Any</option>
          </select>
        </div>

        {/* Industries */}
        <div>
          <label style={labelStyle}>Target Industries</label>
          <input
            style={inputStyle}
            value={industriesText}
            onChange={(e) => setIndustriesText(e.target.value)}
            placeholder="SaaS, Fintech, AI/ML"
          />
        </div>

        {/* Max Daily Applications */}
        <div>
          <label style={labelStyle}>
            Max Applications Per Day: <span style={{ color: 'var(--accent)' }}>{prefs.max_applications_per_day}</span>
          </label>
          <input
            type="range" min="5" max="100" step="5"
            style={{ width: '100%', accentColor: 'var(--accent)' }}
            value={prefs.max_applications_per_day}
            onChange={(e) => setPrefs({ ...prefs, max_applications_per_day: Number(e.target.value) })}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>5 (safe)</span><span>50 (moderate)</span><span>100 (aggressive)</span>
          </div>
        </div>

        {/* Auto Apply Threshold */}
        <div>
          <label style={labelStyle}>
            Auto-Apply Threshold: <span style={{ color: 'var(--accent)' }}>{prefs.auto_apply_threshold}/10</span>
          </label>
          <input
            type="range" min="5" max="10" step="1"
            style={{ width: '100%', accentColor: 'var(--accent)' }}
            value={prefs.auto_apply_threshold}
            onChange={(e) => setPrefs({ ...prefs, auto_apply_threshold: Number(e.target.value) })}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>5 (apply to more)</span><span>7 (balanced)</span><span>10 (only perfect matches)</span>
          </div>
        </div>
      </div>

      {/* Job Types */}
      <div style={{ marginTop: 16 }}>
        <label style={labelStyle}>Job Types</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['full-time', 'part-time', 'contract', 'internship'] as const).map(type => {
            const active = prefs.job_types.includes(type)
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  const types = active
                    ? prefs.job_types.filter(t => t !== type)
                    : [...prefs.job_types, type]
                  setPrefs({ ...prefs, job_types: types })
                }}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accent-subtle)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer', textTransform: 'capitalize',
                }}
              >
                {type}
              </button>
            )
          })}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 24, padding: '12px 32px', borderRadius: 10, border: 'none',
          background: saved ? 'var(--green)' : 'var(--accent)',
          color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Preferences'}
      </button>
      {errorMsg && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{errorMsg}</p>}
    </div>
  )
}
