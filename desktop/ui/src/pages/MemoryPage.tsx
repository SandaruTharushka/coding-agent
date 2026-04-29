import { useState, useEffect, useMemo } from 'react'
import type { AgentMemory } from '../types'

const STATUS_COLORS: Record<string, string> = {
  completed:   'badge-green',
  failed:      'badge-red',
  in_progress: 'badge-blue',
  pending:     'badge-gray',
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function MemoryPage() {
  const [memory, setMemory] = useState<AgentMemory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'tasks' | 'decisions' | 'notes'>('tasks')

  useEffect(() => {
    loadMemory()
  }, [])

  async function loadMemory() {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.getMemory()
      if (result.success && result.memory) {
        setMemory(result.memory)
      } else {
        setError(result.error ?? 'Failed to load memory')
      }
    } finally {
      setLoading(false)
    }
  }

  const filteredTasks = useMemo(() => {
    if (!memory) return []
    return memory.tasks
      .filter((t) => !search || t.task.toLowerCase().includes(search.toLowerCase()))
      .slice()
      .reverse()
  }, [memory, search])

  const filteredDecisions = useMemo(() => {
    if (!memory) return []
    return memory.decisions
      .filter((d) => !search || d.decision.toLowerCase().includes(search.toLowerCase()) || d.reason.toLowerCase().includes(search.toLowerCase()))
      .slice()
      .reverse()
  }, [memory, search])

  const filteredNotes = useMemo(() => {
    if (!memory) return []
    return memory.notes.filter((n) => !search || n.toLowerCase().includes(search.toLowerCase()))
  }, [memory, search])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-cc-muted text-sm">
        <span className="spin inline-block w-4 h-4 border border-cc-border2 border-t-cc-muted rounded-full mr-2" />
        Loading memory…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={loadMemory} className="btn-ghost mt-2 text-xs">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-cc-border">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-sm font-semibold text-cc-text">Memory</h1>
          {memory?.projectSummary && (
            <span className="text-xs text-cc-muted truncate max-w-xs">{memory.projectSummary}</span>
          )}
          <div className="flex-1" />
          <button onClick={loadMemory} className="btn-ghost text-xs">↺ Refresh</button>
        </div>

        <div className="flex gap-2">
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memory…"
            className="input max-w-xs text-xs py-1.5"
          />

          {/* Tabs */}
          <div className="flex gap-1 ml-2">
            {(['tasks', 'decisions', 'notes'] as const).map((t) => {
              const count = t === 'tasks' ? memory?.tasks.length :
                            t === 'decisions' ? memory?.decisions.length :
                            memory?.notes.length
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={[
                    'btn text-xs px-3 py-1',
                    tab === t ? 'bg-cc-surface2 text-cc-text' : 'text-cc-subtle hover:text-cc-muted',
                  ].join(' ')}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)} ({count ?? 0})
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {tab === 'tasks' && (
          <div className="space-y-2">
            {filteredTasks.length === 0 ? (
              <EmptyState icon="📋" message="No tasks recorded yet" />
            ) : filteredTasks.map((t, i) => (
              <div key={i} className="panel p-3 space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className={`badge ${STATUS_COLORS[t.status] ?? 'badge-gray'} flex-shrink-0 mt-0.5`}>
                    {t.status}
                  </span>
                  <p className="text-sm text-cc-text leading-relaxed flex-1">{t.task}</p>
                </div>
                {t.result && (
                  <p className="text-xs text-cc-muted ml-14 leading-relaxed line-clamp-2">{t.result}</p>
                )}
                <p className="text-xs text-cc-subtle ml-14">{timeAgo(t.timestamp)}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'decisions' && (
          <div className="space-y-2">
            {filteredDecisions.length === 0 ? (
              <EmptyState icon="🧭" message="No decisions recorded yet" />
            ) : filteredDecisions.map((d, i) => (
              <div key={i} className="panel p-3 space-y-1">
                <p className="text-sm text-cc-text font-medium">{d.decision}</p>
                <p className="text-xs text-cc-muted leading-relaxed">{d.reason}</p>
                <p className="text-xs text-cc-subtle">{timeAgo(d.timestamp)}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'notes' && (
          <div className="space-y-2">
            {filteredNotes.length === 0 ? (
              <EmptyState icon="📝" message="No notes recorded yet" />
            ) : filteredNotes.map((note, i) => (
              <div key={i} className="panel p-3">
                <p className="text-sm text-cc-text leading-relaxed">{note}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-cc-subtle">
      <div className="text-center">
        <p className="text-3xl mb-2">{icon}</p>
        <p className="text-sm">{message}</p>
        <p className="text-xs mt-1 text-cc-subtle/70">Run tasks to populate memory</p>
      </div>
    </div>
  )
}
