import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import lockfile from 'proper-lockfile'
import type { AgentMemory, Plan, ProjectContext } from '../types.js'

const AGENT_DIR = '.agent'
const MEMORY_FILE = path.join(AGENT_DIR, 'memory.json')
const PLAN_FILE = path.join(AGENT_DIR, 'plan.json')
const CONTEXT_FILE = path.join(AGENT_DIR, 'context.json')

function ensureAgentDir(): void {
  if (!fs.existsSync(AGENT_DIR)) {
    fs.mkdirSync(AGENT_DIR, { recursive: true })
  }
  const gi = path.join(AGENT_DIR, '.gitignore')
  if (!fs.existsSync(gi)) {
    fs.writeFileSync(gi, 'backups/\n', 'utf8')
  }
}

async function withMemoryLock<T>(fn: () => T): Promise<T> {
  ensureAgentDir()
  const lockTarget = MEMORY_FILE
  if (!fs.existsSync(lockTarget)) fs.writeFileSync(lockTarget, '{}', 'utf8')
  const release = await lockfile.lock(lockTarget, { retries: { retries: 5, minTimeout: 50 } })
  try {
    return fn()
  } finally {
    await release()
  }
}

export function readMemory(): AgentMemory {
  ensureAgentDir()
  if (!fs.existsSync(MEMORY_FILE)) {
    return {
      projectRoot: process.cwd(),
      projectSummary: '',
      tasks: [],
      notes: [],
      decisions: [],
    }
  }
  const raw = fs.readFileSync(MEMORY_FILE, 'utf8')
  try {
    const parsed = JSON.parse(raw) as Partial<AgentMemory>
    return {
      projectRoot: parsed.projectRoot ?? process.cwd(),
      projectSummary: parsed.projectSummary ?? '',
      tasks: parsed.tasks ?? [],
      notes: parsed.notes ?? [],
      decisions: parsed.decisions ?? [],
    }
  } catch {
    return {
      projectRoot: process.cwd(),
      projectSummary: '',
      tasks: [],
      notes: [],
      decisions: [],
    }
  }
}

export function writeMemory(memory: AgentMemory): void {
  ensureAgentDir()
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf8')
}

export function readPlan(): Plan | null {
  if (!fs.existsSync(PLAN_FILE)) return null
  return JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8')) as Plan
}

export function writePlan(plan: Plan): void {
  ensureAgentDir()
  fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2), 'utf8')
}

export function readContext(): ProjectContext | null {
  if (!fs.existsSync(CONTEXT_FILE)) return null
  return JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8')) as ProjectContext
}

export function writeContext(context: ProjectContext): void {
  ensureAgentDir()
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2), 'utf8')
}

export async function addTask(
  task: string,
  status: AgentMemory['tasks'][number]['status'],
): Promise<string> {
  return withMemoryLock(() => {
    const id = randomUUID()
    const memory = readMemory()
    memory.tasks.push({ id, task, status, timestamp: new Date().toISOString() })
    writeMemory(memory)
    return id
  })
}

export async function updateTaskStatus(
  taskOrId: string,
  status: AgentMemory['tasks'][number]['status'],
  result?: string,
): Promise<void> {
  return withMemoryLock(() => {
    const memory = readMemory()
    const entry =
      memory.tasks.find(t => t.id === taskOrId) ??
      [...memory.tasks].reverse().find(t => t.task === taskOrId)
    if (entry) {
      entry.status = status
      if (result) entry.result = result.slice(0, 500)
    }
    writeMemory(memory)
  })
}

export async function addNote(note: string): Promise<void> {
  return withMemoryLock(() => {
    const memory = readMemory()
    memory.notes.push(note)
    writeMemory(memory)
  })
}

export async function addDecision(decision: string, reason: string): Promise<void> {
  return withMemoryLock(() => {
    const memory = readMemory()
    memory.decisions.push({ decision, reason, timestamp: new Date().toISOString() })
    writeMemory(memory)
  })
}
