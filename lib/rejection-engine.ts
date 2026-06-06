import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface RejectionData {
  user_id: string
  job_id: string
  status: 'applied' | 'interview' | 'rejected' | 'offer' | 'no_response'
}

/**
 * Record an application outcome for the learning engine
 */
export async function recordOutcome(data: RejectionData) {
  const { data: job } = await supabase
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

  for (const pattern of patterns) {
    const { data: existing } = await supabase
      .from('rejection_patterns')
      .select('*')
      .eq('user_id', data.user_id)
      .eq('pattern_type', pattern.type)
      .eq('pattern_value', pattern.value)
      .single()

    if (existing) {
      const newSuccess = existing.success_count + (isSuccess ? 1 : 0)
      const newFailure = existing.failure_count + (isSuccess ? 0 : 1)
      const newTotal = existing.total_count + 1
      await supabase.from('rejection_patterns').update({
        success_count: newSuccess,
        failure_count: newFailure,
        total_count: newTotal,
        success_rate: newTotal > 0 ? newSuccess / newTotal : 0,
        last_updated: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('rejection_patterns').insert({
        user_id: data.user_id,
        pattern_type: pattern.type,
        pattern_value: pattern.value,
        success_count: isSuccess ? 1 : 0,
        failure_count: isSuccess ? 0 : 1,
        total_count: 1,
        success_rate: isSuccess ? 1 : 0,
      })
    }
  }
}

/**
 * Get insights from rejection patterns
 */
export async function getInsights(userId: string) {
  const { data: patterns } = await supabase
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

  const { data: staleJobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'applied')
    .lt('applied_at', sevenDaysAgo.toISOString())

  if (!staleJobs?.length) return 0

  let marked = 0
  for (const job of staleJobs) {
    await recordOutcome({ user_id: userId, job_id: job.id, status: 'no_response' })
    await supabase.from('jobs').update({ status: 'rejected', failure_reason: 'No response after 7 days' }).eq('id', job.id)
    marked++
  }

  return marked
}
