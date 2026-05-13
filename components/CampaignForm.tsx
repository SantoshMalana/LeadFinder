'use client'

import { useState } from 'react'
import { createCampaign } from '@/actions/campaign.actions'
import { useRouter } from 'next/navigation'

export default function CampaignForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [keywordsRaw, setKeywordsRaw] = useState(
    'need react dev, hire full stack, looking for developer, need a website, node.js developer, next.js developer, need freelancer, build my app'
  )
  const [subredditsRaw, setSubredditsRaw] = useState(
    'forhire, slavelabour, startups, entrepreneur, webdev, hiring'
  )
  const [minScore, setMinScore] = useState(7)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!name.trim()) return
    setLoading(true)
    try {
      await createCampaign({
        name,
        keywords: keywordsRaw.split(',').map(k => k.trim()).filter(Boolean),
        subreddits: subredditsRaw.split(',').map(s => s.trim()).filter(Boolean),
        min_score: minScore,
      })
      setName('')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--text-primary)',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  }

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px 24px',
    }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
        New Campaign
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Name */}
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            Campaign name
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. React Dev Leads"
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
        </div>

        {/* Keywords */}
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            Keywords <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· comma separated</span>
          </label>
          <textarea
            value={keywordsRaw}
            onChange={e => setKeywordsRaw(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
        </div>

        {/* Subreddits */}
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            Subreddits <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· no r/</span>
          </label>
          <input
            value={subredditsRaw}
            onChange={e => setSubredditsRaw(e.target.value)}
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
        </div>

        {/* Min score slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Minimum score
            </label>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{minScore}</span>
          </div>
          <input
            type="range"
            min={5}
            max={10}
            step={1}
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>5 · More leads</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>10 · Best only</span>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !name.trim()}
          style={{
            background: (!loading && name.trim()) ? 'var(--accent)' : 'var(--bg-elevated)',
            color: (!loading && name.trim()) ? '#fff' : 'var(--text-muted)',
            border: (!loading && name.trim()) ? 'none' : '1px solid var(--border)',
            borderRadius: 8,
            padding: '9px',
            fontSize: 13,
            fontWeight: 500,
            cursor: (!loading && name.trim()) ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
            marginTop: 4,
          }}
        >
          {loading ? 'Creating…' : 'Create Campaign'}
        </button>
      </div>
    </div>
  )
}
