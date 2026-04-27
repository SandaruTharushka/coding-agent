import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import type { BackupRecord } from './editSession.js'

const PROJECT_ROOT = process.cwd()
const BACKUPS_BASE = path.join('.qwen-agent', 'backups')

export function hashFile(filePath: string): string {
  if (!fs.existsSync(filePath)) return ''
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

export function backupFile(sessionId: string, filePath: string): BackupRecord | null {
  const abs = path.resolve(filePath)
  if (!abs.startsWith(PROJECT_ROOT + path.sep) && abs !== PROJECT_ROOT) {
    throw new Error(`Cannot backup file outside project root: ${filePath}`)
  }
  if (!fs.existsSync(abs)) return null

  const relative = path.relative(PROJECT_ROOT, abs)
  const backupDest = path.join(BACKUPS_BASE, sessionId, relative)
  fs.mkdirSync(path.dirname(backupDest), { recursive: true })
  const hashBefore = hashFile(abs)
  fs.copyFileSync(abs, backupDest)

  return {
    originalPath: relative,
    backupPath: backupDest,
    hashBefore,
    timestamp: new Date().toISOString(),
  }
}

export function backupFiles(sessionId: string, filePaths: string[]): BackupRecord[] {
  const records: BackupRecord[] = []
  for (const fp of filePaths) {
    try {
      const rec = backupFile(sessionId, fp)
      if (rec) records.push(rec)
    } catch {
      // files that can't be backed up are skipped silently
    }
  }
  return records
}
