import { useApp } from '../context/AppContext'
import type { Page } from '../types'

/* ── Mock recent sessions ──────────────────────────────────── */
const RECENTS = [
  { id: 'r1', title: 'Design AI agent UI',       time: 'Just now',  repo: 'coding-agent' },
  { id: 'r2', title: 'Fix auth middleware bug',   time: '12 min ago', repo: 'coding-agent' },
  { id: 'r3', title: 'Add token usage tracker',  time: '1 hr ago',  repo: 'coding-agent' },
  { id: 'r4', title: 'Refactor tool pipeline',   time: '3 hrs ago', repo: 'coding-agent' },
  { id: 'r5', title: 'Write E2E test suite',      time: 'Yesterday', repo: 'coding-agent' },
  { id: 'r6', title: 'Update Qwen model config', time: 'Yesterday', repo: 'coding-agent' },
  { id: 'r7', title: 'Migrate to TypeScript',    time: '2 days ago', repo: 'bridge' },
]

/* ── Icons ─────────────────────────────────────────────────── */
function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 2v11M2 7.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}
function IconRoutines() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2 4h11M2 7.5h7M2 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="12" cy="10.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}
function IconCustomize() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2M3.05 3.05l1.41 1.41M10.54 10.54l1.41 1.41M10.54 3.05l-1.41 1.41M4.46 10.54l-1.41 1.41"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
function IconMore() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="3.5" cy="7.5" r="1.2" fill="currentColor"/>
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/>
      <circle cx="11.5" cy="7.5" r="1.2" fill="currentColor"/>
    </svg>
  )
}
function IconClock() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M6 3.5V6l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconHome() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M1.5 7L7.5 1.5L13.5 7V13.5H9.5V10H5.5V13.5H1.5V7Z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
}
function IconChat() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M13 8.5C13 9.88 11.88 11 10.5 11H7L4 13.5V11H3.5C2.12 11 1 9.88 1 8.5V4.5C1 3.12 2.12 2 3.5 2H10.5C11.88 2 13 3.12 13 4.5V8.5Z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
}

/* ── Nav config ─────────────────────────────────────────────── */
interface NavItem { id: string; label: string; icon: React.ReactNode; page?: Page; divider?: boolean }

const TOP_NAV: NavItem[] = [
  { id: 'new-session', label: 'New session', icon: <IconPlus /> },
  { id: 'home',        label: 'Dashboard',   icon: <IconHome />,    page: 'home' },
  { id: 'chat',        label: 'Chat',        icon: <IconChat />,    page: 'chat' },
  { id: 'routines',    label: 'Routines',    icon: <IconRoutines /> },
  { id: 'customize',   label: 'Customize',   icon: <IconCustomize />, page: 'settings' },
  { id: 'more',        label: 'More',        icon: <IconMore /> },
]

export default function Sidebar() {
  const { activePage, setActivePage, agentStatus } = useApp()

  function handleNavClick(item: NavItem) {
    if (item.page) setActivePage(item.page)
  }

  return (
    <aside
      className="flex flex-col h-full overflow-hidden flex-shrink-0"
      style={{ width: 260, minWidth: 260, background: '#0f0f10', borderRight: '1px solid #1f1f22' }}
    >
      {/* ── Logo / Header ──────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 flex-shrink-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #ff6a3d 0%, #ff5020 100%)', boxShadow: '0 0 16px rgba(255,106,61,0.30)' }}
        >
          <span className="text-white text-xs font-bold tracking-tight">C</span>
        </div>
        <div className="min-w-0">
          <div className="text-cc-text font-semibold text-sm leading-tight">Claude Code</div>
          <div className="text-cc-subtle text-xs leading-tight mt-0.5">Research preview</div>
        </div>

        {/* Agent running indicator */}
        {(agentStatus === 'thinking' || agentStatus === 'executing') && (
          <div className="ml-auto flex-shrink-0">
            <div
              className={`w-2 h-2 rounded-full ${agentStatus === 'thinking' ? 'bg-amber-400' : 'bg-blue-400'}`}
              style={{ animation: 'statusPulse 1.2s ease-in-out infinite' }}
            />
          </div>
        )}
      </div>

      {/* ── Navigation ─────────────────────────────────────── */}
      <nav className="px-2 flex-shrink-0 space-y-0.5">
        {TOP_NAV.map((item) => {
          const isActive = item.page ? activePage === item.page : false
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="flex-shrink-0 opacity-75">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
              {item.id === 'new-session' && (
                <span className="ml-auto text-cc-subtle text-xs mono">⌘N</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* ── Pinned ─────────────────────────────────────────── */}
      <div className="mt-5 px-2 flex-shrink-0">
        <p className="section-label px-2 mb-2">Pinned</p>
        <div
          className="flex items-center justify-center py-5 rounded-lg mx-0.5"
          style={{ border: '1px dashed #2a2a2e' }}
        >
          <span className="text-cc-subtle text-xs select-none">Drag sessions here to pin</span>
        </div>
      </div>

      {/* ── Recents ────────────────────────────────────────── */}
      <div className="mt-5 px-2 flex-1 min-h-0 flex flex-col overflow-hidden">
        <p className="section-label px-2 mb-2">Recents</p>
        <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
          {RECENTS.map((item) => (
            <RecentItem key={item.id} item={item} />
          ))}
        </div>
      </div>

      {/* ── Bottom spacer ──────────────────────────────────── */}
      <div className="h-3 flex-shrink-0" />
    </aside>
  )
}

function RecentItem({ item }: { item: typeof RECENTS[0] }) {
  return (
    <button
      className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left cursor-pointer group"
      style={{ transition: 'background 0.15s ease' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1d')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div className="mt-0.5 flex-shrink-0 opacity-40 group-hover:opacity-60 transition-opacity">
        <IconClock />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-cc-muted text-xs font-medium truncate group-hover:text-cc-text transition-colors leading-snug">
          {item.title}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-cc-subtle text-xs truncate">{item.repo}</span>
          <span className="text-cc-subtle text-xs opacity-50">·</span>
          <span className="text-cc-subtle text-xs flex-shrink-0">{item.time}</span>
        </div>
      </div>
    </button>
  )
}
