interface Props { score: number | null }

export default function ScoreBadge({ score }: Props) {
  if (score === null) return null

  const color =
    score >= 9 ? 'bg-green-900 text-green-400 border-green-800' :
    score >= 7 ? 'bg-yellow-900 text-yellow-400 border-yellow-800' :
    'bg-gray-800 text-gray-400 border-gray-700'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold ${color}`}>
      {score.toFixed(1)}
    </span>
  )
}
