import type { AgentStatus as AgentStatusType } from '../types'

interface Props {
  status: AgentStatusType
  task: string
  phase: string
  activeTool?: string
}

const STATUS_CONFIG = {
  idle: {
    dotClass: 'status-dot-idle',
    label: 'Idle',
    labelColor: '#4a4a50',
    bgStyle: { background: 'rgba(28,28,31,0.4)' },
    desc: 'Waiting for a task',
  },
  thinking: {
    dotClass: 'status-dot-thinking',
    label: 'Thinking',
    labelColor: '#fbbf24',
    bgStyle: { background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)' },
    desc: 'Processing your request…',
  },
  executing: {
    dotClass: 'status-dot-executing',
    label: 'Executing',
    labelColor: '#60a5fa',
    bgStyle: { background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)' },
    desc: 'Running tool…',
  },
  complete: {
    dotClass: 'status-dot-complete',
    label: 'Complete',
    labelColor: '#4ade80',
    bgStyle: { background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.12)' },
    desc: 'Task finished',
  },
  error: {
    dotClass: 'status-dot-error',
    label: 'Error',
    labelColor: '#f87171',
    bgStyle: { background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.12)' },
    desc: 'Something went wrong',
  },
}

// Map legacy 'running' -> 'thinking' for backwards compat with electron IPC
function normalizeStatus(s: string): AgentStatusType {
  if (s === 'running') return 'thinking'
  return s as AgentStatusType
}

const PIPELINE_STAGES = ['Architect', 'Coder', 'Tester', 'Reviewer']

export default function AgentStatus({ status, task, phase, activeTool }: Props) {
  const normalized = normalizeStatus(status)
  const cfg = STATUS_CONFIG[normalized] ?? STATUS_CONFIG.idle
  const isRunning = normalized === 'thinking' || normalized === 'executing'

  function detectStageIndex(p: string) {
    if (!p) return -1
    return PIPELINE_STAGES.findIndex(s => p.toLowerCase().includes(s.toLowerCase()))
  }
  const activeStageIdx = detectStageIndex(phase)

  return (
    <div className="p-3 flex-shrink-0" style={{ borderBottom: '1px solid #1f1f22' }}>
      <p className="section-label mb-2">Agent Status</p>

      {/* Status pill */}
      <div
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-2"
        style={cfg.bgStyle}
      >
        <div className={cfg.dotClass} />
        <span className="text-sm font-semibold" style={{ color: cfg.labelColor }}>
          {cfg.label}
        </span>
        {isRunning && (
          <div className="flex items-center gap-0.5 ml-auto">
            <span className="think-dot   w-1 h-1 rounded-full bg-cc-subtle inline-block" />
            <span className="think-dot-2 w-1 h-1 rounded-full bg-cc-subtle inline-block mx-0.5" />
            <span className="think-dot-3 w-1 h-1 rounded-full bg-cc-subtle inline-block" />
          </div>
        )}
      </div>

      {/* Current task */}
      {task && (
        <div className="mb-3">
          <p className="text-cc-subtle mb-1" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Task
          </p>
          <p className="text-cc-muted text-xs leading-relaxed line-clamp-3">{task}</p>
        </div>
      )}

      {/* Active tool */}
      {activeTool && isRunning && (
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg mb-3"
          style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}
        >
          <ToolRunIcon />
          <span className="text-blue-400 text-xs font-medium mono truncate">{activeTool}</span>
        </div>
      )}

      {/* Pipeline stages */}
      {isRunning && (
        <div>
          <p className="text-cc-subtle mb-2" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Pipeline
          </p>
          <div className="space-y-1.5">
            {PIPELINE_STAGES.map((stage, idx) => {
              const isActive = idx === activeStageIdx
              const isDone   = activeStageIdx > idx
              return (
                <div key={stage} className="flex items-center gap-2.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background: isActive ? '#ff6a3d' : isDone ? '#22c55e' : '#2a2a2e',
                      animation: isActive ? 'statusPulse 1.2s ease-in-out infinite' : undefined,
                      boxShadow: isActive ? '0 0 6px rgba(255,106,61,0.5)' : undefined,
                    }}
                  />
                  <span
                    className="text-xs"
                    style={{
                      color: isActive ? '#ff6a3d' : isDone ? '#4ade80' : '#4a4a50',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {stage}
                  </span>
                  {isDone && <CheckIcon />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ToolRunIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0 }}>
      <path d="M7 1.5a2.5 2.5 0 00-2.45 2.95L1.5 7.5 3.5 9.5l3.05-3.05A2.5 2.5 0 107 1.5z"
        stroke="#60a5fa" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="7" cy="4" r="0.7" fill="#60a5fa"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: 'auto', flexShrink: 0 }}>
      <path d="M2 5l2.5 2.5L8 3" stroke="#4ade80" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
