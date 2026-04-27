import { useState } from 'react'
import { useApp } from '../context/AppContext'
import TerminalOutput from '../components/TerminalOutput'
import type { LogEntry } from '../types'

const SHELL_RISK_NOTES = [
  { color: 'text-red-400', badge: 'BLOCKED', desc: 'Never executed: rm -rf, git reset --hard, dd, format, shutdown, …' },
  { color: 'text-yellow-400', badge: 'CAUTION', desc: 'Requires approval: npm install, git push, git pull, rm, mv, …' },
  { color: 'text-emerald-400', badge: 'SAFE', desc: 'Runs freely: build, lint, test, tsc, git status/diff, ls, cat, …' },
]

type Filter = 'all' | 'log' | 'error'

export default function TerminalPage() {
  const { logs, clearLogs, agentStatus, addLog } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const [verifying, setVerifying] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)

  const filtered: LogEntry[] = filter === 'all' ? logs : logs.filter((l) => l.type === filter)

  async function handleVerify() {
    if (verifying) return
    setVerifying(true)
    addLog({ type: 'system', message: '── Running verification…', timestamp: new Date().toISOString() })

    window.electronAPI.removeAllListeners('agent:progress')
    window.electronAPI.onAgentProgress((data) => {
      addLog({ type: data.type === 'error' ? 'error' : 'log', message: data.message, timestamp: data.timestamp })
    })

    try {
      const result = await window.electronAPI.runVerification()
      addLog({
        type: result.success ? 'system' : 'error',
        message: result.success ? '── Verification passed ✓' : '── Verification failed ✗',
        timestamp: new Date().toISOString(),
      })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header toolbar */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-slate-700/50 flex items-center gap-2">
        <h1 className="text-sm font-semibold text-slate-200">Terminal</h1>

        {/* Filters */}
        <div className="flex gap-1 ml-3">
          {(['all', 'log', 'error'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={[
                'btn text-xs px-2 py-0.5',
                filter === f ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              {f === 'all' ? `All (${logs.length})` :
               f === 'log' ? `Logs (${logs.filter((l) => l.type === 'log').length})` :
               `Errors (${logs.filter((l) => l.type === 'error').length})`}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setAutoScroll((v) => !v)}
          className={`btn-ghost text-xs ${autoScroll ? 'text-blue-400' : ''}`}
        >
          {autoScroll ? '⬇ Auto-scroll' : 'Auto-scroll'}
        </button>

        <button
          onClick={handleVerify}
          disabled={verifying || agentStatus === 'running'}
          className="btn-primary text-xs"
        >
          {verifying ? (
            <>
              <span className="spin inline-block w-3 h-3 border border-white/30 border-t-white rounded-full mr-1" />
              Verifying…
            </>
          ) : '⟳ Verify'}
        </button>

        <button onClick={clearLogs} className="btn-ghost text-xs">
          Clear
        </button>
      </div>

      {/* Log output */}
      <div className="flex-1 min-h-0 bg-slate-950">
        <TerminalOutput logs={filtered} autoScroll={autoScroll} />
      </div>

      {/* Shell safety legend */}
      <div className="flex-shrink-0 border-t border-slate-700/50 bg-slate-900/50 px-4 py-2">
        <p className="text-xs text-slate-500 mb-1.5 font-medium">Shell Safety</p>
        <div className="flex gap-4 flex-wrap">
          {SHELL_RISK_NOTES.map((note) => (
            <div key={note.badge} className="flex items-center gap-1.5">
              <span className={`text-xs font-bold ${note.color}`}>{note.badge}</span>
              <span className="text-xs text-slate-600">{note.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
