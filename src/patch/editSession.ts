import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'

export interface BackupRecord {
  originalPath: string
  backupPath: string
  hashBefore: string
  timestamp: string
}

export interface DiffRecord {
  filePath: string
  diff: string
  addedLines: number
  removedLines: number
}

export interface EditSession {
  id: string
  task: string
  createdAt: string
  status: 'planned' | 'previewed' | 'applied' | 'rolled_back' | 'failed'
  changedFiles: string[]
  backups: BackupRecord[]
  diffs: DiffRecord[]
}

const SESSIONS_DIR = path.join('.qwen-agent', 'edit-sessions')

export function createSession(task: string): EditSession {
  const session: EditSession = {
    id: randomUUID(),
    task,
    createdAt: new Date().toISOString(),
    status: 'planned',
    changedFiles: [],
    backups: [],
    diffs: [],
  }
  saveSession(session)
  return session
}

export function saveSession(session: EditSession): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true })
  fs.writeFileSync(
    path.join(SESSIONS_DIR, `${session.id}.json`),
    JSON.stringify(session, null, 2),
    'utf8',
  )
}

export function loadSession(id: string): EditSession | null {
  const filePath = path.join(SESSIONS_DIR, `${id}.json`)
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as EditSession
}

export function listSessions(): EditSession[] {
  if (!fs.existsSync(SESSIONS_DIR)) return []
  return fs
    .readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8')) as EditSession)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getLatestSession(): EditSession | null {
  const sessions = listSessions()
  return sessions.length > 0 ? sessions[0] : null
}

export function getLatestAppliedSession(): EditSession | null {
  const sessions = listSessions().filter(s => s.status === 'applied')
  return sessions.length > 0 ? sessions[0] : null
}
