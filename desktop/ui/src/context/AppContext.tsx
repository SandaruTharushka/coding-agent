import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react'
import type { Page, AgentStatus, LogEntry, GitStatus, ModelId, TokenUsage } from '../types'

interface AppState {
  activePage: Page
  agentStatus: AgentStatus
  currentTask: string
  currentPhase: string
  logs: LogEntry[]
  gitStatus: GitStatus | null
  lastSessionId: string | null
  selectedModel: ModelId
  tokenUsage: TokenUsage
  activeToolName: string
}

type Action =
  | { type: 'SET_PAGE';         page: Page }
  | { type: 'SET_AGENT_STATUS'; status: AgentStatus }
  | { type: 'SET_TASK';         task: string }
  | { type: 'SET_PHASE';        phase: string }
  | { type: 'ADD_LOG';          entry: LogEntry }
  | { type: 'CLEAR_LOGS' }
  | { type: 'SET_GIT_STATUS';   status: GitStatus }
  | { type: 'SET_SESSION';      sessionId: string }
  | { type: 'SET_MODEL';        model: ModelId }
  | { type: 'SET_TOKEN_USAGE';  usage: Partial<TokenUsage> }
  | { type: 'SET_ACTIVE_TOOL';  tool: string }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PAGE':          return { ...state, activePage: action.page }
    case 'SET_AGENT_STATUS':  return { ...state, agentStatus: action.status }
    case 'SET_TASK':          return { ...state, currentTask: action.task }
    case 'SET_PHASE':         return { ...state, currentPhase: action.phase }
    case 'ADD_LOG':           return { ...state, logs: [...state.logs.slice(-2000), action.entry] }
    case 'CLEAR_LOGS':        return { ...state, logs: [] }
    case 'SET_GIT_STATUS':    return { ...state, gitStatus: action.status }
    case 'SET_SESSION':       return { ...state, lastSessionId: action.sessionId }
    case 'SET_MODEL':         return { ...state, selectedModel: action.model }
    case 'SET_TOKEN_USAGE':   return { ...state, tokenUsage: { ...state.tokenUsage, ...action.usage } }
    case 'SET_ACTIVE_TOOL':   return { ...state, activeToolName: action.tool }
    default:                  return state
  }
}

const initial: AppState = {
  activePage:    'home',
  agentStatus:   'idle',
  currentTask:   '',
  currentPhase:  '',
  logs:          [],
  gitStatus:     null,
  lastSessionId: null,
  selectedModel: 'claude-sonnet-4-6',
  tokenUsage: {
    used:         42380,
    limit:        200000,
    inputTokens:  28900,
    outputTokens: 13480,
  },
  activeToolName: '',
}

interface AppContextValue extends AppState {
  setActivePage:    (page: Page) => void
  setAgentStatus:   (status: AgentStatus) => void
  setCurrentTask:   (task: string) => void
  setCurrentPhase:  (phase: string) => void
  addLog:           (entry: Omit<LogEntry, 'id'>) => void
  clearLogs:        () => void
  refreshGitStatus: () => void
  setLastSessionId: (id: string) => void
  setSelectedModel: (model: ModelId) => void
  updateTokenUsage: (usage: Partial<TokenUsage>) => void
  setActiveTool:    (tool: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)
let logIdCounter = 0

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const gitRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setActivePage    = useCallback((page: Page) =>           dispatch({ type: 'SET_PAGE', page }), [])
  const setAgentStatus   = useCallback((status: AgentStatus) =>  dispatch({ type: 'SET_AGENT_STATUS', status }), [])
  const setCurrentTask   = useCallback((task: string) =>         dispatch({ type: 'SET_TASK', task }), [])
  const setCurrentPhase  = useCallback((phase: string) =>        dispatch({ type: 'SET_PHASE', phase }), [])
  const clearLogs        = useCallback(() =>                     dispatch({ type: 'CLEAR_LOGS' }), [])
  const setLastSessionId = useCallback((sessionId: string) =>    dispatch({ type: 'SET_SESSION', sessionId }), [])
  const setSelectedModel = useCallback((model: ModelId) =>       dispatch({ type: 'SET_MODEL', model }), [])
  const updateTokenUsage = useCallback((usage: Partial<TokenUsage>) => dispatch({ type: 'SET_TOKEN_USAGE', usage }), [])
  const setActiveTool    = useCallback((tool: string) =>         dispatch({ type: 'SET_ACTIVE_TOOL', tool }), [])

  const addLog = useCallback((entry: Omit<LogEntry, 'id'>) => {
    dispatch({ type: 'ADD_LOG', entry: { ...entry, id: String(++logIdCounter) } })
  }, [])

  const refreshGitStatus = useCallback(async () => {
    if (gitRefreshTimer.current) clearTimeout(gitRefreshTimer.current)
    gitRefreshTimer.current = setTimeout(async () => {
      try {
        const result = await window.electronAPI.getGitStatus()
        dispatch({ type: 'SET_GIT_STATUS', status: result })
      } catch { /* ignore */ }
    }, 300)
  }, [])

  return (
    <AppContext.Provider value={{
      ...state,
      setActivePage,
      setAgentStatus,
      setCurrentTask,
      setCurrentPhase,
      addLog,
      clearLogs,
      refreshGitStatus,
      setLastSessionId,
      setSelectedModel,
      updateTokenUsage,
      setActiveTool,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
