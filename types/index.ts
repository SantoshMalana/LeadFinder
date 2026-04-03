export type Plan = 'free' | 'starter' | 'pro' | 'agency'
export type Platform = 'reddit' | 'twitter' | 'linkedin'
export type LeadStatus = 'new' | 'seen' | 'replied'

export interface User {
  id: string
  email: string
  name: string | null
  plan: Plan
  voice_profile: string | null
  portfolio_summary: string | null
  created_at: string
}

export interface Campaign {
  id: string
  user_id: string
  name: string
  keywords: string[]
  subreddits: string[]
  platforms: Platform[]
  min_score: number
  is_active: boolean
  created_at: string
}

export interface Lead {
  id: string
  campaign_id: string
  platform: Platform
  post_id: string
  post_title: string
  post_body: string | null
  post_url: string
  author: string | null
  score: number | null
  score_reason: string | null
  status: LeadStatus
  found_at: string
}

export interface OutreachLog {
  id: string
  lead_id: string
  user_id: string
  generated_reply: string | null
  sent: boolean
  replied_back: boolean
  created_at: string
}

export interface RawPost {
  post_id: string
  post_title: string
  post_body: string
  post_url: string
  author: string
  platform: Platform
  subreddit?: string
}

export interface ScoreResult {
  score: number
  reason: string
}