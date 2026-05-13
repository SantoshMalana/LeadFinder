'use client'

import { useState } from 'react'
import { Lead } from '@/types'

interface Props {
  lead: Lead
  onClose: () => void
}

export default function ReplyModal({ lead, onClose }: Props) {
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function generateReply() {
    setLoading(true)
    try {
      const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id }),
      })
      const data = await res.json()
      setReply(data.reply || 'Failed to generate reply')
    } catch {
      setReply('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function copyReply() {
    await navigator.clipboard.writeText(reply)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: 16,
      }}
    >
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: 14,
        width: '100%', maxWidth: 520,
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>AI Reply</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Tailored to this post</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', borderRadius: 6,
              width: 28, height: 28, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Post reference */}
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          }}>
            <p style={{
              fontSize: 12, color: 'var(--text-secondary)',
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {lead.post_title}
            </p>
          </div>

          {/* Generate button */}
          {!reply && (
            <button
              onClick={generateReply}
              disabled={loading}
              style={{
                width: '100%', padding: '10px',
                background: loading ? 'var(--bg-elevated)' : 'var(--accent)',
                color: loading ? 'var(--text-muted)' : '#fff',
                border: loading ? '1px solid var(--border)' : 'none',
                borderRadius: 8, fontSize: 13, fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? (
                <>
                  <Spinner />
                  Generating…
                </>
              ) : (
                'Generate Reply'
              )}
            </button>
          )}

          {/* Reply textarea */}
          {reply && (
            <div>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                rows={6}
                style={{
                  width: '100%', background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8, padding: '10px 14px',
                  fontSize: 13, color: 'var(--text-primary)',
                  resize: 'vertical', outline: 'none',
                  lineHeight: 1.6, fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  onClick={copyReply}
                  style={{
                    flex: 1, padding: '8px',
                    background: copied ? 'var(--green-subtle)' : 'var(--accent)',
                    color: copied ? 'var(--green)' : '#fff',
                    border: copied ? '1px solid #1f4a38' : 'none',
                    borderRadius: 8, fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy Reply'}
                </button>
                <button
                  onClick={generateReply}
                  disabled={loading}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    borderRadius: 8, fontSize: 13,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'border-color 0.15s',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {loading ? <Spinner /> : null}
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  )
}
