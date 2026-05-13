'use client'

import { useState } from 'react'
import { Lead } from '@/types'
import ScoreBadge from './ScoreBadge'
import ReplyModal from './ReplyModal'
import { markLeadSeen } from '@/actions/lead.actions'

interface Props { lead: Lead }

export default function LeadCard({ lead }: Props) {
  const [showReply, setShowReply] = useState(false)
  const isNew = lead.status === 'new'

  return (
    <>
      <div style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${isNew ? 'var(--border-light)' : 'var(--border)'}`,
        borderRadius: 12,
        padding: '16px 20px',
        transition: 'border-color 0.15s, background 0.15s',
        position: 'relative',
        overflow: 'hidden',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)'
        }}
      >
        {/* New indicator */}
        {isNew && (
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: 3, height: '100%',
            background: 'var(--accent)',
            borderRadius: '12px 0 0 12px',
          }} />
        )}

        <div style={{ paddingLeft: isNew ? 8 : 0 }}>
          {/* Top row: badges + meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <ScoreBadge score={lead.score} />
            <span style={{
              fontSize: 11, color: 'var(--text-muted)',
              textTransform: 'capitalize', letterSpacing: '0.03em',
            }}>
              r/{lead.platform}
            </span>
            {lead.author && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                · u/{lead.author}
              </span>
            )}
            {isNew && (
              <span style={{
                marginLeft: 'auto',
                fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
                color: 'var(--accent)',
                textTransform: 'uppercase',
              }}>New</span>
            )}
          </div>

          {/* Title */}
          <p style={{
            fontSize: 14, fontWeight: 500,
            color: 'var(--text-primary)',
            marginBottom: 4,
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {lead.post_title}
          </p>

          {/* Body snippet */}
          {lead.post_body && (
            <p style={{
              fontSize: 12, color: 'var(--text-secondary)',
              lineHeight: 1.5, marginBottom: 4,
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {lead.post_body}
            </p>
          )}

          {/* AI reason */}
          {lead.score_reason && (
            <p style={{
              fontSize: 11, color: 'var(--text-muted)',
              marginTop: 6, fontStyle: 'italic',
            }}>
              {lead.score_reason}
            </p>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <a
              href={lead.post_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12, color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6, padding: '4px 12px',
                textDecoration: 'none',
                transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget
                el.style.color = 'var(--text-primary)'
                el.style.borderColor = 'var(--border-light)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget
                el.style.color = 'var(--text-secondary)'
                el.style.borderColor = 'var(--border)'
              }}
            >
              View Post ↗
            </a>

            <button
              onClick={() => setShowReply(true)}
              style={{
                fontSize: 12, fontWeight: 500,
                background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 6,
                padding: '4px 12px', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget).style.background = 'var(--accent-hover)' }}
              onMouseLeave={e => { (e.currentTarget).style.background = 'var(--accent)' }}
            >
              Generate Reply
            </button>

            {isNew && (
              <button
                onClick={() => markLeadSeen(lead.id)}
                style={{
                  fontSize: 12, color: 'var(--text-muted)',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', padding: '4px 8px',
                  transition: 'color 0.15s',
                  marginLeft: 'auto',
                }}
                onMouseEnter={e => { (e.currentTarget).style.color = 'var(--text-secondary)' }}
                onMouseLeave={e => { (e.currentTarget).style.color = 'var(--text-muted)' }}
              >
                Mark seen
              </button>
            )}
          </div>
        </div>
      </div>

      {showReply && (
        <ReplyModal lead={lead} onClose={() => setShowReply(false)} />
      )}
    </>
  )
}
