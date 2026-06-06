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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AutoApply — AI Job Application Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ParsedCV {
  name: string
  email: string
  phone: string
  location: string
  linkedin_url: string | null
  github_url: string | null
  portfolio_url: string | null
  headline: string
  summary: string
  years_of_experience: number
  skills: {
    languages: string[]
    frameworks: string[]
    tools: string[]
    databases: string[]
    soft_skills: string[]
  }
  experience: {
    company: string
    title: string
    duration: string
    highlights: string[]
  }[]
  education: {
    institution: string
    degree: string
    field: string
    year: string
    gpa?: string
  }[]
  projects: {
    name: string
    description: string
    tech_stack: string[]
    url?: string
  }[]
  certifications: string[]
}

export interface JobPreferences {
  roles: string[]
  locations: string[]
  remote_preference: 'remote' | 'hybrid' | 'onsite' | 'any'
  salary_min: number | null
  salary_max: number | null
  job_types: ('full-time' | 'part-time' | 'contract' | 'internship')[]
  industries: string[]
  company_sizes: ('startup' | 'mid' | 'enterprise' | 'any')[]
  max_applications_per_day: number
  auto_apply_threshold: number
}

export interface StudentProfile {
  id: string
  user_id: string
  raw_cv_url: string | null
  raw_cv_text: string | null
  parsed_data: ParsedCV | null
  job_preferences: JobPreferences | null
  autoapply_running: boolean
  updated_at: string
}

export type JobSource = 'linkedin' | 'telegram' | 'indeed' | 'reddit' | 'naukri' | 'angellist' | 'direct'
export type JobStatus = 'discovered' | 'queued' | 'applying' | 'applied' | 'failed' | 'skipped' | 'interview' | 'rejected' | 'offer'
export type ApplicationAction = 'page_opened' | 'form_detected' | 'field_filled' | 'file_uploaded' | 'question_answered' | 'submitted' | 'captcha_hit' | 'error' | 'human_needed' | 'skipped'

export interface Job {
  id: string
  user_id: string
  source: JobSource
  source_id: string | null
  company: string
  title: string
  description: string | null
  location: string | null
  salary_range: string | null
  job_url: string
  job_type: string | null
  match_score: number | null
  match_reason: string | null
  status: JobStatus
  failure_reason: string | null
  applied_at: string | null
  discovered_at: string
}

export interface ApplicationLog {
  id: string
  job_id: string
  action: ApplicationAction
  details: Record<string, unknown> | null
  screenshot_url: string | null
  created_at: string
}

export interface GeneratedContent {
  id: string
  job_id: string
  content_type: 'cover_letter' | 'answer' | 'follow_up' | 'resume_summary'
  question: string | null
  answer: string
  created_at: string
}

export interface AutoApplyStats {
  total_discovered: number
  total_applied: number
  total_failed: number
  total_skipped: number
  total_interviews: number
  total_offers: number
  today_applied: number
  today_limit: number
  avg_match_score: number
  top_companies: { name: string; count: number }[]
  applications_by_source: { source: JobSource; count: number }[]
  applications_by_day: { date: string; count: number }[]
}