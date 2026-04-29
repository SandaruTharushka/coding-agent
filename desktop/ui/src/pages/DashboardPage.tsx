import { useState, KeyboardEvent } from 'react'
import { useApp } from '../context/AppContext'
import type { Session, PullRequest } from '../types'

/* ── Mock data ────────────────────────────────────────────── */
const SESSIONS: Session[] = [
  {
    id: 's1',
    title: 'Design AI agent UI',
    subtitle: 'Redesigning the full dashboard with glassmorphism panels',
    status: 'active',
    time: 'Just now',
    repo: 'coding-agent',
    model: 'Sonnet 4.6',
  },
  {
    id: 's2',
    title: 'Fix authentication middleware',
    subtitle: 'JWT token refresh logic broken on concurrent requests',
    status: 'paused',
    time: '12 min ago',
    repo: 'coding-agent',
    model: 'Sonnet 4.6',
  },
  {
    id: 's3',
    title: 'Token usage tracker feature',
    subtitle: 'Implement real-time token counter with visual progress bar',
    status: 'complete',
    time: '1 hr ago',
    repo: 'coding-agent',
    model: 'Opus 4.7',
  },
  {
    id: 's4',
    title: 'Refactor tool execution pipeline',
    subtitle: 'Extracted tool runners into dedicated modules',
    status: 'error',
    time: '3 hrs ago',
    repo: 'coding-agent',
    model: 'Sonnet 4.6',
  },
]

const PULL_REQUESTS: PullRequest[] = [
  {
    id: 'pr1',
    number: 42,
    title: 'feat: Design AI agent UI redesign',
    repo: 'coding-agent',
    branch: 'claude/design-ai-agent-ui-Y1zF2',
    status: 'in-review',
    time: '5 min ago',
  },
  {
    id: 'pr2',
    number: 41,
    title: 'fix: Auth middleware JWT refresh race condition',
    repo: 'coding-agent',
    branch: 'fix/jwt-refresh',
    status: 'open',
    time: '1 hr ago',
  },
  {
    id: 'pr3',
    number: 40,
    title: 'feat: Token usage tracker with animated progress',
    repo: 'coding-agent',
    branch: 'feat/token-tracker',
    status: 'merged',
    time: '2 hrs ago',
  },
]

/* ── Status config ────────────────────────────────────────── */
const SESSION_STATUS = {
  active:   { dot: '#3b82f6', label: 'Active',   badge: 'badge-blue'   },
  paused:   { dot: '#f59e0b', label: 'Paused',   badge: 'badge-yellow' },
  complete: { dot: '#22c55e', label: 'Complete', badge: 'badge-green'  },
  error:    { dot: '#ef4444', label: 'Error',    badge: 'badge-red'    },
}

const PR_STATUS = {
  'open':      { color: '#22c55e', label: 'Open',      badge: 'badge-green'  },
  'in-review': { color: '#f59e0b', label: 'In review', badge: 'badge-yellow' },
  'merged':    { color: '#a855f7', label: 'Merged',    badge: 'badge-purple' },
  'closed':    { color: '#6b7280', label: 'Closed',    badge: 'badge-gray'   },
}

/* ── Icons ────────────────────────────────────────────────── */
function SparkIcon() {
  return (
    <svg className="sparkle" width="18" height="18" viewBox="0 0 18 18" fill="none"
      style={{ filter: 'drop-shadow(0 0 6px rgba(255,106,61,0.7))' }}>
      <path d="M9 2L10.2 7.8L16 9L10.2 10.2L9 16L7.8 10.2L2 9L7.8 7.8L9 2Z"
        fill="#ff6a3d" stroke="#ff7849" strokeWidth="0.5" strokeLinejoin="round"/>
    </svg>
  )
}

function GitPRIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="3" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="10" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="3" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M3 5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M10 5a3 3 0 01-3 3H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M12 7L2 2l2 5-2 5 10-5Z" fill="currentColor"/>
    </svg>
  )
}

function AttachIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11.5 6.5L6 12a3.5 3.5 0 01-4.95-4.95l5.5-5.5a2 2 0 012.83 2.83L4.38 9.38a.5.5 0 01-.71-.71l4.25-4.24"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ToolIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M8.5 2a3.5 3.5 0 00-3.38 4.38L2 9.5 4.5 12l3.12-3.12A3.5 3.5 0 108.5 2z"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="8.5" cy="5.5" r="1" fill="currentColor"/>
    </svg>
  )
}

export default function DashboardPage() {
  const { setActivePage } = useApp()
  const [inputVal, setInputVal] = useState('')
  const [inputFocused, setInputFocused] = useState(false)

  function handleSend() {
    if (!inputVal.trim()) return
    setActivePage('chat')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'transparent' }}>
      {/* ── Scrollable content ───────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-6 pt-10 pb-4">

          {/* ── Welcome banner ─────────────────────────────── */}
          <div className="flex items-center gap-3 mb-10">
            <SparkIcon />
            <div>
              <h1 className="text-2xl font-semibold text-cc-text leading-tight tracking-tight">
                Welcome back, <span style={{ color: '#ff6a3d' }}>Sandaru</span>
              </h1>
              <p className="text-cc-muted text-sm mt-1">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          {/* ── Sessions ───────────────────────────────────── */}
          <SectionHeader title="Sessions" count={SESSIONS.length} />
          <div className="space-y-2 mb-8">
            {SESSIONS.map(s => <SessionCard key={s.id} session={s} />)}
          </div>

          {/* ── Pull Requests ───────────────────────────────── */}
          <SectionHeader title="Pull Requests" count={PULL_REQUESTS.length} />
          <div className="space-y-2 mb-6">
            {PULL_REQUESTS.map(pr => <PRCard key={pr.id} pr={pr} />)}
          </div>

        </div>
      </div>

      {/* ── Floating command input ───────────────────────── */}
      <div className="flex-shrink-0 px-6 py-4">
        <div
          className="chat-input-wrap max-w-3xl mx-auto"
          style={inputFocused ? {
            borderColor: 'rgba(255,106,61,0.45)',
            boxShadow: '0 0 0 2px rgba(255,106,61,0.12), 0 0 28px rgba(255,106,61,0.08)',
          } : {}}
        >
          <div className="flex items-end gap-2 px-4 py-3">
            <textarea
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              rows={1}
              placeholder="Ask anything or start a new task…"
              style={{
                flex: 1,
                resize: 'none',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#e6e6e6',
                fontSize: 14,
                lineHeight: '1.5',
                minHeight: 22,
                maxHeight: 140,
                fontFamily: 'inherit',
              }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 140) + 'px'
              }}
            />
            <div className="flex items-center gap-2 flex-shrink-0 pb-0.5">
              <button
                className="w-7 h-7 rounded-lg flex items-center justify-center text-cc-subtle hover:text-cc-muted transition-colors"
                title="Attach file"
              >
                <AttachIcon />
              </button>
              <button
                className="w-7 h-7 rounded-lg flex items-center justify-center text-cc-subtle hover:text-cc-muted transition-colors"
                title="Tools"
              >
                <ToolIcon />
              </button>
              <button
                onClick={handleSend}
                disabled={!inputVal.trim()}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150"
                style={{
                  background: inputVal.trim() ? '#ff6a3d' : '#1c1c1f',
                  color: inputVal.trim() ? '#fff' : '#4a4a50',
                  boxShadow: inputVal.trim() ? '0 0 14px rgba(255,106,61,0.28)' : 'none',
                }}
              >
                <SendIcon />
              </button>
            </div>
          </div>
          {/* Status line */}
          <div className="flex items-center gap-2 px-4 pb-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 opacity-60" />
            <span className="text-cc-subtle" style={{ fontSize: 11 }}>api key not saved</span>
            <span className="text-cc-subtle opacity-40" style={{ fontSize: 11 }}>·</span>
            <span className="text-cc-subtle" style={{ fontSize: 11 }}>Enter to send  ·  Shift+Enter for newline</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Section header ─────────────────────────────────────── */
function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-cc-text font-semibold text-sm">{title}</h2>
      <span className="badge badge-gray">{count}</span>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, #1f1f22 0%, transparent 100%)' }} />
    </div>
  )
}

/* ── Session card ────────────────────────────────────────── */
function SessionCard({ session }: { session: Session }) {
  const cfg = SESSION_STATUS[session.status]
  const isLive = session.status === 'active'

  return (
    <div
      className="agent-card px-4 py-3.5 flex items-center gap-3"
      style={{ opacity: session.status === 'error' ? 0.75 : 1 }}
    >
      {/* Status dot */}
      <div className="flex-shrink-0 relative">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{
            background: cfg.dot,
            boxShadow: isLive ? `0 0 8px ${cfg.dot}` : 'none',
            animation: isLive ? 'statusPulse 2s ease-in-out infinite' : undefined,
          }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-cc-text text-sm font-medium truncate">{session.title}</p>
        <p className="text-cc-muted text-xs truncate mt-0.5">{session.subtitle}</p>
      </div>

      {/* Meta */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <span className={cfg.badge}>{cfg.label}</span>
        <div className="flex items-center gap-2 text-cc-subtle" style={{ fontSize: 11 }}>
          <span className="mono">{session.repo}</span>
          <span>·</span>
          <span>{session.time}</span>
        </div>
      </div>
    </div>
  )
}

/* ── PR card ─────────────────────────────────────────────── */
function PRCard({ pr }: { pr: PullRequest }) {
  const cfg = PR_STATUS[pr.status]

  return (
    <div
      className="agent-card px-4 py-3.5 flex items-center gap-3"
      style={{ opacity: 0.82 }}
    >
      {/* PR icon */}
      <div className="flex-shrink-0" style={{ color: cfg.color }}>
        <GitPRIcon />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-cc-subtle text-xs mono">#{pr.number}</span>
          <p className="text-cc-text text-sm font-medium truncate">{pr.title}</p>
        </div>
        <p className="text-cc-subtle text-xs truncate mono">{pr.branch}</p>
      </div>

      {/* Meta */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <span className={cfg.badge}>{cfg.label}</span>
        <div className="flex items-center gap-2 text-cc-subtle" style={{ fontSize: 11 }}>
          <span className="mono">{pr.repo}</span>
          <span>·</span>
          <span>{pr.time}</span>
        </div>
      </div>
    </div>
  )
}
