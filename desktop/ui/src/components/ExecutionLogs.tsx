import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'

const LOG_TYPE_STYLE: Record<string, { color: string; prefix: string }> = {
  log:    { color: '#9a9a9f', prefix: '›' },
  error:  { color: '#f87171', prefix: '✗' },
  system: { color: '#fbbf24', prefix: '⚙' },
  tool:   { color: '#60a5fa', prefix: '⚡' },
}

export default function ExecutionLogs() {
  const { logs, clearLogs } = useApp()
  const [expanded, setExpanded] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && expanded) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll, expanded])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  const displayLogs = logs.length > 0
    ? logs.slice(-200)
    : DEMO_LOGS

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ borderTop: '1px solid #1f1f22' }}>
      {/* Header */}
      <div className="flex items-center flex-shrink-0" style={{ borderBottom: expanded ? '1px solid #1f1f22' : 'none' }}>
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-2 flex-1 px-3 py-2 hover:bg-cc-bg4 transition-colors text-left"
        >
          <p className="section-label flex-1">Execution Logs</p>
          {logs.length > 0 && (
            <span
              className="mono px-1.5 rounded"
              style={{ fontSize: 10, color: '#ff6a3d', background: 'rgba(255,106,61,0.08)' }}
            >
              {logs.length}
            </span>
          )}
          <ChevronIcon expanded={expanded} />
        </button>
        {expanded && logs.length > 0 && (
          <button
            onClick={clearLogs}
            className="px-2 py-2 text-cc-subtle hover:text-cc-muted transition-colors"
            title="Clear logs"
          >
            <ClearIcon />
          </button>
        )}
      </div>

      {/* Log content */}
      {expanded && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto min-h-0 p-2"
          style={{ maxHeight: 220 }}
        >
          {displayLogs.map((entry, i) => {
            const style = LOG_TYPE_STYLE[entry.type] ?? LOG_TYPE_STYLE.log
            return (
              <div key={entry.id ?? i} className="flex items-start gap-1.5 group mb-0.5">
                <span
                  className="flex-shrink-0 font-bold select-none"
                  style={{ fontSize: 11, color: style.color, lineHeight: '18px', width: 10 }}
                >
                  {style.prefix}
                </span>
                <span className="log-line flex-1" style={{ color: style.color }}>
                  {entry.message}
                </span>
              </div>
            )
          })}

          {/* Auto-scroll anchor */}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Scroll-to-bottom hint */}
      {expanded && !autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true)
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
          }}
          className="flex items-center justify-center gap-1 py-1 text-cc-subtle hover:text-cc-muted transition-colors flex-shrink-0"
          style={{ fontSize: 10, borderTop: '1px solid #1f1f22' }}
        >
          <ArrowDownIcon />
          Scroll to latest
        </button>
      )}
    </div>
  )
}

/* ── Demo logs shown when no real logs exist ────────────── */
const DEMO_LOGS = [
  { id: 'd1', type: 'system', message: 'Agent initialized — claude-sonnet-4-6', timestamp: '' },
  { id: 'd2', type: 'log',    message: 'Analyzing task: "Design AI agent UI"', timestamp: '' },
  { id: 'd3', type: 'tool',   message: '⚡ read_file: src/App.tsx', timestamp: '' },
  { id: 'd4', type: 'tool',   message: '⚡ read_file: src/components/Sidebar.tsx', timestamp: '' },
  { id: 'd5', type: 'log',    message: 'Planning component architecture…', timestamp: '' },
  { id: 'd6', type: 'tool',   message: '⚡ edit_file: tailwind.config.js', timestamp: '' },
  { id: 'd7', type: 'tool',   message: '⚡ edit_file: src/index.css', timestamp: '' },
  { id: 'd8', type: 'log',    message: 'Writing DashboardPage component…', timestamp: '' },
  { id: 'd9', type: 'tool',   message: '⚡ bash: npm run typecheck', timestamp: '' },
]

/* ── Sub-icons ──────────────────────────────────────────── */
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{ flexShrink: 0, color: '#4a4a50', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s ease' }}
    >
      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 3h8M5 3V2h2v1M10 3l-.8 7H2.8L2 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function ArrowDownIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M5 2v6M2.5 5.5L5 8l2.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
