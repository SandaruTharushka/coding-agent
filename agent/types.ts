export interface Plan {
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

export interface AgentMemory {
  projectRoot: string
  projectSummary: string
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

export interface ProjectContext {
  root: string
  fileTree: string
  files: FileEntry[]
  summary: string
  totalFiles: number
  languages: string[]
  packageJson?: Record<string, unknown>
  hasGit: boolean
  hasTsConfig: boolean
}

export interface FileEntry {
  path: string
  relativePath: string
  size: number
  extension: string
  modified: string
}

export interface VerifyResult {
  success: boolean
  buildOutput?: string
  testOutput?: string
  errors: string[]
  attempts: number
}

export interface PatchResult {
  success: boolean
  appliedFiles: string[]
  errors: string[]
  backupDir: string
}
