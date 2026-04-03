import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCampaigns } from '@/actions/campaign.actions'
import Link from 'next/link'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const campaigns = await getCampaigns()

  // Get lead stats
  const { data: leads } = await supabase
    .from('leads')
    .select('score, status, platform, found_at, campaign_id')
    .in('campaign_id', campaigns.map(c => c.id))

  const total = leads?.length || 0
  const avgScore = leads?.length
    ? (leads.reduce((sum, l) => sum + (l.score || 0), 0) / leads.length).toFixed(1)
    : '0'
  const hotLeads = leads?.filter(l => l.score >= 9).length || 0
  const replied = leads?.filter(l => l.status === 'replied').length || 0

  // Leads per campaign
  const campaignStats = campaigns.map(c => ({
    name: c.name,
    count: leads?.filter(l => l.campaign_id === c.id).length || 0,
    hot: leads?.filter(l => l.campaign_id === c.id && l.score >= 9).length || 0,
  }))

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Analytics</h1>
          <p className="text-gray-400 text-sm">Your lead performance at a glance</p>
        </div>
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-white border border-gray-700 px-4 py-2 rounded-lg transition"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Leads', value: total, color: 'text-white' },
            { label: 'Avg Score', value: avgScore, color: 'text-yellow-400' },
            { label: '🔥 Hot Leads', value: hotLeads, color: 'text-green-400' },
            { label: 'Replied', value: replied, color: 'text-purple-400' },
          ].map(stat => (
            <div
              key={stat.label}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5"
            >
              <p className="text-gray-400 text-xs mb-1">{stat.label}</p>
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Campaign Breakdown */}
        <div>
          <h2 className="text-lg font-semibold mb-4">By Campaign</h2>
          <div className="space-y-3">
            {campaignStats.map(c => (
              <div
                key={c.name}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-gray-400 text-sm">{c.count} total leads</p>
                </div>
                <div className="text-right">
                  <p className="text-green-400 font-bold">{c.hot}</p>
                  <p className="text-gray-600 text-xs">hot leads</p>
                </div>
              </div>
            ))}

            {campaignStats.length === 0 && (
              <p className="text-gray-600 text-sm">No campaign data yet</p>
            )}
          </div>
        </div>

        {/* Reply Rate */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-2">Reply Rate</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-gray-800 rounded-full h-3">
              <div
                className="bg-purple-600 h-3 rounded-full transition-all"
                style={{ width: total > 0 ? `${Math.round((replied / total) * 100)}%` : '0%' }}
              />
            </div>
            <span className="text-white font-bold text-sm">
              {total > 0 ? Math.round((replied / total) * 100) : 0}%
            </span>
          </div>
          <p className="text-gray-600 text-xs mt-2">
            {replied} replied out of {total} leads
          </p>
        </div>

      </div>
    </div>
  )
}
