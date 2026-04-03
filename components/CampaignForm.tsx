'use client'

import { useState } from 'react'
import { createCampaign } from '@/actions/campaign.actions'
import { useRouter } from 'next/navigation'

export default function CampaignForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [keywordsRaw, setKeywordsRaw] = useState(
    'need react dev, hire full stack, looking for developer, need a website, node.js developer, next.js developer, need freelancer, build my app'
  )
  const [subredditsRaw, setSubredditsRaw] = useState(
    'forhire, slavelabour, startups, entrepreneur, webdev, hiring'
  )
  const [minScore, setMinScore] = useState(7)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!name.trim()) return
    setLoading(true)
    try {
      await createCampaign({
        name,
        keywords: keywordsRaw.split(',').map(k => k.trim()).filter(Boolean),
        subreddits: subredditsRaw.split(',').map(s => s.trim()).filter(Boolean),
        min_score: minScore,
      })
      setName('')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="font-semibold text-white mb-4">New Campaign</h2>

      <div className="space-y-4">
        <div>
          <label className="text-gray-400 text-sm block mb-1">Campaign Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. React Dev Leads"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label className="text-gray-400 text-sm block mb-1">
            Keywords <span className="text-gray-600">(comma separated)</span>
          </label>
          <textarea
            value={keywordsRaw}
            onChange={e => setKeywordsRaw(e.target.value)}
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 resize-none"
          />
        </div>

        <div>
          <label className="text-gray-400 text-sm block mb-1">
            Subreddits <span className="text-gray-600">(comma separated, no r/)</span>
          </label>
          <input
            value={subredditsRaw}
            onChange={e => setSubredditsRaw(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label className="text-gray-400 text-sm block mb-1">
            Minimum Score: <span className="text-purple-400 font-bold">{minScore}</span>
          </label>
          <input
            type="range"
            min={5}
            max={10}
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>5 — More leads</span>
            <span>10 — Only best</span>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !name.trim()}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium transition"
        >
          {loading ? 'Creating...' : 'Create Campaign'}
        </button>
      </div>
    </div>
  )
}
