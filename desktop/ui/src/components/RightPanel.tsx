import { useApp } from '../context/AppContext'
import AgentStatus from './AgentStatus'
import ToolUsagePanel from './ToolUsagePanel'
import TokenTracker from './TokenTracker'
import ModelSwitcher from './ModelSwitcher'
import ExecutionLogs from './ExecutionLogs'

export default function RightPanel() {
  const { agentStatus, currentTask, currentPhase, activeToolName, gitStatus } = useApp()

  const branch       = gitStatus?.branch ?? 'main'
  const changedFiles = gitStatus?.status
    ? gitStatus.status.trim().split('\n').filter(Boolean)
    : []

  return (
    <aside
      className="flex flex-col h-full overflow-hidden flex-shrink-0"
      style={{ width: 280, minWidth: 280, background: '#0f0f10', borderLeft: '1px solid #1f1f22' }}
    >
      {/* ── Agent Status ────────────────────────────────── */}
      <AgentStatus
        status={agentStatus}
        task={currentTask}
        phase={currentPhase}
        activeTool={activeToolName}
      />

      {/* ── Tool Usage ──────────────────────────────────── */}
      <ToolUsagePanel />

      {/* ── Token Tracker ───────────────────────────────── */}
      <TokenTracker />

      {/* ── Model Switcher ──────────────────────────────── */}
      <ModelSwitcher />

      {/* ── Git status (compact) ────────────────────────── */}
      <div className="px-3 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid #1f1f22' }}>
        <div className="flex items-center gap-2 mb-2">
          <p className="section-label flex-1">Git</p>
          {branch && (
            <span className="badge badge-blue mono" style={{ fontSize: 10 }}>{branch}</span>
          )}
        </div>

        {changedFiles.length === 0 ? (
          <p className="text-cc-subtle italic" style={{ fontSize: 11 }}>No uncommitted changes</p>
        ) : (
          <div className="space-y-0.5">
            {changedFiles.slice(0, 8).map((line, i) => {
              const statusCode = line.slice(0, 2).trim()
              const file       = line.slice(3)
              const color =
                statusCode === 'M'  ? '#fbbf24' :
                statusCode === 'A' || statusCode === '??' ? '#4ade80' :
                statusCode === 'D'  ? '#f87171' : '#9a9a9f'
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="mono font-bold flex-shrink-0" style={{ fontSize: 10, color, width: 12 }}>
                    {statusCode}
                  </span>
                  <span className="text-cc-subtle mono truncate" style={{ fontSize: 10 }} title={file}>
                    {file}
                  </span>
                </div>
              )
            })}
            {changedFiles.length > 8 && (
              <p className="text-cc-subtle" style={{ fontSize: 10, marginTop: 2 }}>
                +{changedFiles.length - 8} more files
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Execution Logs (fills remaining space) ──────── */}
      <ExecutionLogs />
    </aside>
  )
}
