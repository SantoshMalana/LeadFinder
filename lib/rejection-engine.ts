import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Persona } from './persona'

let _db: SupabaseClient | null = null
function getDb(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _db
}

interface RejectionData {
  user_id: string
  job_id: string
  status: 'applied' | 'interview' | 'rejected' | 'offer' | 'no_response'
}

/**
 * Record an application outcome for the learning engine
 */
export async function recordOutcome(data: RejectionData) {
  const { data: job } = await getDb()
    .from('jobs')
    .select('source, persona_used, cv_version, job_type, company')
    .eq('id', data.job_id)
    .single()

  if (!job) return

  const isSuccess = ['interview', 'offer'].includes(data.status)
  const patterns = [
    { type: 'platform', value: job.source },
    { type: 'persona', value: job.persona_used || 'default' },
    { type: 'cv_version', value: job.cv_version || 'original' },
    { type: 'job_type', value: job.job_type || 'unknown' },
  ]

  // Use the atomic RPC (requires schema_v2_patch.sql to be executed)
  await Promise.all(patterns.map(pattern => 
    getDb().rpc('increment_rejection_pattern', {
      p_user_id: data.user_id,
      p_pattern_type: pattern.type,
      p_pattern_value: pattern.value,
      p_is_success: isSuccess
    })
  ))
}

/**
 * Get insights from rejection patterns
 */
export async function getInsights(userId: string) {
  const { data: patterns } = await getDb()
    .from('rejection_patterns')
    .select('*')
    .eq('user_id', userId)
    .order('total_count', { ascending: false })

  if (!patterns?.length) return { best_platform: null, best_persona: null, insights: [] }

  const byType: Record<string, typeof patterns> = {}
  patterns.forEach(p => {
    if (!byType[p.pattern_type]) byType[p.pattern_type] = []
    byType[p.pattern_type].push(p)
  })

  const bestOf = (type: string) => {
    const items = byType[type]
    if (!items?.length) return null
    return items.reduce((best, item) =>
      item.success_rate > (best?.success_rate || 0) && item.total_count >= 3 ? item : best
    , items[0])
  }

  const insights: string[] = []
  const bestPlatform = bestOf('platform')
  const bestPersona = bestOf('persona')
  const bestCVVersion = bestOf('cv_version')

  if (bestPlatform && bestPlatform.total_count >= 5) {
    insights.push(`Best platform: ${bestPlatform.pattern_value} (${Math.round(bestPlatform.success_rate * 100)}% response rate)`)
  }
  if (bestPersona) {
    insights.push(`Best performing persona: "${bestPersona.pattern_value}" style`)
  }
  if (bestCVVersion && bestCVVersion.pattern_value !== 'original') {
    insights.push(`Best CV version: ${bestCVVersion.pattern_value}`)
  }

  // Detect declining patterns
  patterns.filter(p => p.total_count >= 10 && p.success_rate < 0.05).forEach(p => {
    insights.push(`⚠️ Low response rate for ${p.pattern_type}="${p.pattern_value}" (${Math.round(p.success_rate * 100)}%) — consider avoiding`)
  })

  return {
    best_platform: bestPlatform?.pattern_value,
    best_persona: bestPersona?.pattern_value,
    insights,
    raw: patterns,
  }
}

/**
 * Check for "silent rejections" (no response after 7 days)
 */
export async function markSilentRejections(userId: string) {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: staleJobs } = await getDb()
    .from('jobs')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'applied')
    .lt('applied_at', sevenDaysAgo.toISOString())

  if (!staleJobs?.length) return 0

  // Record outcomes concurrently
  await Promise.all(
    staleJobs.map(job => recordOutcome({ user_id: userId, job_id: job.id, status: 'no_response' }))
  )

  // Batch update all jobs
  const jobIds = staleJobs.map(j => j.id)
  await getDb()
    .from('jobs')
    .update({ status: 'rejected', failure_reason: 'No response after 7 days' })
    .in('id', jobIds)

  return staleJobs.length
}

export async function getBestStrategies(userId: string): Promise<{
  bestPlatform: string | null
  bestPersona: Persona | null
  platformMultipliers: Record<string, number>
}> {
  const { best_platform, best_persona, raw } = await getInsights(userId)

  // Build a multiplier map: platforms with >10% success get a 1.5x priority boost
  const platformMultipliers: Record<string, number> = {}
  if (raw) {
    for (const p of raw.filter(r => r.pattern_type === 'platform' && r.total_count >= 5)) {
      platformMultipliers[p.pattern_value] = p.success_rate >= 0.1 ? 1.5 : (p.success_rate < 0.03 ? 0.5 : 1.0)
    }
  }

  return {
    bestPlatform: best_platform || null,
    bestPersona: (best_persona as Persona) || null,
    platformMultipliers,
  }
}
