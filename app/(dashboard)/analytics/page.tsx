import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCampaigns } from '@/actions/campaign.actions'
import Link from 'next/link'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const campaigns = await getCampaigns()

  const { data: leads } = await supabase
    .from('leads')
    .select('score, status, platform, found_at, campaign_id')
    .in('campaign_id', campaigns.map(c => c.id))

  const total      = leads?.length || 0
  const scoredLeads = leads?.filter(l => l.score !== null) || []
  const avgScore   = scoredLeads.length
    ? (scoredLeads.reduce((sum, l) => sum + (l.score || 0), 0) / scoredLeads.length).toFixed(1)
    : '—'
  const hotLeads   = leads?.filter(l => (l.score ?? 0) >= 9).length || 0
  const replied    = leads?.filter(l => l.status === 'replied').length || 0
  const replyRate  = total > 0 ? Math.round((replied / total) * 100) : 0

  const campaignStats = campaigns.map(c => ({
    name:  c.name,
    count: leads?.filter(l => l.campaign_id === c.id).length || 0,
    hot:   leads?.filter(l => l.campaign_id === c.id && (l.score ?? 0) >= 9).length || 0,
  }))

  const stats = [
    { label: 'Total Leads',  value: total,    color: 'var(--text-primary)' },
    { label: 'Avg Score',    value: avgScore,  color: 'var(--yellow)' },
    { label: 'Hot (9+)',     value: hotLeads,  color: 'var(--green)' },
    { label: 'Replied',      value: replied,   color: 'var(--accent)' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky', top: 0,
        background: 'var(--bg-base)',
        zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff',
            }}>L</div>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>LeadFinder</span>
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Link href="/" style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 13,
              color: 'var(--text-secondary)', textDecoration: 'none',
            }}>Leads</Link>
            <Link href="/analytics" style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500,
              color: 'var(--text-primary)', background: 'var(--bg-elevated)',
              textDecoration: 'none',
            }}>Analytics</Link>
            <Link href="/campaigns" style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 13,
              color: 'var(--text-secondary)', textDecoration: 'none',
            }}>Campaigns</Link>
          </nav>
        </div>
      </header>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {stats.map(s => (
            <div key={s.label} style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '16px 18px',
            }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{s.label}</p>
              <p style={{ fontSize: 26, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Reply rate bar */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '18px 20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Reply Rate</p>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{replyRate}%</span>
          </div>
          <div style={{ height: 5, background: 'var(--bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${replyRate}%`,
              background: 'var(--accent)',
              borderRadius: 99,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            {replied} replied · {total} total leads
          </p>
        </div>

        {/* Per-campaign breakdown */}
        {campaignStats.length > 0 && (
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              By Campaign
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {campaignStats.map(c => {
                const hotPct = c.count > 0 ? Math.round((c.hot / c.count) * 100) : 0
                return (
                  <div key={c.name} style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>{c.name}</p>
                      <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${hotPct}%`,
                          background: 'var(--green)', borderRadius: 99,
                        }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{c.hot}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.count} total</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {total === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 24px',
            border: '1px dashed var(--border)', borderRadius: 12,
          }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No data yet — run a scan to see analytics</p>
          </div>
        )}
      </div>
    </div>
  )
}