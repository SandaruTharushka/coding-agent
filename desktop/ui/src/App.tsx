import { useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/Sidebar'
import RightPanel from './components/RightPanel'
import ChatPage from './pages/ChatPage'
import ProjectPage from './pages/ProjectPage'
import DiffPage from './pages/DiffPage'
import TerminalPage from './pages/TerminalPage'
import SettingsPage from './pages/SettingsPage'
import MemoryPage from './pages/MemoryPage'

function AppShell() {
  const { activePage, refreshGitStatus } = useApp()

  useEffect(() => {
    refreshGitStatus()
    const interval = setInterval(refreshGitStatus, 15000)
    return () => clearInterval(interval)
  }, [refreshGitStatus])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-cc-bg text-cc-text">
      {/* Left sidebar */}
      <Sidebar />

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {activePage === 'chat' && <ChatPage />}
        {activePage === 'project' && <ProjectPage />}
        {activePage === 'diff' && <DiffPage />}
        {activePage === 'terminal' && <TerminalPage />}
        {activePage === 'memory' && <MemoryPage />}
        {activePage === 'settings' && <SettingsPage />}
      </main>

      {/* Right panel */}
      <RightPanel />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
