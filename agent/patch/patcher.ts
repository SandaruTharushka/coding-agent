import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import type { Plan, PatchResult } from '../types.js'
import { writeFile } from '../tools/file.tools.js'

const BACKUP_DIR = path.join('.agent', 'backups')
const PROJECT_ROOT = process.cwd()

function safeDelete(filePath: string): void {
  const abs = path.resolve(filePath)
  if (!abs.startsWith(PROJECT_ROOT + path.sep) && abs !== PROJECT_ROOT) {
    throw new Error(`Delete blocked — path escapes project root: ${filePath}`)
  }
  if (fs.existsSync(abs)) fs.unlinkSync(abs)
}

function ts(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

export function createBackup(files: string[]): string {
  const backupPath = path.join(BACKUP_DIR, ts())
  fs.mkdirSync(backupPath, { recursive: true })

  const backed: string[] = []
  for (const file of files) {
    const abs = path.resolve(file)
    if (!fs.existsSync(abs)) continue
    const dest = path.join(backupPath, file.replace(/[/\\]/g, '__'))
    fs.copyFileSync(abs, dest)
    backed.push(file)
  }

  fs.writeFileSync(
    path.join(backupPath, 'manifest.json'),
    JSON.stringify({ files: backed, timestamp: new Date().toISOString() }, null, 2),
    'utf8',
  )
  return backupPath
}

export function rollback(backupDir: string): string[] {
  const manifestPath = path.join(backupDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) throw new Error(`No manifest in backup dir: ${backupDir}`)
  const { files } = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { files: string[] }

  const restored: string[] = []
  for (const file of files) {
    const src = path.join(backupDir, file.replace(/[/\\]/g, '__'))
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.copyFileSync(src, file)
      restored.push(file)
    }
  }
  return restored
}

export function generateDiff(filePath: string, newContent: string): string {
  const abs = path.resolve(filePath)
  if (!fs.existsSync(abs)) {
    return (
      `--- /dev/null\n+++ ${filePath}\n` +
      newContent
        .split('\n')
        .map(l => `+${l}`)
        .join('\n')
    )
  }
  const tmp = `/tmp/agent_diff_${Date.now()}.tmp`
  try {
    fs.writeFileSync(tmp, newContent, 'utf8')
    return execSync(`diff -u "${abs}" "${tmp}" || true`, { encoding: 'utf8', timeout: 10_000 })
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
  }
}

export async function applyPlan(plan: Plan, dryRun = false): Promise<PatchResult> {
  const toBackup = plan.filesToChange
    .filter(f => f.action !== 'create')
    .map(f => f.path)

  const backupDir = createBackup(toBackup)
  const appliedFiles: string[] = []
  const errors: string[] = []

  for (const change of plan.filesToChange) {
    try {
      if (change.action === 'delete') {
        if (!dryRun) safeDelete(change.path)
        appliedFiles.push(change.path)
        continue
      }
      if (change.content) {
        if (!dryRun) writeFile(change.path, change.content)
        appliedFiles.push(change.path)
      }
    } catch (e) {
      errors.push(`${change.path}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { success: errors.length === 0, appliedFiles, errors, backupDir }
}
