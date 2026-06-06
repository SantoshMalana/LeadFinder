'use client'

import { useState } from 'react'
import type { Job } from '@/types'

const SOURCE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  linkedin: { bg: '#0a3d6e', color: '#5bb8f5', label: 'LinkedIn' },
  telegram: { bg: '#0a2d4e', color: '#5b9ef5', label: 'Telegram' },
  reddit: { bg: '#3d1a0a', color: '#f5985b', label: 'Reddit' },
  indeed: { bg: '#1a0a3d', color: '#9b5bf5', label: 'Indeed' },
  naukri: { bg: '#0a3d2e', color: '#5bf59b', label: 'Naukri' },
  angellist: { bg: '#3d0a1a', color: '#f55b98', label: 'AngelList' },
  direct: { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', label: 'Direct' },
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  applied: { bg: 'var(--green-subtle)', color: 'var(--green)' },
  failed: { bg: '#2d0a0a', color: 'var(--red)' },
  queued: { bg: 'var(--yellow-subtle)', color: 'var(--yellow)' },
  discovered: { bg: 'var(--bg-elevated)', color: 'var(--text-muted)' },
  interview: { bg: 'var(--accent-subtle)', color: 'var(--accent)' },
  offer: { bg: '#0a2d0a', color: '#5bf55b' },
  rejected: { bg: '#2d0a0a', color: '#f57171' },
  skipped: { bg: 'var(--bg-elevated)', color: 'var(--text-muted)' },
  applying: { bg: 'var(--yellow-subtle)', color: 'var(--yellow)' },
}

export default function ApplicationCard({ job }: { job: Job }) {
  const [expanded, setExpanded] = useState(false)

  const sourceStyle = SOURCE_STYLES[job.source] || SOURCE_STYLES.direct
  const statusStyle = STATUS_STYLES[job.status] || STATUS_STYLES.discovered

  const scoreColor = (job.match_score || 0) >= 9
    ? 'var(--green)' : (job.match_score || 0) >= 7
    ? 'var(--yellow)' : 'var(--text-muted)'

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${job.status === 'interview' ? 'var(--accent)' : job.status === 'offer' ? 'var(--green)' : 'var(--border)'}`,
        borderRadius: 12, padding: '14px 18px',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {/* Main Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Score */}
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'var(--bg-elevated)', border: `1.5px solid ${scoreColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: scoreColor, flexShrink: 0,
        }}>
          {job.match_score ? Math.round(job.match_score) : '—'}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {job.title}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            <span>{job.company}</span>
            {job.location && <><span>•</span><span>{job.location}</span></>}
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{
            padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
            background: sourceStyle.bg, color: sourceStyle.color,
          }}>
            {sourceStyle.label}
          </span>
          <span style={{
            padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
            background: statusStyle.bg, color: statusStyle.color,
            textTransform: 'capitalize',
          }}>
            {job.status}
          </span>
        </div>

        {/* Timestamp */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, width: 65, textAlign: 'right' }}>
          {job.applied_at
            ? new Date(job.applied_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
            : new Date(job.discovered_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {/* Match Reason */}
          {job.match_reason && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>AI Match: </span>
              {job.match_reason}
            </div>
          )}

          {/* Failure Reason */}
          {job.failure_reason && (
            <div style={{
              fontSize: 12, padding: '8px 12px', borderRadius: 8,
              background: '#2d0a0a', color: 'var(--red)', marginBottom: 12,
            }}>
              ❌ {job.failure_reason}
            </div>
          )}

          {/* Description */}
          {job.description && (
            <div style={{
              fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
              maxHeight: 120, overflow: 'hidden', marginBottom: 12,
            }}>
              {job.description.length > 400 ? `${job.description.slice(0, 400)}...` : job.description}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            {job.job_url && (
              <a
                href={job.job_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)', textDecoration: 'none',
                }}
              >
                View Job ↗
              </a>
            )}
            {job.status === 'failed' && (
              <button
                onClick={(e) => { e.stopPropagation() }}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
