import type { ParsedCV } from '@/types'

export default function ProfileDisplay({ profile }: { profile: ParsedCV }) {
  const allSkills = [
    ...profile.skills.languages.map(s => ({ name: s, cat: 'lang' })),
    ...profile.skills.frameworks.map(s => ({ name: s, cat: 'fw' })),
    ...profile.skills.tools.map(s => ({ name: s, cat: 'tool' })),
    ...profile.skills.databases.map(s => ({ name: s, cat: 'db' })),
  ]

  const catColors: Record<string, { bg: string; color: string }> = {
    lang: { bg: '#1a1a3d', color: '#8b8bf5' },
    fw: { bg: '#0f2520', color: '#34d17b' },
    tool: { bg: '#251e0a', color: '#f0b429' },
    db: { bg: '#1a0a25', color: '#c06af5' },
  }

  return (
    <div>
      {/* Header Card */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
        padding: '16px 20px', background: 'var(--bg-elevated)', borderRadius: 10,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 700, color: '#fff',
        }}>
          {profile.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>
            {profile.name}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {profile.headline}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {profile.location} • {profile.years_of_experience} years exp • {profile.email}
          </div>
        </div>
      </div>

      {/* Skills */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Skills ({allSkills.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {allSkills.map((skill) => (
            <span key={skill.name} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: catColors[skill.cat]?.bg || 'var(--bg-elevated)',
              color: catColors[skill.cat]?.color || 'var(--text-secondary)',
            }}>
              {skill.name}
            </span>
          ))}
          {profile.skills.soft_skills.map(s => (
            <span key={s} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12,
              background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
              fontStyle: 'italic',
            }}>
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Experience */}
      {profile.experience.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Experience
          </div>
          {profile.experience.map((exp, i) => (
            <div key={i} style={{
              padding: '12px 16px', borderLeft: '2px solid var(--accent)',
              marginBottom: 8, marginLeft: 4,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {exp.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                {exp.company} • {exp.duration}
              </div>
              {exp.highlights.length > 0 && (
                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  {exp.highlights.slice(0, 3).map((h, j) => (
                    <li key={j} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Education */}
      {profile.education.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Education
          </div>
          {profile.education.map((edu, i) => (
            <div key={i} style={{ padding: '10px 16px', borderLeft: '2px solid var(--green)', marginBottom: 6, marginLeft: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                {edu.degree} in {edu.field}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {edu.institution} • {edu.year} {edu.gpa ? `• GPA: ${edu.gpa}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Projects */}
      {profile.projects.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Projects ({profile.projects.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10 }}>
            {profile.projects.map((proj, i) => (
              <div key={i} style={{
                padding: '14px 16px', background: 'var(--bg-elevated)',
                borderRadius: 10, border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {proj.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
                  {proj.description}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {proj.tech_stack.map(t => (
                    <span key={t} style={{
                      padding: '2px 7px', borderRadius: 4, fontSize: 10,
                      background: 'var(--accent-subtle)', color: 'var(--accent)',
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
