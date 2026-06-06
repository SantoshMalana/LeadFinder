import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getProfile } from '@/actions/profile.actions'
import CVUpload from '@/components/CVUpload'
import ProfileDisplay from '@/components/ProfileDisplay'
import PreferencesForm from '@/components/PreferencesForm'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getProfile()

  return (
    <div style={{ padding: '0 24px 40px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Page Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            Your Profile
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Upload your CV and set job preferences — the AI agent uses this to apply on your behalf.
          </p>
        </div>

        {/* CV Upload Section */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '28px 28px', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <span style={{ fontSize: 20 }}>📄</span>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              Resume / CV
            </h2>
            {profile?.raw_cv_url && (
              <span style={{
                marginLeft: 'auto', fontSize: 11, padding: '3px 10px',
                background: 'var(--green-subtle)', color: 'var(--green)',
                borderRadius: 6, fontWeight: 500,
              }}>
                ✓ Uploaded
              </span>
            )}
          </div>
          <CVUpload
            userId={user.id}
            hasCV={!!profile?.raw_cv_url}
            isParsed={!!profile?.parsed_data}
          />
        </div>

        {/* Parsed Profile Display */}
        {profile?.parsed_data && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '28px 28px', marginBottom: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{ fontSize: 20 }}>🧠</span>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                AI-Extracted Profile
              </h2>
              <span style={{
                marginLeft: 'auto', fontSize: 11, padding: '3px 10px',
                background: 'var(--accent-subtle)', color: 'var(--accent)',
                borderRadius: 6, fontWeight: 500,
              }}>
                {(profile.parsed_data.skills?.languages?.length || 0) + (profile.parsed_data.skills?.frameworks?.length || 0) + (profile.parsed_data.skills?.tools?.length || 0)} skills detected
              </span>
            </div>
            <ProfileDisplay profile={profile.parsed_data} />
          </div>
        )}

        {/* Job Preferences */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '28px 28px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <span style={{ fontSize: 20 }}>🎯</span>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              Job Preferences
            </h2>
          </div>
          <PreferencesForm
            userId={user.id}
            existing={profile?.job_preferences || undefined}
          />
        </div>
      </div>
    </div>
  )
}
