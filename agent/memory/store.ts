import * as fs from 'fs'
import * as path from 'path'
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
  return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')) as AgentMemory
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
  // Strip file contents from stored context (too large), keep metadata
  const stored = { ...context, files: context.files.map(f => ({ ...f })) }
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(stored, null, 2), 'utf8')
}

export function addTask(task: string, status: AgentMemory['tasks'][number]['status']): void {
  const memory = readMemory()
  memory.tasks.push({ task, status, timestamp: new Date().toISOString() })
  writeMemory(memory)
}

export function updateTaskStatus(
  task: string,
  status: AgentMemory['tasks'][number]['status'],
  result?: string,
): void {
  const memory = readMemory()
  const entry = [...memory.tasks].reverse().find(t => t.task === task)
  if (entry) {
    entry.status = status
    if (result) entry.result = result.slice(0, 500)
  }
  writeMemory(memory)
}

export function addNote(note: string): void {
  const memory = readMemory()
  memory.notes.push(note)
  writeMemory(memory)
}

export function addDecision(decision: string, reason: string): void {
  const memory = readMemory()
  memory.decisions.push({ decision, reason, timestamp: new Date().toISOString() })
  writeMemory(memory)
}
