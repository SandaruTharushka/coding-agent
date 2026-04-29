import { useApp } from '../context/AppContext'

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function TokenTracker() {
  const { tokenUsage } = useApp()
  const { used, limit, inputTokens, outputTokens } = tokenUsage

  const pct = Math.min((used / limit) * 100, 100)
  const isWarn = pct >= 65
  const isCrit = pct >= 85

  const barClass = isCrit ? 'token-bar-crit' : isWarn ? 'token-bar-warn' : 'token-bar-ok'
  const labelColor = isCrit ? '#f87171' : isWarn ? '#fbbf24' : '#ff7849'

  const inputPct  = used > 0 ? Math.round((inputTokens / used) * 100)  : 0
  const outputPct = used > 0 ? Math.round((outputTokens / used) * 100) : 0

  return (
    <div className="p-3" style={{ borderBottom: '1px solid #1f1f22' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="section-label">Token Usage</p>
        <span className="mono" style={{ fontSize: 11, color: labelColor, fontWeight: 600 }}>
          {Math.round(pct)}%
        </span>
      </div>

      {/* Main progress bar */}
      <div className="progress-track mb-1" style={{ height: 4 }}>
        <div
          className={`progress-fill ${barClass}`}
          style={{ width: `${pct}%`, height: '100%' }}
        />
      </div>

      {/* Used / Limit label */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-cc-muted mono" style={{ fontSize: 11 }}>
          {formatNum(used)}
        </span>
        <span className="text-cc-subtle mono" style={{ fontSize: 11 }}>
          {formatNum(limit)}
        </span>
      </div>

      {/* Breakdown: input / output */}
      <div className="space-y-1.5">
        <TokenRow
          label="Input"
          value={inputTokens}
          pct={inputPct}
          color="#ff6a3d"
          bg="rgba(255,106,61,0.10)"
        />
        <TokenRow
          label="Output"
          value={outputTokens}
          pct={outputPct}
          color="#60a5fa"
          bg="rgba(96,165,250,0.10)"
        />
      </div>

      {isCrit && (
        <div
          className="flex items-center gap-1.5 mt-2 px-2 py-1.5 rounded-lg"
          style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.15)' }}
        >
          <WarnIcon />
          <span className="text-red-400" style={{ fontSize: 11 }}>
            Approaching usage limit
          </span>
        </div>
      )}
    </div>
  )
}

function TokenRow({
  label, value, pct, color, bg,
}: {
  label: string; value: number; pct: number; color: string; bg: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-cc-muted" style={{ fontSize: 11, width: 38, flexShrink: 0 }}>{label}</span>

      {/* Mini bar */}
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 3, background: '#1c1c1f' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, opacity: 0.7, transition: 'width 0.5s ease' }}
        />
      </div>

      <span className="text-cc-subtle mono flex-shrink-0" style={{ fontSize: 10, width: 32, textAlign: 'right' }}>
        {formatNum(value)}
      </span>
    </div>
  )
}

function WarnIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0 }}>
      <path d="M5.5 1L10 9H1L5.5 1Z" stroke="#f87171" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M5.5 4.5v2" stroke="#f87171" strokeWidth="1.1" strokeLinecap="round"/>
      <circle cx="5.5" cy="7.5" r="0.55" fill="#f87171"/>
    </svg>
  )
}
