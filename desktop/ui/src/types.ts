export type Page = 'home' | 'chat' | 'project' | 'diff' | 'terminal' | 'memory' | 'settings'

export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'complete' | 'error'
// 'running' kept as alias in context for backwards compat with electron IPC

export type ModelId = 'claude-sonnet-4-6' | 'claude-opus-4-7' | 'claude-haiku-4-5' | 'qwen-coder' | 'gpt-4o'

export interface Model {
  id: ModelId
  name: string
  shortName: string
  provider: 'anthropic' | 'qwen' | 'openai'
  color: string
}

export interface TokenUsage {
  used: number
  limit: number
  inputTokens: number
  outputTokens: number
}

export interface Session {
  id: string
  title: string
  subtitle: string
  status: 'active' | 'paused' | 'complete' | 'error'
  time: string
  repo: string
  model: string
}

export interface PullRequest {
  id: string
  number: number
  title: string
  repo: string
  branch: string
  status: 'open' | 'in-review' | 'merged' | 'closed'
  time: string
}

export interface LogEntry {
  id: string
  type: 'log' | 'error' | 'system' | 'tool'
  message: string
  timestamp: string
  tool?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  phase?: string
  isStreaming?: boolean
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

export interface GitStatus {
  success: boolean
  branch: string
  status: string
  diff: string
  error?: string
}

export interface AgentMemory {
  projectRoot?: string
  projectSummary?: string
  tasks: Array<{
    task: string
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
    timestamp: string
    result?: string
  }>
  notes: string[]
  decisions: Array<{
    decision: string
    reason: string
    timestamp: string
  }>
}

export interface QwenConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
  maxRetries: number
  maxTokens: number
}

export interface ProgressEvent {
  type: 'log' | 'error' | 'system'
  message: string
  timestamp: string
}

export interface CompleteEvent {
  success: boolean
  sessionId: string
  exitCode: number
}

declare global {
  interface Window {
    electronAPI: {
      runAgentTask: (task: string) => Promise<{ sessionId: string }>
      scanProject: () => Promise<{ success: boolean; output?: string; error?: string }>
      buildContext: (task: string) => Promise<{ success: boolean; output?: string; error?: string }>
      previewDiff: () => Promise<{ success: boolean; diff?: string; status?: string; sessions?: string; error?: string }>
      applyPatch: (sessionId: string) => Promise<{ success: boolean; output?: string; error?: string }>
      rollback: (sessionId: string) => Promise<{ success: boolean; output?: string; error?: string }>
      runVerification: () => Promise<{ success: boolean; output?: string; error?: string }>
      getProjectFiles: (dir?: string) => Promise<{ success: boolean; files?: FileNode[]; error?: string }>
      getFileContent: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
      getGitStatus: () => Promise<GitStatus>
      commitChanges: (message: string) => Promise<{ success: boolean; output?: string; error?: string }>
      getMemory: () => Promise<{ success: boolean; memory?: AgentMemory; error?: string }>
      getQwenConfig: () => Promise<{ success: boolean; config?: QwenConfig; error?: string }>
      updateQwenConfig: (config: Partial<QwenConfig>) => Promise<{ success: boolean; error?: string }>
      onAgentProgress: (cb: (data: ProgressEvent) => void) => void
      onAgentComplete: (cb: (data: CompleteEvent) => void) => void
      removeAllListeners: (channel: string) => void
    }
  }
}
