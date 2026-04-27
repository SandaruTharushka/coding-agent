import * as fs from 'fs'
import * as path from 'path'
import { backupFiles } from './backupManager.js'
import { generateDiffSummary, type DiffSummary } from './diffPreview.js'
import { createSession, saveSession, type EditSession } from './editSession.js'

const PROJECT_ROOT = process.cwd()

const PROTECTED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
])

const PROTECTED_EXTENSIONS = new Set(['.pem', '.key', '.cert', '.p12', '.pfx'])

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

export interface FileChange {
  path: string
  action: 'create' | 'update' | 'delete'
  content?: string
}

export interface ApplyResult {
  success: boolean
  session: EditSession
  appliedFiles: string[]
  errors: string[]
  diffSummary: DiffSummary
}

function assertSafePath(filePath: string): void {
  // Block absolute paths that escape the project
  if (path.isAbsolute(filePath) && !filePath.startsWith(PROJECT_ROOT)) {
    throw new Error(`Blocked absolute path outside project: ${filePath}`)
  }
  // Block traversal sequences
  const normalized = path.normalize(filePath)
  if (normalized.startsWith('..') || normalized.includes(path.sep + '..')) {
    throw new Error(`Path traversal blocked: ${filePath}`)
  }
  // Ensure resolved path stays inside project
  const abs = path.resolve(filePath)
  if (!abs.startsWith(PROJECT_ROOT + path.sep) && abs !== PROJECT_ROOT) {
    throw new Error(`Path outside project root: ${filePath}`)
  }
}

function isProtected(filePath: string, allowProtected: boolean): boolean {
  if (allowProtected) return false
  const base = path.basename(filePath)
  if (PROTECTED_FILES.has(base)) return true
  if (base.startsWith('.env')) return true
  if (PROTECTED_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return true
  return false
}

function writeAtomic(filePath: string, content: string): void {
  const abs = path.resolve(filePath)
  const tmp = `${abs}.~tmp_${Date.now()}`
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  try {
    fs.writeFileSync(tmp, content, 'utf8')
    fs.renameSync(tmp, abs)
  } catch (err) {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    throw err
  }
}

export async function applyChanges(
  task: string,
  changes: FileChange[],
  opts: { dryRun?: boolean; allowProtected?: boolean; allowDelete?: boolean } = {},
): Promise<ApplyResult> {
  const session = createSession(task)
  const errors: string[] = []
  const appliedFiles: string[] = []

  // ── Validation pass (no writes yet) ──────────────────────────────────────────
  for (const change of changes) {
    try {
      assertSafePath(change.path)

      if (isProtected(change.path, opts.allowProtected ?? false)) {
        throw new Error(`Protected file — explicit permission required: ${change.path}`)
      }

      if (change.action === 'delete' && !opts.allowDelete) {
        throw new Error(`File deletion requires explicit --allow-delete flag: ${change.path}`)
      }

      if (
        change.content !== undefined &&
        Buffer.byteLength(change.content, 'utf8') > MAX_FILE_BYTES
      ) {
        throw new Error(
          `File exceeds size limit (${MAX_FILE_BYTES} bytes): ${change.path}`,
        )
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  if (errors.length > 0) {
    session.status = 'failed'
    saveSession(session)
    return {
      success: false,
      session,
      appliedFiles,
      errors,
      diffSummary: { totalFiles: 0, totalAdded: 0, totalRemoved: 0, records: [] },
    }
  }

  // ── Diff preview (before any writes) ─────────────────────────────────────────
  const diffSummary = generateDiffSummary(
    changes.map(c => ({ path: c.path, content: c.content, action: c.action })),
  )
  session.diffs = diffSummary.records
  session.status = 'previewed'
  saveSession(session)

  if (opts.dryRun) {
    return { success: true, session, appliedFiles: changes.map(c => c.path), errors, diffSummary }
  }

  // ── Backup existing files ─────────────────────────────────────────────────────
  const toBackup = changes
    .filter(c => c.action !== 'create')
    .map(c => c.path)
  const backupRecords = backupFiles(session.id, toBackup)
  session.backups = backupRecords
  saveSession(session)

  // ── Apply ─────────────────────────────────────────────────────────────────────
  for (const change of changes) {
    try {
      if (change.action === 'delete') {
        const abs = path.resolve(change.path)
        if (fs.existsSync(abs)) fs.unlinkSync(abs)
      } else {
        writeAtomic(change.path, change.content ?? '')
      }
      appliedFiles.push(change.path)
    } catch (e) {
      errors.push(`${change.path}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  session.changedFiles = appliedFiles
  session.status = errors.length === 0 ? 'applied' : 'failed'
  saveSession(session)

  return { success: errors.length === 0, session, appliedFiles, errors, diffSummary }
}
