import type { AgentStatus as AgentStatusType } from '../types'

interface Props {
  status: AgentStatusType
  task: string
  phase: string
}

const STATUS_CONFIG: Record<AgentStatusType, { label: string; color: string; bg: string; icon: string }> = {
  idle:     { label: 'Idle',     color: 'text-slate-400', bg: 'bg-slate-700', icon: '○' },
  running:  { label: 'Running',  color: 'text-blue-400',  bg: 'bg-blue-900/40', icon: '●' },
  complete: { label: 'Complete', color: 'text-emerald-400', bg: 'bg-emerald-900/30', icon: '✓' },
  error:    { label: 'Error',    color: 'text-red-400',   bg: 'bg-red-900/30',  icon: '✗' },
}

const PHASES = ['Architect', 'Coder', 'Tester', 'Reviewer']

function detectPhase(phase: string): string {
  if (!phase) return ''
  for (const p of PHASES) {
    if (phase.toLowerCase().includes(p.toLowerCase())) return p
  }
  return phase
}

export default function AgentStatus({ status, task, phase }: Props) {
  const cfg = STATUS_CONFIG[status]
  const activePhase = detectPhase(phase)

  return (
    <div className="p-3 border-b border-slate-700/50">
      {/* Status row */}
      <div className={`flex items-center gap-2 rounded-md px-2 py-1.5 mb-2 ${cfg.bg}`}>
        <span className={`text-base ${cfg.color} ${status === 'running' ? 'pulse-dot' : ''}`}>
          {cfg.icon}
        </span>
        <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
      </div>

      {/* Current task */}
      {task && (
        <div className="mb-2">
          <p className="text-xs text-slate-500 mb-0.5">Current task</p>
          <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">{task}</p>
        </div>
      )}

      {/* Phase pipeline */}
      {status === 'running' && (
        <div>
          <p className="text-xs text-slate-500 mb-1.5">Pipeline</p>
          <div className="flex flex-col gap-1">
            {PHASES.map((p) => {
              const isActive = activePhase === p
              const isDone = activePhase && PHASES.indexOf(p) < PHASES.indexOf(activePhase)
              return (
                <div key={p} className="flex items-center gap-2">
                  <div className={[
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    isActive ? 'bg-blue-400 pulse-dot' :
                    isDone   ? 'bg-emerald-400' :
                               'bg-slate-600',
                  ].join(' ')} />
                  <span className={[
                    'text-xs',
                    isActive ? 'text-blue-300 font-medium' :
                    isDone   ? 'text-emerald-400' :
                               'text-slate-600',
                  ].join(' ')}>{p}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
