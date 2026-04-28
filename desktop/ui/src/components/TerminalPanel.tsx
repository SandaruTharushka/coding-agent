import { Terminal } from 'lucide-react'
import type { LogEntry } from '../types'

export default function TerminalPanel({ logs }: { logs: LogEntry[] }) {
  return (
    <div className="rounded-2xl border border-[#2a2a32] bg-[#18181d] p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#f5f5f7]"><Terminal className="h-4 w-4 text-[#8b5cf6]" />Terminal Output</h3>
      <div className="max-h-44 overflow-auto rounded-xl border border-[#2a2a32] bg-black/50 p-2 font-mono text-[11px] text-[#9ca3af]">
        {logs.length === 0 ? 'No terminal output yet.' : logs.slice(-25).map((log) => (
          <div key={log.id}>[{new Date(log.timestamp).toLocaleTimeString()}] {log.message}</div>
        ))}
      </div>
    </div>
  )
}
