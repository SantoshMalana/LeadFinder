'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function CVUpload({ userId, hasCV, isParsed }: {
  userId: string
  hasCV: boolean
  isParsed: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [status, setStatus] = useState<'idle' | 'uploaded' | 'parsed' | 'error'>(
    isParsed ? 'parsed' : hasCV ? 'uploaded' : 'idle'
  )
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFile(file: File) {
    if (!file.name.endsWith('.pdf')) {
      setError('Only PDF files are supported')
      return
    }
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('cv', file)
      const res = await fetch('/api/cv/upload', {
        method: 'POST',
        body: form,
        headers: { 'x-user-id': userId },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStatus('uploaded')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStatus('error')
    }
    setUploading(false)
  }

  async function handleParse() {
    setParsing(true)
    setError('')
    try {
      const res = await fetch('/api/cv/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStatus('parsed')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Parse failed')
    }
    setParsing(false)
  }

  return (
    <div>
      {/* Drag & Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 12, padding: '36px 24px', textAlign: 'center',
          cursor: 'pointer', transition: 'all 0.2s',
          background: dragOver ? 'var(--accent-subtle)' : 'transparent',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {uploading ? (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Uploading & extracting text...</p>
          </div>
        ) : status === 'uploaded' || status === 'parsed' ? (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <p style={{ color: 'var(--green)', fontSize: 14, fontWeight: 500 }}>CV uploaded successfully!</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>Click to upload a different file</p>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Drag & drop your resume PDF here, or click to browse
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>PDF only, max 5MB</p>
          </div>
        )}
      </div>

      {error && (
        <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</p>
      )}

      {/* Parse Button */}
      {(status === 'uploaded' || (hasCV && !isParsed)) && (
        <button
          onClick={handleParse}
          disabled={parsing}
          style={{
            marginTop: 16, width: '100%', padding: '12px 20px',
            background: parsing ? 'var(--bg-elevated)' : 'var(--accent)',
            color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 600, cursor: parsing ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {parsing ? (
            <>
              <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Parsing with AI...
            </>
          ) : (
            <>🧠 Parse CV with AI</>
          )}
        </button>
      )}

      {status === 'parsed' && (
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 8,
          background: 'var(--green-subtle)', color: 'var(--green)',
          fontSize: 12, fontWeight: 500,
        }}>
          ✓ Profile extracted! Skills, experience, and education are ready for AutoApply.
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
