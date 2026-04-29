import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import DiffViewer from '../components/DiffViewer'

export default function DiffPage() {
  const { lastSessionId, agentStatus, addLog, refreshGitStatus } = useApp()
  const [diff, setDiff] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    loadDiff()
  }, [agentStatus])

  async function loadDiff() {
    setLoading(true)
    try {
      const result = await window.electronAPI.previewDiff()
      if (result.success) {
        setDiff(result.diff ?? '')
        setStatus(result.status ?? '')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleApply() {
    if (applying) return
    setApplying(true)
    setMessage(null)
    try {
      const result = await window.electronAPI.applyPatch(lastSessionId ?? '')
      addLog({ type: result.success ? 'log' : 'error', message: result.output ?? '', timestamp: new Date().toISOString() })
      setMessage({ text: result.success ? 'Patch applied successfully' : `Apply failed: ${result.error ?? result.output}`, ok: result.success })
      if (result.success) {
        await loadDiff()
        refreshGitStatus()
      }
    } finally {
      setApplying(false)
    }
  }

  async function handleRollback() {
    if (rollingBack) return
    setRollingBack(true)
    setMessage(null)
    try {
      const result = await window.electronAPI.rollback(lastSessionId ?? '')
      addLog({ type: result.success ? 'log' : 'error', message: result.output ?? '', timestamp: new Date().toISOString() })
      setMessage({ text: result.success ? 'Rollback successful' : `Rollback failed: ${result.error}`, ok: result.success })
      if (result.success) {
        await loadDiff()
        refreshGitStatus()
      }
    } finally {
      setRollingBack(false)
    }
  }

  const changedFiles = status.trim().split('\n').filter(Boolean)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-cc-border flex items-center gap-3">
        <h1 className="text-sm font-semibold text-cc-text">Diff Preview</h1>
        <div className="flex-1" />
        {changedFiles.length > 0 && (
          <span className="badge badge-yellow">{changedFiles.length} changed</span>
        )}
        <button onClick={loadDiff} disabled={loading} className="btn-ghost text-xs">
          {loading ? '…' : '↺ Refresh'}
        </button>
      </div>

      {message && (
        <div className={[
          'mx-4 mt-3 px-3 py-2 rounded text-sm',
          message.ok ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/40' : 'bg-red-900/30 text-red-400 border border-red-700/40',
        ].join(' ')}>
          {message.text}
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Changed files list */}
        <div className="w-48 flex-shrink-0 border-r border-cc-border flex flex-col">
          <div className="px-3 py-2 border-b border-cc-border">
            <p className="text-xs font-semibold text-cc-muted uppercase tracking-wider">Changed Files</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {changedFiles.length === 0 ? (
              <p className="text-xs text-cc-subtle italic p-1">No pending changes</p>
            ) : (
              changedFiles.map((line, i) => {
                const statusChar = line.slice(0, 2).trim()
                const file = line.slice(3)
                const color = statusChar === 'M' ? 'text-yellow-400' :
                              statusChar === 'A' || statusChar === '??' ? 'text-emerald-400' :
                              statusChar === 'D' ? 'text-red-400' : 'text-cc-muted'
                return (
                  <div key={i} className="flex items-center gap-1.5 py-0.5 px-1">
                    <span className={`mono text-xs font-bold w-3 ${color}`}>{statusChar}</span>
                    <span className="text-xs text-cc-text truncate mono" title={file}>{file}</span>
                  </div>
                )
              })
            )}
          </div>

          {/* Action buttons */}
          <div className="border-t border-cc-border p-2 space-y-1.5">
            <button
              onClick={handleApply}
              disabled={applying || changedFiles.length === 0}
              className="btn-success w-full text-xs justify-center"
            >
              {applying ? (
                <>
                  <span className="spin inline-block w-3 h-3 border border-emerald-400/30 border-t-emerald-400 rounded-full mr-1" />
                  Applying…
                </>
              ) : '✓ Apply Patch'}
            </button>
            <button
              onClick={handleRollback}
              disabled={rollingBack || !lastSessionId}
              className="btn-danger w-full text-xs justify-center"
            >
              {rollingBack ? (
                <>
                  <span className="spin inline-block w-3 h-3 border border-red-400/30 border-t-red-400 rounded-full mr-1" />
                  Rolling back…
                </>
              ) : '↩ Rollback'}
            </button>
            <p className="text-xs text-cc-subtle text-center">All edits go through Safe Edit System</p>
          </div>
        </div>

        {/* Diff content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full text-cc-muted text-sm">
              <span className="spin inline-block w-4 h-4 border border-cc-border2 border-t-cc-muted rounded-full mr-2" />
              Loading diff…
            </div>
          ) : (
            <DiffViewer diff={diff} />
          )}
        </div>
      </div>
    </div>
  )
}
