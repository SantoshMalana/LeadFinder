import { getLeads } from '@/actions/lead.actions'
import { getCampaigns } from '@/actions/campaign.actions'
import LeadCard from '@/components/LeadCard'
import ScanButton from '@/components/ScanButton'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [leads, campaigns] = await Promise.all([
    getLeads(),
    getCampaigns(),
  ])

  const hotLeads = leads.filter(l => (l.score ?? 0) >= 9).length
  const newLeads  = leads.filter(l => l.status === 'new').length

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
        position: 'sticky',
        top: 0,
        background: 'var(--bg-base)',
        zIndex: 40,
        backdropFilter: 'blur(8px)',
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
              padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500,
              color: 'var(--text-primary)', background: 'var(--bg-elevated)',
              textDecoration: 'none',
            }}>Leads</Link>
            <Link href="/analytics" style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 13,
              color: 'var(--text-secondary)', textDecoration: 'none',
            }}>Analytics</Link>
            <Link href="/campaigns" style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 13,
              color: 'var(--text-secondary)', textDecoration: 'none',
            }}>Campaigns</Link>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ScanButton />
          <form action="/auth/signout" method="POST">
            <button type="submit" style={{
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
              padding: '6px 10px',
            }}>Sign out</button>
          </form>
        </div>
      </header>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px' }}>

        {/* Stats row */}
        {leads.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
            {[
              { label: 'Total Leads', value: leads.length, color: 'var(--text-primary)' },
              { label: 'New', value: newLeads, color: 'var(--accent)' },
              { label: 'Hot (9+)', value: hotLeads, color: 'var(--green)' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '14px 20px',
                flex: 1,
              }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Empty states */}
        {campaigns.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '80px 24px',
            border: '1px dashed var(--border)', borderRadius: 16,
          }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: 15, fontWeight: 500 }}>No campaigns yet</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>Create a campaign to start finding leads automatically</p>
            <Link href="/campaigns" style={{
              background: 'var(--accent)', color: '#fff',
              padding: '8px 20px', borderRadius: 8,
              textDecoration: 'none', fontSize: 13, fontWeight: 500,
            }}>Create Campaign →</Link>
          </div>
        )}

        {campaigns.length > 0 && leads.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '80px 24px',
            border: '1px dashed var(--border)', borderRadius: 16,
          }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: 15, fontWeight: 500 }}>No leads yet</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Hit &ldquo;Scan Now&rdquo; to scrape Reddit for matching posts</p>
          </div>
        )}

        {/* Lead list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      </div>
    </div>
  )
}
