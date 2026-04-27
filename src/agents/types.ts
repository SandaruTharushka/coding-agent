export type AgentName = 'coordinator' | 'architect' | 'coder' | 'tester' | 'reviewer'

export interface AgentInput {
  task: string
  context?: AgentContext | string
  data?: unknown
}

export interface AgentResult {
  agent: string
  success: boolean
  summary: string
  data?: unknown
  errors?: string[]
  nextActions?: string[]
}

export interface AgentPlan {
  task: string
  createdAt: string
  filesToChange: Array<{
    path: string
    action: 'create' | 'modify' | 'delete'
    reason: string
    content?: string
  }>
  steps: string[]
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  appliedAt?: string
}

export interface AgentTask {
  id: string
  task: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  timestamp: string
  result?: AgentResult
}

export interface AgentContext {
  root: string
  fileTree: string
  files: Array<{
    path: string
    content: string
    language: string
    size: number
    lastModified: Date
  }>
  summary: string
  totalFiles: number
  languages: string[]
  packageJson?: Record<string, unknown>
  hasGit: boolean
  hasTsConfig: boolean
}

export interface VerificationResult {
  success: boolean
  buildOutput?: string
  testOutput?: string
  errors: string[]
  attempts: number
}

export interface ReviewResult {
  approved: boolean
  issues: string[]
  suggestions: string[]
}
