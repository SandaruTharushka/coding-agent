interface TokenUsageCardProps {
  used: number
  budget: number
  cost: number
}

export default function TokenUsageCard({ used, budget, cost }: TokenUsageCardProps) {
  const ratio = Math.min((used / budget) * 100, 100)

  return (
    <div className="rounded-2xl border border-[#2a2a32] bg-[#18181d] p-4 shadow-[0_0_40px_rgba(0,170,255,0.08)]">
      <div className="mb-2 flex items-center justify-between text-xs text-[#9ca3af]">
        <span>Token Usage</span>
        <span>{used.toLocaleString()} / {budget.toLocaleString()}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#101014]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#00aaff] to-[#8b5cf6] transition-all duration-500" style={{ width: `${ratio}%` }} />
      </div>
      <p className="mt-2 text-xs text-[#9ca3af]">Estimated cost: <span className="text-[#f5f5f7]">${cost.toFixed(2)}</span></p>
    </div>
  )
}
