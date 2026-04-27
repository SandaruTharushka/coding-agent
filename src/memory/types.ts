export type TaskStatus = 'planned' | 'applied' | 'verified' | 'failed' | 'rolled_back'

export interface TaskRecord {
  id: string
  title: string
  userRequest: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
  changedFiles: string[]
  verificationSummary: string
  commitHash: string
}

export interface DecisionRecord {
  id: string
  taskId: string
  decision: string
  reason: string
  createdAt: string
  agent: string
}

export interface ProjectNote {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface AgentRunRecord {
  id: string
  taskId: string
  agent: string
  inputSummary: string
  outputSummary: string
  success: boolean
  errors: string[]
  createdAt: string
}
