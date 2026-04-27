import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type {
  TaskRecord,
  TaskStatus,
  DecisionRecord,
  ProjectNote,
  AgentRunRecord,
} from './types.js'

const MEMORY_DIR = path.join('.qwen-agent', 'memory')
const TASKS_FILE = path.join(MEMORY_DIR, 'tasks.json')
const DECISIONS_FILE = path.join(MEMORY_DIR, 'decisions.json')
const NOTES_FILE = path.join(MEMORY_DIR, 'project-notes.json')
const RUNS_FILE = path.join(MEMORY_DIR, 'agent-runs.json')

// Patterns for masking secrets before persistence
const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /sk-[A-Za-z0-9]{10,}/g, replacement: 'sk-[REDACTED]' },
  { pattern: /"api[_-]?key"\s*:\s*"[^"]{4,}"/gi, replacement: '"api_key": "[REDACTED]"' },
  { pattern: /Authorization:\s*\S+/gi, replacement: 'Authorization: [REDACTED]' },
  { pattern: /password['":\s]+[^\s'"]{4,}/gi, replacement: 'password: [REDACTED]' },
  {
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
    replacement: '[PRIVATE KEY REDACTED]',
  },
]

export function maskSecrets(text: string): string {
  let masked = text
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    masked = masked.replace(pattern, replacement)
  }
  return masked
}

function generateId(): string {
  return crypto.randomUUID()
}

function ensureMemoryDir(): void {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true })
  }
}

function atomicWrite(filePath: string, data: unknown): void {
  ensureMemoryDir()
  const jsonStr = JSON.stringify(data, null, 2)
  // Validate JSON round-trips cleanly before writing
  JSON.parse(jsonStr)
  const tempPath = `${filePath}.${Date.now()}.tmp`
  fs.writeFileSync(tempPath, jsonStr, 'utf8')
  fs.renameSync(tempPath, filePath)
}

function readJsonFile<T>(filePath: string, defaultVal: T): T {
  if (!fs.existsSync(filePath)) return defaultVal
  const raw = fs.readFileSync(filePath, 'utf8')
  try {
    return JSON.parse(raw) as T
  } catch {
    // Corrupted JSON — back up and return clean default
    const backupPath = `${filePath}.corrupt`
    try { fs.renameSync(filePath, backupPath) } catch { /* best effort */ }
    return defaultVal
  }
}

// ── Task Records ──────────────────────────────────────────────────────────────

export function addTask(
  record: Omit<TaskRecord, 'id' | 'createdAt' | 'updatedAt'>,
): TaskRecord {
  const tasks = readJsonFile<TaskRecord[]>(TASKS_FILE, [])
  const now = new Date().toISOString()
  const newRecord: TaskRecord = { ...record, id: generateId(), createdAt: now, updatedAt: now }
  tasks.push(newRecord)
  atomicWrite(TASKS_FILE, tasks)
  return newRecord
}

export function updateTask(id: string, patch: Partial<Omit<TaskRecord, 'id' | 'createdAt'>>): void {
  const tasks = readJsonFile<TaskRecord[]>(TASKS_FILE, [])
  const idx = tasks.findIndex(t => t.id === id)
  if (idx === -1) return
  tasks[idx] = { ...tasks[idx], ...patch, updatedAt: new Date().toISOString() }
  atomicWrite(TASKS_FILE, tasks)
}

export function listTasks(limit = 20): TaskRecord[] {
  const tasks = readJsonFile<TaskRecord[]>(TASKS_FILE, [])
  return tasks.slice(-limit).reverse()
}

export function getTask(id: string): TaskRecord | undefined {
  return readJsonFile<TaskRecord[]>(TASKS_FILE, []).find(t => t.id === id)
}

export function findTaskByRequest(userRequest: string): TaskRecord | undefined {
  const tasks = readJsonFile<TaskRecord[]>(TASKS_FILE, [])
  return [...tasks].reverse().find(
    t => t.userRequest === userRequest || t.title === userRequest,
  )
}

// ── Decision Records ──────────────────────────────────────────────────────────

export function addDecision(
  record: Omit<DecisionRecord, 'id' | 'createdAt'>,
): DecisionRecord {
  const decisions = readJsonFile<DecisionRecord[]>(DECISIONS_FILE, [])
  const newRecord: DecisionRecord = {
    ...record,
    id: generateId(),
    createdAt: new Date().toISOString(),
    decision: maskSecrets(record.decision),
    reason: maskSecrets(record.reason),
  }
  decisions.push(newRecord)
  atomicWrite(DECISIONS_FILE, decisions)
  return newRecord
}

export function listDecisions(limit = 20): DecisionRecord[] {
  const decisions = readJsonFile<DecisionRecord[]>(DECISIONS_FILE, [])
  return decisions.slice(-limit).reverse()
}

// ── Project Notes ─────────────────────────────────────────────────────────────

export function addProjectNote(
  note: Omit<ProjectNote, 'id' | 'createdAt' | 'updatedAt'>,
): ProjectNote {
  const notes = readJsonFile<ProjectNote[]>(NOTES_FILE, [])
  const now = new Date().toISOString()
  const newNote: ProjectNote = {
    ...note,
    id: generateId(),
    content: maskSecrets(note.content),
    createdAt: now,
    updatedAt: now,
  }
  notes.push(newNote)
  atomicWrite(NOTES_FILE, notes)
  return newNote
}

export function listProjectNotes(): ProjectNote[] {
  return readJsonFile<ProjectNote[]>(NOTES_FILE, [])
}

// ── Agent Run Records ─────────────────────────────────────────────────────────

export function addAgentRun(
  record: Omit<AgentRunRecord, 'id' | 'createdAt'>,
): AgentRunRecord {
  const runs = readJsonFile<AgentRunRecord[]>(RUNS_FILE, [])
  const newRecord: AgentRunRecord = {
    ...record,
    id: generateId(),
    createdAt: new Date().toISOString(),
    inputSummary: maskSecrets(record.inputSummary),
    outputSummary: maskSecrets(record.outputSummary),
    errors: record.errors.map(maskSecrets),
  }
  runs.push(newRecord)
  atomicWrite(RUNS_FILE, runs)
  return newRecord
}

export function listAgentRuns(taskId?: string, limit = 50): AgentRunRecord[] {
  const runs = readJsonFile<AgentRunRecord[]>(RUNS_FILE, [])
  const filtered = taskId ? runs.filter(r => r.taskId === taskId) : runs
  return filtered.slice(-limit).reverse()
}

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchResult {
  type: 'task' | 'decision' | 'note' | 'agent-run'
  id: string
  preview: string
  score: number
}

function scoreMatch(text: string, query: string): number {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (text.match(new RegExp(escaped, 'g')) ?? []).length
}

export function searchMemory(query: string): SearchResult[] {
  const q = query.toLowerCase()
  const results: SearchResult[] = []

  for (const t of readJsonFile<TaskRecord[]>(TASKS_FILE, [])) {
    const text = `${t.title} ${t.userRequest} ${t.verificationSummary}`.toLowerCase()
    if (text.includes(q)) {
      results.push({ type: 'task', id: t.id, preview: `[task] ${t.title} — ${t.status}`, score: scoreMatch(text, q) })
    }
  }

  for (const d of readJsonFile<DecisionRecord[]>(DECISIONS_FILE, [])) {
    const text = `${d.decision} ${d.reason}`.toLowerCase()
    if (text.includes(q)) {
      results.push({ type: 'decision', id: d.id, preview: `[decision:${d.agent}] ${d.decision.slice(0, 100)}`, score: scoreMatch(text, q) })
    }
  }

  for (const n of readJsonFile<ProjectNote[]>(NOTES_FILE, [])) {
    const text = `${n.title} ${n.content} ${n.tags.join(' ')}`.toLowerCase()
    if (text.includes(q)) {
      results.push({ type: 'note', id: n.id, preview: `[note] ${n.title}: ${n.content.slice(0, 100)}`, score: scoreMatch(text, q) })
    }
  }

  for (const r of readJsonFile<AgentRunRecord[]>(RUNS_FILE, [])) {
    const text = `${r.inputSummary} ${r.outputSummary}`.toLowerCase()
    if (text.includes(q)) {
      results.push({ type: 'agent-run', id: r.id, preview: `[${r.agent}] ${r.inputSummary.slice(0, 100)}`, score: scoreMatch(text, q) })
    }
  }

  return results.sort((a, b) => b.score - a.score)
}

// ── Clear ─────────────────────────────────────────────────────────────────────

export function clearMemory(): void {
  for (const f of [TASKS_FILE, DECISIONS_FILE, NOTES_FILE, RUNS_FILE]) {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }
}

// ── Memory summary for context injection ─────────────────────────────────────

export interface MemorySummary {
  recentTasks: TaskRecord[]
  recentDecisions: DecisionRecord[]
  projectNotes: ProjectNote[]
}

export function getMemorySummary(
  opts: { taskLimit?: number; decisionLimit?: number } = {},
): MemorySummary {
  return {
    recentTasks: listTasks(opts.taskLimit ?? 5),
    recentDecisions: listDecisions(opts.decisionLimit ?? 10),
    projectNotes: listProjectNotes(),
  }
}

export type { TaskStatus }
