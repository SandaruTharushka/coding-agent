import { useState } from 'react'

interface ToolEntry {
  id: string
  name: string
  label: string
  type: 'terminal' | 'file' | 'git' | 'search' | 'web'
  lastUsed: string
  usageCount: number
  lastArg?: string
}

const TOOLS: ToolEntry[] = [
  { id: 't1', name: 'bash',        label: 'Terminal',   type: 'terminal', lastUsed: '2 min ago', usageCount: 14, lastArg: 'npm run build' },
  { id: 't2', name: 'edit_file',   label: 'File Edit',  type: 'file',     lastUsed: '3 min ago', usageCount: 8,  lastArg: 'src/App.tsx' },
  { id: 't3', name: 'read_file',   label: 'File Read',  type: 'file',     lastUsed: '5 min ago', usageCount: 22, lastArg: 'types.ts' },
  { id: 't4', name: 'git_commit',  label: 'Git',        type: 'git',      lastUsed: '10 min ago', usageCount: 3, lastArg: 'git status' },
  { id: 't5', name: 'grep_search', label: 'Search',     type: 'search',   lastUsed: '15 min ago', usageCount: 7, lastArg: 'AgentStatus' },
]

const TYPE_STYLE: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  terminal: {
    icon: <TerminalIcon />,
    color: '#4ade80',
    bg: 'rgba(74,222,128,0.08)',
  },
  file: {
    icon: <FileIcon />,
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.08)',
  },
  git: {
    icon: <GitIcon />,
    color: '#f97316',
    bg: 'rgba(249,115,22,0.08)',
  },
  search: {
    icon: <SearchIcon />,
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.08)',
  },
  web: {
    icon: <WebIcon />,
    color: '#38bdf8',
    bg: 'rgba(56,189,248,0.08)',
  },
}

export default function ToolUsagePanel() {
  const [expanded, setExpanded] = useState(true)

  return (
    <div style={{ borderBottom: '1px solid #1f1f22' }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-cc-bg4 transition-colors"
        style={{ cursor: 'pointer' }}
      >
        <p className="section-label flex-1 text-left">Tool Usage</p>
        <ChevronIcon expanded={expanded} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5 fade-in">
          {TOOLS.map(tool => {
            const style = TYPE_STYLE[tool.type] ?? TYPE_STYLE.terminal
            return (
              <div
                key={tool.id}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
                style={{ background: style.bg, border: '1px solid rgba(255,255,255,0.04)' }}
              >
                {/* Icon */}
                <div style={{ color: style.color, flexShrink: 0 }}>
                  {style.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-cc-text text-xs font-medium">{tool.label}</span>
                    <span
                      className="mono px-1 py-0.5 rounded text-cc-subtle"
                      style={{ fontSize: 9, background: 'rgba(255,255,255,0.04)' }}
                    >
                      ×{tool.usageCount}
                    </span>
                  </div>
                  {tool.lastArg && (
                    <p className="text-cc-subtle mono truncate" style={{ fontSize: 10 }}>{tool.lastArg}</p>
                  )}
                </div>

                {/* Time */}
                <span className="text-cc-subtle flex-shrink-0" style={{ fontSize: 10 }}>{tool.lastUsed}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

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

function TerminalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M3 4.5l2 1.5-2 1.5M6.5 7.5h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 1.5h4l2.5 2.5V10.5a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5v-9A.5.5 0 013 1.5z"
        stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M7 1.5V4h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M4 6.5h4M4 8h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}
function GitIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <circle cx="9" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <circle cx="9" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M3 4.5v1A2.5 2.5 0 005.5 8H9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M9 4.5V8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M8.5 8.5l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}
function WebIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M1.5 6h9M6 1.5a6 6 0 010 9M6 1.5a6 6 0 000 9" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
}
