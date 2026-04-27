import { useEffect, useRef } from 'react'
import type { LogEntry } from '../types'

interface Props {
  logs: LogEntry[]
  autoScroll?: boolean
}

function classForType(type: LogEntry['type']): string {
  switch (type) {
    case 'error':  return 'text-red-400'
    case 'system': return 'text-blue-400'
    default:       return 'text-slate-300'
  }
}

export default function TerminalOutput({ logs, autoScroll = true }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        <div className="text-center">
          <p className="text-2xl mb-2">⌨️</p>
          <p>No output yet</p>
          <p className="text-xs mt-1">Run a task to see agent output here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full p-3 font-mono">
      {logs.map((entry) => (
        <div key={entry.id} className={`log-line ${classForType(entry.type)} mb-0.5`}>
          {entry.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
