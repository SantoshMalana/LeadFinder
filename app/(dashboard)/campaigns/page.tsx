import { getCampaigns } from '@/actions/campaign.actions'
import CampaignForm from '@/components/CampaignForm'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { toggleCampaign, deleteCampaign } from '@/actions/campaign.actions'

export default async function CampaignsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const campaigns = await getCampaigns()

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold">Campaigns</h1>
        <p className="text-gray-400 text-sm">Manage your lead hunting campaigns</p>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <CampaignForm />

        <div className="space-y-4">
          {campaigns.map(c => (
            <div
              key={c.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-white">{c.name}</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    {c.keywords.length} keywords · min score {c.min_score}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.keywords.slice(0, 5).map(kw => (
                      <span
                        key={kw}
                        className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      c.is_active
                        ? 'bg-green-900 text-green-400'
                        : 'bg-gray-800 text-gray-500'
                    }`}
                  >
                    {c.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
