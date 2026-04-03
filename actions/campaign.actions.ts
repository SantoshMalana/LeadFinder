'use server'

import { createClient } from '@/lib/supabase/server'
import { Campaign } from '@/types'
import { revalidatePath } from 'next/cache'

export async function getCampaigns(): Promise<Campaign[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('campaigns')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return data || []
}

export async function createCampaign(formData: {
  name: string
  keywords: string[]
  subreddits: string[]
  min_score: number
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('campaigns').insert({
    user_id: user.id,
    name: formData.name,
    keywords: formData.keywords,
    subreddits: formData.subreddits,
    platforms: ['reddit'],
    min_score: formData.min_score,
    is_active: true,
  })

  if (error) throw error
  revalidatePath('/campaigns')
}

export async function toggleCampaign(id: string, is_active: boolean) {
  const supabase = await createClient()
  await supabase.from('campaigns').update({ is_active }).eq('id', id)
  revalidatePath('/campaigns')
}

export async function deleteCampaign(id: string) {
  const supabase = await createClient()
  await supabase.from('campaigns').delete().eq('id', id)
  revalidatePath('/campaigns')
}
