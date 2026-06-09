'use server'

import { createClient } from '@/lib/supabase/server'
import { Lead } from '@/types'

export async function getLeads(campaignId?: string): Promise<Lead[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('leads')
    .select('*, campaigns!inner(user_id)')
    .eq('campaigns.user_id', user.id)
    .not('score', 'is', null)
    .order('score', { ascending: false })
    .order('found_at', { ascending: false })

  if (campaignId) {
    query = query.eq('campaign_id', campaignId)
  }

  const { data } = await query.limit(100)
  return data || []
}

export async function markLeadSeen(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Only update if the lead belongs to a campaign owned by this user
  const { data: lead } = await supabase
    .from('leads')
    .select('id, campaigns!inner(user_id)')
    .eq('id', id)
    .eq('campaigns.user_id', user.id)
    .single()

  if (!lead) return
  await supabase.from('leads').update({ status: 'seen' }).eq('id', id)
}

export async function markLeadReplied(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Only update if the lead belongs to a campaign owned by this user
  const { data: lead } = await supabase
    .from('leads')
    .select('id, campaigns!inner(user_id)')
    .eq('id', id)
    .eq('campaigns.user_id', user.id)
    .single()

  if (!lead) return
  await supabase.from('leads').update({ status: 'replied' }).eq('id', id)
}
