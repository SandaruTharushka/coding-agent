import { CheckCircle2, CircleDashed, FileEdit, FilePlus2, GitCommitHorizontal, TerminalSquare, XCircle } from 'lucide-react'

export interface ActivityItem {
  id: string
  type: 'created' | 'edited' | 'command' | 'test' | 'commit'
  file: string
  status: 'ok' | 'warn' | 'error' | 'pending'
  summary: string
}

const iconMap = {
  created: FilePlus2,
  edited: FileEdit,
  command: TerminalSquare,
  test: CheckCircle2,
  commit: GitCommitHorizontal,
}

function Badge({ status }: { status: ActivityItem['status'] }) {
  const styles = {
    ok: 'bg-[#22c55e]/20 text-[#22c55e] border-[#22c55e]/30',
    warn: 'bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30',
    error: 'bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30',
    pending: 'bg-[#9ca3af]/15 text-[#9ca3af] border-[#2a2a32]',
  }

  const icon = status === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : status === 'error' ? <XCircle className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />

  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${styles[status]}`}>{icon}{status}</span>
}

export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="rounded-2xl border border-[#2a2a32] bg-[#18181d] p-4">
      <h3 className="mb-3 text-sm font-semibold text-[#f5f5f7]">Timeline</h3>
      <div className="space-y-2">
        {items.map((item) => {
          const Icon = iconMap[item.type]
          return (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[#2a2a32] bg-[#101014] px-3 py-2">
              <Icon className="h-4 w-4 text-[#00aaff]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[#f5f5f7]">{item.file}</p>
                <p className="truncate text-xs text-[#9ca3af]">{item.summary}</p>
              </div>
              <Badge status={item.status} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
