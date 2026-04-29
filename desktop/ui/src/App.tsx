import { useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/Sidebar'
import RightPanel from './components/RightPanel'
import StatusBar from './components/StatusBar'
import DashboardPage from './pages/DashboardPage'
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
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0b0b0c 0%, #111111 60%, #0f0f11 100%)' }}
    >
      {/* Three-column body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          <div className="flex-1 min-h-0 overflow-hidden fade-in">
            {activePage === 'home'     && <DashboardPage />}
            {activePage === 'chat'     && <ChatPage />}
            {activePage === 'project'  && <ProjectPage />}
            {activePage === 'diff'     && <DiffPage />}
            {activePage === 'terminal' && <TerminalPage />}
            {activePage === 'memory'   && <MemoryPage />}
            {activePage === 'settings' && <SettingsPage />}
          </div>
        </main>

        <RightPanel />
      </div>

      {/* Footer status bar — full width */}
      <StatusBar />
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
