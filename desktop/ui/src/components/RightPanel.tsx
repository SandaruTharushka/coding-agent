import { useApp } from '../context/AppContext'
import AgentStatus from './AgentStatus'

export default function RightPanel() {
  const { gitStatus, agentStatus, currentTask, currentPhase } = useApp()

  const changedFiles = gitStatus?.status
    ? gitStatus.status.trim().split('\n').filter(Boolean)
    : []

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-900 border-l border-slate-700/50 flex flex-col overflow-hidden">
      {/* Agent status section */}
      <AgentStatus
        status={agentStatus}
        task={currentTask}
        phase={currentPhase}
      />

      {/* Git status section */}
      <div className="border-t border-slate-700/50 p-3 flex-1 overflow-y-auto min-h-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Git</span>
          {gitStatus?.branch && (
            <span className="badge badge-blue text-xs">{gitStatus.branch}</span>
          )}
        </div>

        {changedFiles.length === 0 ? (
          <p className="text-xs text-slate-600 italic">No changes</p>
        ) : (
          <div className="space-y-0.5">
            {changedFiles.slice(0, 20).map((line, i) => {
              const status = line.slice(0, 2).trim()
              const file = line.slice(3)
              const color = status === 'M' ? 'text-yellow-400' :
                            status === 'A' || status === '??' ? 'text-emerald-400' :
                            status === 'D' ? 'text-red-400' : 'text-slate-400'
              return (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className={`mono font-bold w-3 flex-shrink-0 ${color}`}>{status}</span>
                  <span className="text-slate-400 truncate mono" title={file}>{file}</span>
                </div>
              )
            })}
            {changedFiles.length > 20 && (
              <p className="text-xs text-slate-600 mt-1">+{changedFiles.length - 20} more</p>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
