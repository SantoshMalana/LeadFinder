'use client'

import { useState } from 'react'
import { Lead } from '@/types'
import ScoreBadge from './ScoreBadge'
import ReplyModal from './ReplyModal'
import { markLeadSeen } from '@/actions/lead.actions'

interface Props { lead: Lead }

export default function LeadCard({ lead }: Props) {
  const [showReply, setShowReply] = useState(false)

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <ScoreBadge score={lead.score} />
              <span className="text-gray-500 text-xs capitalize">{lead.platform}</span>
              <span className="text-gray-600 text-xs">u/{lead.author}</span>
            </div>
            <h3 className="text-white font-medium leading-snug mb-1 truncate">
              {lead.post_title}
            </h3>
            {lead.post_body && (
              <p className="text-gray-400 text-sm line-clamp-2">
                {lead.post_body}
              </p>
            )}
            {lead.score_reason && (
              <p className="text-purple-400 text-xs mt-2">
                💡 {lead.score_reason}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <a
            href={lead.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg transition"
          >
            View Post ↗
          </a>
          <button
            onClick={() => setShowReply(true)}
            className="text-xs bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-lg transition"
          >
            Generate Reply
          </button>
          {lead.status === 'new' && (
            <button
              onClick={() => markLeadSeen(lead.id)}
              className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5 transition"
            >
              Mark Seen
            </button>
          )}
        </div>
      </div>

      {showReply && (
        <ReplyModal lead={lead} onClose={() => setShowReply(false)} />
      )}
    </>
  )
}
