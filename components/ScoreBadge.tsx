interface Props { score: number | null }

export default function ScoreBadge({ score }: Props) {
  if (score === null) return null

  const isHot  = score >= 9
  const isGood = score >= 7

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 7px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.02em',
    border: '1px solid',
    ...(isHot
      ? { background: 'var(--green-subtle)', color: 'var(--green)', borderColor: '#1f4a38' }
      : isGood
      ? { background: 'var(--yellow-subtle)', color: 'var(--yellow)', borderColor: '#3a2d0f' }
      : { background: 'var(--bg-elevated)', color: 'var(--text-muted)', borderColor: 'var(--border)' }),
  }

  return (
    <span style={style}>
      {isHot ? '●' : isGood ? '◐' : '○'} {score.toFixed(1)}
    </span>
  )
}
