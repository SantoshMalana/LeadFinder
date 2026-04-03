import { getLeads } from '@/actions/lead.actions'
import { getCampaigns } from '@/actions/campaign.actions'
import LeadCard from '@/components/LeadCard'
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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">LeadFinder</h1>
          <p className="text-gray-400 text-sm">{leads.length} leads found</p>
        </div>
        <div className="flex gap-3 items-center">
          <Link
            href="/analytics"
            className="text-sm text-gray-400 hover:text-white px-4 py-2 transition"
          >
            Analytics
          </Link>
          <Link
            href="/campaigns"
            className="text-sm text-gray-400 hover:text-white px-4 py-2 border border-gray-700 rounded-lg transition"
          >
            Campaigns
          </Link>
          <form action="/api/scrape" method="POST">
            <button
              type="submit"
              className="text-sm bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition"
            >
              Scan Now
            </button>
          </form>
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="text-sm text-gray-500 hover:text-gray-300 transition"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {campaigns.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-4">No campaigns yet</p>
            <Link
              href="/campaigns"
              className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg text-sm transition"
            >
              Create Your First Campaign →
            </Link>
          </div>
        )}

        {campaigns.length > 0 && leads.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-2">No leads yet</p>
            <p className="text-gray-600 text-sm">Click "Scan Now" to find leads</p>
          </div>
        )}

        <div className="space-y-4">
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      </div>
    </div>
  )
}
