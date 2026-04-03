'use client'

import { useState } from 'react'
import { Lead } from '@/types'

interface Props {
  lead: Lead
  onClose: () => void
}

export default function ReplyModal({ lead, onClose }: Props) {
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function generateReply() {
    setLoading(true)
    try {
      const res = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id }),
      })
      const data = await res.json()
      setReply(data.reply || 'Failed to generate reply')
    } catch {
      setReply('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function copyReply() {
    await navigator.clipboard.writeText(reply)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="font-semibold text-white">Generate Reply</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="p-5">
          <div className="bg-gray-800 rounded-lg p-3 mb-4">
            <p className="text-gray-300 text-sm line-clamp-2">{lead.post_title}</p>
          </div>

          {!reply && (
            <button
              onClick={generateReply}
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 py-3 rounded-lg text-sm font-medium transition"
            >
              {loading ? 'Generating...' : '✨ Generate AI Reply'}
            </button>
          )}

          {reply && (
            <div>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                rows={5}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-white resize-none focus:outline-none focus:border-purple-500"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={copyReply}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 py-2 rounded-lg text-sm transition"
                >
                  {copied ? '✓ Copied!' : 'Copy Reply'}
                </button>
                <button
                  onClick={generateReply}
                  disabled={loading}
                  className="px-4 py-2 border border-gray-700 hover:border-gray-600 rounded-lg text-sm text-gray-400 transition"
                >
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
