import * as fs from 'fs'
import * as path from 'path'
import { hashFile } from './backupManager.js'
import {
  loadSession,
  getLatestAppliedSession,
  saveSession,
  type EditSession,
} from './editSession.js'

export interface RollbackResult {
  success: boolean
  sessionId: string
  task: string
  restoredFiles: string[]
  deletedFiles: string[]
  errors: string[]
  hashMismatches: string[]
}

export async function rollbackSession(sessionId?: string): Promise<RollbackResult> {
  const session: EditSession | null = sessionId
    ? loadSession(sessionId)
    : getLatestAppliedSession()

  const blankResult = (err: string): RollbackResult => ({
    success: false,
    sessionId: sessionId ?? 'unknown',
    task: '',
    restoredFiles: [],
    deletedFiles: [],
    errors: [err],
    hashMismatches: [],
  })

  if (!session) {
    return blankResult(
      sessionId
        ? `Session not found: ${sessionId}`
        : 'No applied session found to roll back',
    )
  }

  if (session.status === 'rolled_back') {
    return blankResult(`Session already rolled back: ${session.id}`)
  }

  if (session.status !== 'applied') {
    return blankResult(
      `Session status is '${session.status}' — only 'applied' sessions can be rolled back`,
    )
  }

  const restoredFiles: string[] = []
  const deletedFiles: string[] = []
  const errors: string[] = []
  const hashMismatches: string[] = []

  // ── Restore backed-up files ───────────────────────────────────────────────────
  for (const backup of session.backups) {
    try {
      const destAbs = path.resolve(backup.originalPath)
      if (!fs.existsSync(backup.backupPath)) {
        errors.push(`Backup missing for ${backup.originalPath}: ${backup.backupPath}`)
        continue
      }
      fs.mkdirSync(path.dirname(destAbs), { recursive: true })
      fs.copyFileSync(backup.backupPath, destAbs)

      const hashAfter = hashFile(destAbs)
      if (hashAfter !== backup.hashBefore) {
        hashMismatches.push(backup.originalPath)
      }
      restoredFiles.push(backup.originalPath)
    } catch (e) {
      errors.push(
        `Failed to restore ${backup.originalPath}: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  // ── Delete files that were newly created (no backup = created during session) ──
  const backedUpPaths = new Set(session.backups.map(b => b.originalPath))
  for (const created of session.changedFiles) {
    if (backedUpPaths.has(created)) continue
    try {
      const abs = path.resolve(created)
      if (fs.existsSync(abs)) {
        fs.unlinkSync(abs)
        deletedFiles.push(created)
      }
    } catch (e) {
      errors.push(
        `Failed to delete created file ${created}: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  session.status = 'rolled_back'
  saveSession(session)

  return {
    success: errors.length === 0,
    sessionId: session.id,
    task: session.task,
    restoredFiles,
    deletedFiles,
    errors,
    hashMismatches,
  }
}
