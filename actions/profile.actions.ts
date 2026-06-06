'use server'

import { createClient } from '@/lib/supabase/server'
import type { StudentProfile, JobPreferences, ParsedCV } from '@/types'
import { revalidatePath } from 'next/cache'

export async function getProfile(): Promise<StudentProfile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return data || null
}

export async function upsertProfile(profileData: Partial<StudentProfile>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('profiles').upsert({
    user_id: user.id,
    ...profileData,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) throw error
  revalidatePath('/profile')
}

export async function updateJobPreferences(preferences: JobPreferences) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('profiles')
    .update({ job_preferences: preferences, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  if (error) throw error
  revalidatePath('/profile')
}

export async function updateParsedCV(parsedData: ParsedCV) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('profiles')
    .update({ parsed_data: parsedData, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  if (error) throw error
  revalidatePath('/profile')
}
