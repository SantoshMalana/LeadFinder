import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getJobs, getJobStats } from '@/actions/job.actions'
import { getProfile } from '@/actions/profile.actions'
import AutoApplyPanel from '@/components/AutoApplyPanel'
import ApplicationCard from '@/components/ApplicationCard'

export default async function ApplicationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [jobs, stats, profile] = await Promise.all([
    getJobs({ limit: 50 }),
    getJobStats(),
    getProfile(),
  ])

  const hasProfile = !!profile?.parsed_data

  return (
    <div style={{ padding: '0 24px 40px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Page Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            AutoApply
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            AI-powered job applications — runs on your machine, applies while you sleep.
          </p>
        </div>

        {/* Warning if no profile */}
        {!hasProfile && (
          <div style={{
            background: '#251e0a', border: '1px solid #3d3000',
            borderRadius: 12, padding: '16px 20px', marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <p style={{ color: 'var(--yellow)', fontSize: 13, fontWeight: 500 }}>
                Upload your CV first
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                Go to <a href="/profile" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Profile</a> to upload and parse your resume before starting AutoApply.
              </p>
            </div>
          </div>
        )}

        {/* Control Panel */}
        <AutoApplyPanel
          userId={user.id}
          hasProfile={hasProfile}
          isRunning={profile?.autoapply_running || false}
          stats={stats}
        />

        {/* Stats Row */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12, marginBottom: 28, marginTop: 24,
        }}>
          {[
            { label: 'Total Applied', value: stats.total_applied, color: 'var(--green)' },
            { label: 'Today', value: `${stats.today_applied}/${stats.today_limit}`, color: 'var(--accent)' },
            { label: 'Failed (CAPTCHA etc)', value: stats.total_failed, color: 'var(--red)' },
            { label: 'Interviews', value: stats.total_interviews, color: 'var(--yellow)' },
            { label: 'Offers', value: stats.total_offers, color: 'var(--green)' },
            { label: 'Avg Match', value: `${stats.avg_match_score}/10`, color: 'var(--accent)' },
          ].map((stat, i) => (
            <div key={i} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 18px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Applications by Source */}
        {stats.applications_by_source.length > 0 && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '20px 24px', marginBottom: 24,
          }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Applications by Platform
            </h3>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {stats.applications_by_source.map((s) => (
                <div key={s.source} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                    background: s.source === 'linkedin' ? '#0a3d6e' : s.source === 'telegram' ? '#0a3d5e' : s.source === 'reddit' ? '#3d1a0a' : 'var(--bg-elevated)',
                    color: s.source === 'linkedin' ? '#5bb8f5' : s.source === 'telegram' ? '#5ba8f5' : s.source === 'reddit' ? '#f5985b' : 'var(--text-secondary)',
                  }}>
                    {s.source}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7-Day Chart */}
        {stats.applications_by_day.length > 0 && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '20px 24px', marginBottom: 28,
          }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Last 7 Days
            </h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
              {stats.applications_by_day.map((d) => {
                const maxCount = Math.max(...stats.applications_by_day.map(x => x.count), 1)
                const height = Math.max((d.count / maxCount) * 64, 4)
                return (
                  <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      height, background: d.count > 0 ? 'var(--accent)' : 'var(--bg-elevated)',
                      borderRadius: 4, marginBottom: 6, transition: 'height 0.3s ease',
                    }} />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {new Date(d.date).toLocaleDateString('en', { weekday: 'short' })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Job Applications List */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            All Applications ({jobs.length})
          </h3>
        </div>

        {jobs.length === 0 ? (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '48px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              No applications yet. Start AutoApply to begin!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {jobs.map(job => (
              <ApplicationCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
