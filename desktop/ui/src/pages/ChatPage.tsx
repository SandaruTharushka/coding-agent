import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import ChatInput from '../components/ChatInput'
import type { ChatMessage, ProgressEvent, CompleteEvent } from '../types'

let msgId = 0

const PHASE_PATTERNS: Array<[RegExp, string]> = [
  [/architect/i, 'Architect'],
  [/plan/i, 'Architect'],
  [/coder|implement/i, 'Coder'],
  [/tester|build|test/i, 'Tester'],
  [/reviewer|review/i, 'Reviewer'],
]

function detectPhase(msg: string): string | undefined {
  for (const [re, phase] of PHASE_PATTERNS) {
    if (re.test(msg)) return phase
  }
  return undefined
}

function PhaseBadge({ phase }: { phase: string }) {
  const colors: Record<string, string> = {
    Architect: 'badge-blue',
    Coder: 'badge-yellow',
    Tester: 'badge-green',
    Reviewer: 'badge-gray',
  }
  return <span className={`badge ${colors[phase] ?? 'badge-gray'}`}>{phase}</span>
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-cc-surface text-cc-muted text-xs border border-cc-border">
          {msg.phase && <PhaseBadge phase={msg.phase} />}
          <span>{msg.content}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={[
          'max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-cc-accent text-white rounded-br-sm'
            : 'bg-cc-surface text-cc-text rounded-bl-sm border border-cc-border',
        ].join(' ')}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs font-semibold text-cc-muted">Agent</span>
            {msg.phase && <PhaseBadge phase={msg.phase} />}
            {msg.isStreaming && (
              <span className="text-xs text-cc-accent pulse-dot">●</span>
            )}
          </div>
        )}
        <p className="whitespace-pre-wrap">{msg.content}</p>
        <p className="text-xs opacity-40 mt-1.5 text-right">
          {new Date(msg.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const { agentStatus, setAgentStatus, setCurrentTask, setCurrentPhase, addLog, refreshGitStatus, setLastSessionId } = useApp()
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: String(++msgId),
      role: 'system',
      content: 'Coding Agent ready. Describe a task to get started.',
      timestamp: new Date().toISOString(),
    },
  ])
  const [streamBuffer, setStreamBuffer] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const streamMsgIdRef = useRef<string | null>(null)
  const isRunning = agentStatus === 'thinking' || agentStatus === 'executing'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(task: string) {
    if (isRunning) return

    // Add user message
    const userMsg: ChatMessage = {
      id: String(++msgId),
      role: 'user',
      content: task,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setCurrentTask(task)
    setAgentStatus('thinking')

    // Add streaming assistant placeholder
    const streamId = String(++msgId)
    streamMsgIdRef.current = streamId
    setMessages((prev) => [
      ...prev,
      { id: streamId, role: 'assistant', content: '', timestamp: new Date().toISOString(), isStreaming: true },
    ])

    setStreamBuffer('')

    // Register listeners before invoking
    window.electronAPI.removeAllListeners('agent:progress')
    window.electronAPI.removeAllListeners('agent:complete')

    window.electronAPI.onAgentProgress((data: ProgressEvent) => {
      const msg = data.message ?? ''
      const phase = detectPhase(msg)
      if (phase) setCurrentPhase(phase)

      addLog({ type: data.type === 'error' ? 'error' : 'log', message: msg, timestamp: data.timestamp })

      // Accumulate into streaming message (keep last 2000 chars)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamId
            ? { ...m, content: (m.content + msg).slice(-2000), phase: phase ?? m.phase }
            : m,
        ),
      )
    })

    window.electronAPI.onAgentComplete((data: CompleteEvent) => {
      const success = data.success
      setAgentStatus(success ? 'complete' : 'error')
      setCurrentPhase('')
      setLastSessionId(data.sessionId)

      // Finalize streaming message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamId ? { ...m, isStreaming: false } : m,
        ),
      )

      // Add completion summary
      setMessages((prev) => [
        ...prev,
        {
          id: String(++msgId),
          role: 'system',
          content: success
            ? '✓ Task completed successfully'
            : `✗ Task failed (exit code: ${data.exitCode})`,
          timestamp: new Date().toISOString(),
        },
      ])

      refreshGitStatus()
    })

    try {
      await window.electronAPI.runAgentTask(task)
    } catch (err) {
      setAgentStatus('error')
      setMessages((prev) => [
        ...prev,
        { id: String(++msgId), role: 'system', content: `Error: ${(err as Error).message}`, timestamp: new Date().toISOString() },
      ])
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-cc-border flex items-center gap-3">
        <h1 className="text-sm font-semibold text-cc-text">Chat</h1>
        {isRunning && (
          <div className="flex items-center gap-2 text-xs text-cc-accent">
            <span className="spin inline-block w-3 h-3 border border-cc-accent/30 border-t-cc-accent rounded-full" />
            <span>Agent running…</span>
          </div>
        )}
        <div className="flex-1" />
        <button
          onClick={() =>
            setMessages([{ id: String(++msgId), role: 'system', content: 'Cleared.', timestamp: new Date().toISOString() }])
          }
          disabled={isRunning}
          className="btn-ghost text-xs"
        >
          Clear
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0">
        <ChatInput onSend={handleSend} disabled={isRunning} />
      </div>
    </div>
  )
}
