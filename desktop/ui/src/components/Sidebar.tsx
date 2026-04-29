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
    <aside className="w-14 flex-shrink-0 bg-cc-sidebar border-r border-cc-border flex flex-col items-center py-3 gap-1">
      {/* Logo */}
      <div className="w-8 h-8 rounded-lg bg-cc-accent flex items-center justify-center mb-4 flex-shrink-0">
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
          ? 'bg-cc-accent-bg text-cc-accent'
          : 'text-cc-subtle hover:text-cc-muted hover:bg-cc-surface',
      ].join(' ')}
    >
      {item.icon}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-cc-accent rounded-r" />
      )}
      {agentRunning && (
        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-cc-accent pulse-dot" />
      )}
    </button>
  )
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    idle: 'bg-cc-subtle',
    running: 'bg-cc-accent pulse-dot',
    complete: 'bg-cc-success',
    error: 'bg-cc-error',
  }
  return (
    <div
      title={`Agent: ${status}`}
      className={`w-2 h-2 rounded-full mb-1 ${colors[status] ?? 'bg-cc-subtle'}`}
    />
  )
}
