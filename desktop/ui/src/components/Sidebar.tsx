import { useApp } from '../context/AppContext'
import type { Page } from '../types'

interface NavItem {
  id: Page
  label: string
  icon: string
  description: string
}

const NAV: NavItem[] = [
  { id: 'chat',     label: 'Chat',     icon: '💬', description: 'Send tasks to agent' },
  { id: 'project',  label: 'Project',  icon: '📁', description: 'File explorer' },
  { id: 'diff',     label: 'Diff',     icon: '⚡', description: 'Pending changes' },
  { id: 'terminal', label: 'Terminal', icon: '⌨️', description: 'Command output' },
  { id: 'memory',   label: 'Memory',   icon: '🧠', description: 'Agent memory' },
  { id: 'settings', label: 'Settings', icon: '⚙️', description: 'Configuration' },
]

export default function Sidebar() {
  const { activePage, setActivePage, agentStatus } = useApp()

  return (
    <aside className="w-14 flex-shrink-0 bg-slate-900 border-r border-slate-700/50 flex flex-col items-center py-3 gap-1">
      {/* Logo */}
      <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center mb-4 flex-shrink-0">
        <span className="text-white text-xs font-bold">CA</span>
      </div>

      {/* Nav items */}
      {NAV.map((item) => (
        <NavButton
          key={item.id}
          item={item}
          active={activePage === item.id}
          agentRunning={item.id === 'chat' && agentStatus === 'running'}
          onClick={() => setActivePage(item.id)}
        />
      ))}

      <div className="flex-1" />

      {/* Status dot */}
      <StatusDot status={agentStatus} />
    </aside>
  )
}

function NavButton({
  item,
  active,
  agentRunning,
  onClick,
}: {
  item: NavItem
  active: boolean
  agentRunning: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={`${item.label} — ${item.description}`}
      className={[
        'relative w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-all duration-150',
        active
          ? 'bg-blue-600/20 text-blue-400'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50',
      ].join(' ')}
    >
      {item.icon}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-r" />
      )}
      {agentRunning && (
        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-400 pulse-dot" />
      )}
    </button>
  )
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    idle: 'bg-slate-600',
    running: 'bg-blue-400 pulse-dot',
    complete: 'bg-emerald-400',
    error: 'bg-red-400',
  }
  return (
    <div
      title={`Agent: ${status}`}
      className={`w-2 h-2 rounded-full mb-1 ${colors[status] ?? 'bg-slate-600'}`}
    />
  )
}
