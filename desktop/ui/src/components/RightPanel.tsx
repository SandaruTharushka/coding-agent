import { FlaskConical, RotateCcw } from 'lucide-react'
import { useApp } from '../context/AppContext'
import GitPanel from './GitPanel'
import TerminalPanel from './TerminalPanel'

export default function RightPanel() {
  const { gitStatus, logs } = useApp()
  const changedFiles = gitStatus?.status ? gitStatus.status.trim().split('\n').filter(Boolean) : []

  return (
    <aside className="w-[360px] flex-shrink-0 space-y-3 overflow-y-auto border-l border-[#2a2a32] bg-[#121216] p-3">
      <GitPanel branch={gitStatus?.branch} changedFiles={changedFiles} diff={gitStatus?.diff} />
      <div className="rounded-2xl border border-[#2a2a32] bg-[#18181d] p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#f5f5f7]"><FlaskConical className="h-4 w-4 text-[#22c55e]" />Verification Loop</h3>
        <div className="space-y-1 text-xs text-[#9ca3af]">
          <p>✅ build</p>
          <p>✅ lint</p>
          <p>⚠ test (1 flaky)</p>
          <p>⟳ retry fixes queued</p>
        </div>
        <button className="mt-3 inline-flex items-center gap-1 rounded-lg border border-[#2a2a32] px-3 py-1.5 text-xs text-[#9ca3af]"><RotateCcw className="h-3.5 w-3.5" />Rollback</button>
      </div>
      <TerminalPanel logs={logs} />
    </aside>
  )
}
