import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import ActivityFeed, { type ActivityItem } from '../components/ActivityFeed'
import ChatPanel from '../components/ChatPanel'
import SafetyModal from '../components/SafetyModal'
import TokenUsageCard from '../components/TokenUsageCard'

let msgId = 0

function toActivity(message: string): ActivityItem | null {
  const lower = message.toLowerCase()
  if (lower.includes('created')) return { id: String(++msgId), type: 'created', file: 'new-file.ts', status: 'ok', summary: 'Created file · +42 -0' }
  if (lower.includes('edited')) return { id: String(++msgId), type: 'edited', file: 'updated-file.tsx', status: 'ok', summary: 'Edited file · +28 -3' }
  if (lower.includes('test')) return { id: String(++msgId), type: 'test', file: 'tests', status: lower.includes('fail') ? 'error' : 'ok', summary: message }
  if (lower.includes('commit')) return { id: String(++msgId), type: 'commit', file: 'git', status: 'pending', summary: 'Git commit ready' }
  if (lower.trim().length > 0) return { id: String(++msgId), type: 'command', file: 'terminal', status: 'pending', summary: message }
  return null
}

export default function ChatPage() {
  const { gitStatus, addLog, setAgentStatus, setCurrentTask } = useApp()
  const [task, setTask] = useState('Build premium provider management UI with safety checks and verification loop')
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [showSafety, setShowSafety] = useState(false)

  const branch = gitStatus?.branch || 'main'
  const repoName = 'coding-agent'

  const usage = useMemo(() => ({ used: 52340, budget: 120000, cost: 1.74 }), [])

  async function runTask() {
    setCurrentTask(task)
    if (/rm -rf|sudo|chmod 777/.test(task)) {
      setShowSafety(true)
      return
    }

    setAgentStatus('running')
    const queued: ActivityItem = {
      id: crypto.randomUUID(),
      type: 'command',
      file: 'task',
      status: 'pending',
      summary: task,
    }
    setActivities((prev) => [queued, ...prev].slice(0, 20))

    try {
      await window.electronAPI.runAgentTask(task)
      addLog({ type: 'log', message: `Ran task: ${task}`, timestamp: new Date().toISOString() })
      const mapped = toActivity('Git commit ready')
      if (mapped) setActivities((prev) => [mapped, ...prev].slice(0, 20))
      setAgentStatus('complete')
    } catch (error) {
      addLog({ type: 'error', message: `Task failed: ${(error as Error).message}`, timestamp: new Date().toISOString() })
      const mapped = toActivity('Test failed')
      if (mapped) setActivities((prev) => [mapped, ...prev].slice(0, 20))
      setAgentStatus('error')
    }
  }

  return (
    <div className="relative flex h-full flex-col gap-3 overflow-hidden bg-gradient-to-b from-[#0b0b0d] to-[#101014] p-4">
      <header className="rounded-2xl border border-[#2a2a32] bg-[#18181d] p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#f5f5f7]">{repoName} <span className="text-sm text-[#9ca3af]">/ {branch}</span></h2>
          <span className="rounded-full bg-[#8b5cf6]/20 px-2 py-1 text-xs text-[#c4b5fd]">Active workspace</span>
        </div>
        <p className="text-sm text-[#9ca3af]">Task: {task}</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1fr_280px]">
        <div className="min-h-0 overflow-y-auto pr-1">
          <ActivityFeed items={activities.length ? activities : [
            { id: '1', type: 'created', file: 'src/components/ProviderSettings.tsx', status: 'ok', summary: 'Created file · +126 -0' },
            { id: '2', type: 'edited', file: 'src/pages/ChatPage.tsx', status: 'ok', summary: 'Edited file · +98 -56' },
            { id: '3', type: 'command', file: 'npm run build', status: 'pending', summary: 'Ran command · compiling renderer' },
            { id: '4', type: 'test', file: 'verification', status: 'warn', summary: 'Test passed with warnings' },
            { id: '5', type: 'commit', file: 'git status', status: 'pending', summary: 'Git commit ready' },
          ]} />
        </div>
        <TokenUsageCard used={usage.used} budget={usage.budget} cost={usage.cost} />
      </div>

      <ChatPanel value={task} onChange={setTask} onRun={runTask} />

      <SafetyModal
        open={showSafety}
        command={task}
        onCancel={() => setShowSafety(false)}
        onApprove={() => {
          setShowSafety(false)
          void runTask()
        }}
      />
    </div>
  )
}
