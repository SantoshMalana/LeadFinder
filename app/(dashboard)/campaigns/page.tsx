import { getCampaigns } from '@/actions/campaign.actions'
import CampaignForm from '@/components/CampaignForm'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function CampaignsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const campaigns = await getCampaigns()

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
              padding: '4px 12px', borderRadius: 6, fontSize: 13,
              color: 'var(--text-secondary)', textDecoration: 'none',
            }}>Analytics</Link>
            <Link href="/campaigns" style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500,
              color: 'var(--text-primary)', background: 'var(--bg-elevated)',
              textDecoration: 'none',
            }}>Campaigns</Link>
          </nav>
        </div>
      </header>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <CampaignForm />

        {campaigns.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              {campaigns.length} Campaign{campaigns.length !== 1 ? 's' : ''}
            </p>
            {campaigns.map(c => (
              <div
                key={c.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</p>
                      <span style={{
                        fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '2px 7px', borderRadius: 4,
                        ...(c.is_active
                          ? { background: 'var(--green-subtle)', color: 'var(--green)', border: '1px solid #1f4a38' }
                          : { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                        ),
                      }}>
                        {c.is_active ? 'Active' : 'Paused'}
                      </span>
                    </div>

                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                      {c.keywords.length} keywords · min score {c.min_score} · {c.subreddits.length} subreddits
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {c.keywords.slice(0, 6).map(kw => (
                        <span
                          key={kw}
                          style={{
                            fontSize: 11, color: 'var(--text-secondary)',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 4, padding: '2px 8px',
                          }}
                        >
                          {kw}
                        </span>
                      ))}
                      {c.keywords.length > 6 && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px' }}>
                          +{c.keywords.length - 6}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {campaigns.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 24px',
            border: '1px dashed var(--border)', borderRadius: 12,
          }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No campaigns yet — create one above</p>
          </div>
        )}
      </div>
    </div>
  )
}
