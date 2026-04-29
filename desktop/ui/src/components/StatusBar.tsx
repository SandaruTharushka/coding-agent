import { useApp } from '../context/AppContext'

const MODEL_LABELS: Record<string, string> = {
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-opus-4-7':   'Opus 4.7',
  'claude-haiku-4-5':  'Haiku 4.5',
  'qwen-coder':        'Qwen Coder',
  'gpt-4o':            'GPT-4o',
}

export default function StatusBar() {
  const { gitStatus, selectedModel, tokenUsage, agentStatus } = useApp()

  const branch  = gitStatus?.branch ?? 'main'
  const usagePct = Math.round((tokenUsage.used / tokenUsage.limit) * 100)
  const isNearLimit = usagePct >= 75

  return (
    <div
      className="flex items-center gap-0 flex-shrink-0 select-none"
      style={{
        height: 32,
        background: '#0a0a0b',
        borderTop: '1px solid #1a1a1d',
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      {/* ── Left: workspace path ──────────────────────────── */}
      <div className="flex items-center gap-1.5 text-cc-subtle mono" style={{ fontSize: 11 }}>
        <BranchIcon />
        <span>sandaru</span>
        <span className="opacity-40">/</span>
        <span>coding-agent</span>
        <span className="opacity-40">/</span>
        <span style={{ color: '#9a9a9f' }}>{branch}</span>
      </div>

      {/* Agent running indicator */}
      {(agentStatus === 'thinking' || agentStatus === 'executing') && (
        <div className="flex items-center gap-1.5 ml-4 px-2 py-0.5 rounded" style={{ background: 'rgba(255,106,61,0.08)' }}>
          <div
            className={`w-1.5 h-1.5 rounded-full ${agentStatus === 'thinking' ? 'bg-amber-400' : 'bg-blue-400'}`}
            style={{ animation: 'statusPulse 1s ease-in-out infinite' }}
          />
          <span style={{ fontSize: 11, color: '#ff7849' }}>
            {agentStatus === 'thinking' ? 'Thinking…' : 'Executing…'}
          </span>
        </div>
      )}

      <div className="flex-1" />

      {/* ── Right: model + usage + upgrade ───────────────── */}
      <div className="flex items-center gap-3">

        {/* Model selector */}
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer"
          style={{ fontSize: 11, color: '#9a9a9f', transition: 'background 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1c1c1f')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <ModelDot model={selectedModel} />
          <span>{MODEL_LABELS[selectedModel] ?? selectedModel}</span>
          <ChevronDownIcon />
        </div>

        <div style={{ width: 1, height: 14, background: '#1f1f22' }} />

        {/* Usage */}
        {isNearLimit && (
          <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: '#f59e0b' }}>
            <WarnIcon />
            <span>Approaching usage limit</span>
          </div>
        )}
        {!isNearLimit && (
          <div style={{ fontSize: 11, color: '#4a4a50' }}>
            {formatTokens(tokenUsage.used)} / {formatTokens(tokenUsage.limit)} tokens
          </div>
        )}

        <div style={{ width: 1, height: 14, background: '#1f1f22' }} />

        {/* Upgrade button */}
        <button
          className="flex items-center gap-1 px-2.5 py-0.5 rounded"
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#fff',
            background: '#2563eb',
            boxShadow: '0 0 12px rgba(37,99,235,0.30)',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#3b82f6'
            e.currentTarget.style.boxShadow = '0 0 18px rgba(59,130,246,0.40)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#2563eb'
            e.currentTarget.style.boxShadow = '0 0 12px rgba(37,99,235,0.30)'
          }}
        >
          <UpgradeIcon />
          Upgrade
        </button>
      </div>
    </div>
  )
}

function formatTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function ModelDot({ model }: { model: string }) {
  const color =
    model.startsWith('claude') ? '#ff6a3d' :
    model === 'qwen-coder'     ? '#22c55e' :
    '#60a5fa'
  return <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
}

function BranchIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="9" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="9" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M3 4.5v1A2.5 2.5 0 005.5 8H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M9 4.5V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 1L11 10H1L6 1Z" stroke="#f59e0b" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M6 5v2.5" stroke="#f59e0b" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="6" cy="8.5" r="0.6" fill="#f59e0b"/>
    </svg>
  )
}

function UpgradeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M5 1v7M2 4l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1 9h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}
