import { GitBranch, ShieldCheck } from 'lucide-react'

interface GitPanelProps {
  branch?: string
  changedFiles: string[]
  diff?: string
}

export default function GitPanel({ branch, changedFiles, diff }: GitPanelProps) {
  return (
    <div className="rounded-2xl border border-[#2a2a32] bg-[#18181d] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#f5f5f7]"><GitBranch className="h-4 w-4 text-[#00aaff]" />Changed Files</h3>
        <span className="rounded-full border border-[#2a2a32] px-2 py-0.5 text-xs text-[#9ca3af]">{branch || 'no-branch'}</span>
      </div>
      <div className="mb-3 max-h-40 space-y-1 overflow-y-auto">
        {changedFiles.length === 0 ? <p className="text-xs text-[#9ca3af]">Clean working tree</p> : changedFiles.map((line, idx) => <p key={idx} className="truncate text-xs text-[#f5f5f7]">{line}</p>)}
      </div>
      <p className="mb-2 text-xs text-[#9ca3af]">Git diff preview</p>
      <pre className="max-h-40 overflow-auto rounded-xl border border-[#2a2a32] bg-[#0b0b0d] p-2 text-[11px] text-[#9ca3af]">{diff?.slice(0, 1500) || 'No diff available.'}</pre>
      <div className="mt-3 flex items-center gap-2 text-xs text-[#22c55e]"><ShieldCheck className="h-3.5 w-3.5" />Rollback backup available</div>
    </div>
  )
}
