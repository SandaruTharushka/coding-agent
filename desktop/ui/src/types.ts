export type Page = 'chat' | 'project' | 'diff' | 'terminal' | 'memory' | 'settings'

export type AgentStatus = 'idle' | 'running' | 'complete' | 'error'

export interface LogEntry {
  id: string
  type: 'log' | 'error' | 'system'
  message: string
  timestamp: string
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

// ─── Legacy Qwen config (kept for backward compat) ────────────────────────────

export interface QwenConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
  maxRetries: number
  maxTokens: number
}

// ─── Multi-provider AI config ─────────────────────────────────────────────────

export type AgentPurpose = 'coordinator' | 'architect' | 'coder' | 'tester' | 'reviewer' | 'general'

export interface ProviderStatus {
  id: string
  name: string
  status: 'connected' | 'missing-key' | 'no-key-required'
  maskedKey: string
}

export interface AgentModelProfile {
  providerId: string
  model: string
  maxTokens?: number
  temperature?: number
}

export interface AIConfig {
  defaultProvider: string
  defaultModel: string
  providerStatuses: ProviderStatus[]
  agentProfiles: Record<AgentPurpose, AgentModelProfile>
  maxTokens: number
  timeoutMs: number
  maxRetries: number
  stream: boolean
}

export interface UsageSummary {
  totalRecords: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalEstimatedCost: number | null
  byProvider: Record<string, {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCost: number | null
    calls: number
  }>
  byModel: Record<string, {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCost: number | null
    calls: number
  }>
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
      // Legacy Qwen config
      getQwenConfig: () => Promise<{ success: boolean; config?: QwenConfig; error?: string }>
      updateQwenConfig: (config: Partial<QwenConfig>) => Promise<{ success: boolean; error?: string }>
      // Multi-provider AI config
      getAIConfig: () => Promise<{ success: boolean; config?: AIConfig; error?: string }>
      setAIDefault: (provider: string, model: string) => Promise<{ success: boolean; error?: string }>
      setProviderKey: (provider: string) => Promise<{ success: boolean; error?: string }>
      removeProviderKey: (provider: string) => Promise<{ success: boolean; error?: string }>
      setAgentProfile: (purpose: AgentPurpose, provider: string, model: string) => Promise<{ success: boolean; error?: string }>
      testProvider: (provider: string, model: string) => Promise<{ success: boolean; latencyMs?: number; error?: string }>
      getUsageSummary: () => Promise<{ success: boolean; summary?: UsageSummary; error?: string }>
      clearUsage: () => Promise<{ success: boolean; error?: string }>
      onAgentProgress: (cb: (data: ProgressEvent) => void) => void
      onAgentComplete: (cb: (data: CompleteEvent) => void) => void
      removeAllListeners: (channel: string) => void
    }
  }
}
