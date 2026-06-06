'use server'

import { createClient } from '@/lib/supabase/server'
import type { Job, JobStatus, JobSource, AutoApplyStats, ApplicationLog } from '@/types'

export async function getJobs(filters?: {
  status?: JobStatus
  source?: JobSource
  limit?: number
}): Promise<Job[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('jobs')
    .select('*')
    .eq('user_id', user.id)
    .order('discovered_at', { ascending: false })

  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.source) query = query.eq('source', filters.source)

  const { data } = await query.limit(filters?.limit || 100)
  return data || []
}

export async function getJobStats(): Promise<AutoApplyStats> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return emptyStats()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('status, source, match_score, company, applied_at, discovered_at')
    .eq('user_id', user.id)

  if (!jobs?.length) return emptyStats()

  const today = new Date().toISOString().split('T')[0]
  const todayApplied = jobs.filter(j =>
    j.status === 'applied' && j.applied_at?.startsWith(today)
  ).length

  const scored = jobs.filter(j => j.match_score !== null)
  const avgScore = scored.length
    ? scored.reduce((sum, j) => sum + (j.match_score || 0), 0) / scored.length
    : 0

  // Top companies
  const companyCounts: Record<string, number> = {}
  jobs.filter(j => j.status === 'applied').forEach(j => {
    companyCounts[j.company] = (companyCounts[j.company] || 0) + 1
  })
  const topCompanies = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  // By source
  const sourceCounts: Record<string, number> = {}
  jobs.filter(j => j.status === 'applied').forEach(j => {
    sourceCounts[j.source] = (sourceCounts[j.source] || 0) + 1
  })
  const applicationsBySource = Object.entries(sourceCounts)
    .map(([source, count]) => ({ source: source as JobSource, count }))

  // By day (last 7 days)
  const dayMap: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dayMap[d.toISOString().split('T')[0]] = 0
  }
  jobs.filter(j => j.status === 'applied' && j.applied_at).forEach(j => {
    const day = j.applied_at!.split('T')[0]
    if (dayMap[day] !== undefined) dayMap[day]++
  })
  const applicationsByDay = Object.entries(dayMap)
    .map(([date, count]) => ({ date, count }))

  // Profile for daily limit
  const { data: profile } = await supabase
    .from('profiles')
    .select('job_preferences')
    .eq('user_id', user.id)
    .single()

  return {
    total_discovered: jobs.length,
    total_applied: jobs.filter(j => j.status === 'applied').length,
    total_failed: jobs.filter(j => j.status === 'failed').length,
    total_skipped: jobs.filter(j => j.status === 'skipped').length,
    total_interviews: jobs.filter(j => j.status === 'interview').length,
    total_offers: jobs.filter(j => j.status === 'offer').length,
    today_applied: todayApplied,
    today_limit: profile?.job_preferences?.max_applications_per_day || 25,
    avg_match_score: Math.round(avgScore * 10) / 10,
    top_companies: topCompanies,
    applications_by_source: applicationsBySource,
    applications_by_day: applicationsByDay,
  }
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  failureReason?: string
) {
  const supabase = await createClient()
  const update: Record<string, unknown> = { status }
  if (status === 'applied') update.applied_at = new Date().toISOString()
  if (failureReason) update.failure_reason = failureReason

  await supabase.from('jobs').update(update).eq('id', jobId)
}

export async function getApplicationLog(jobId: string): Promise<ApplicationLog[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('application_log')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })

  return data || []
}

export async function getRecentApplications(limit = 20): Promise<Job[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', user.id)
    .in('status', ['applied', 'failed', 'interview', 'offer'])
    .order('applied_at', { ascending: false })
    .limit(limit)

  return data || []
}

export async function getTodayApplicationCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const today = new Date().toISOString().split('T')[0]
  const { count } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'applied')
    .gte('applied_at', today)

  return count || 0
}

function emptyStats(): AutoApplyStats {
  return {
    total_discovered: 0, total_applied: 0, total_failed: 0,
    total_skipped: 0, total_interviews: 0, total_offers: 0,
    today_applied: 0, today_limit: 25, avg_match_score: 0,
    top_companies: [], applications_by_source: [], applications_by_day: [],
  }
}
