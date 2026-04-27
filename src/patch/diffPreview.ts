import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import type { DiffRecord } from './editSession.js'

// Patterns that look like secrets — redact before showing diffs
const SECRET_PATTERNS: RegExp[] = [
  /(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret|password|passwd)\s*[:=]\s*['"]?([A-Za-z0-9+/=_\-]{16,})['"]?/gi,
  /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /xox[baprs]-[A-Za-z0-9\-]{10,}/g,
]

function maskSecrets(text: string): string {
  let out = text
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, match => {
      // keep the key name, redact the value portion
      const eqIdx = match.search(/[:=]/)
      return eqIdx !== -1
        ? match.slice(0, eqIdx + 1) + ' ***MASKED***'
        : '***MASKED***'
    })
  }
  return out
}

function countDiffLines(diff: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++
    else if (line.startsWith('-') && !line.startsWith('---')) removed++
  }
  return { added, removed }
}

export function generateDiff(filePath: string, newContent: string): DiffRecord {
  const abs = path.resolve(filePath)
  let raw: string

  if (!fs.existsSync(abs)) {
    const lines = newContent.split('\n')
    const body = lines.map(l => `+${l}`).join('\n')
    raw = `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n${body}`
  } else {
    const tmp = path.join('/tmp', `qwen_diff_${Date.now()}.tmp`)
    try {
      fs.writeFileSync(tmp, newContent, 'utf8')
      raw = execSync(`diff -u "${abs}" "${tmp}" || true`, {
        encoding: 'utf8',
        timeout: 10_000,
      })
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    }
  }

  const masked = maskSecrets(raw)
  const { added, removed } = countDiffLines(masked)
  return { filePath, diff: masked, addedLines: added, removedLines: removed }
}

export interface DiffSummary {
  totalFiles: number
  totalAdded: number
  totalRemoved: number
  records: DiffRecord[]
}

export function generateDiffSummary(
  changes: Array<{ path: string; content?: string; action: string }>,
): DiffSummary {
  const records: DiffRecord[] = []
  let totalAdded = 0
  let totalRemoved = 0

  for (const change of changes) {
    if (change.action === 'delete') {
      const abs = path.resolve(change.path)
      if (fs.existsSync(abs)) {
        const lines = fs.readFileSync(abs, 'utf8').split('\n')
        const rec: DiffRecord = {
          filePath: change.path,
          diff: lines.map(l => `-${l}`).join('\n'),
          addedLines: 0,
          removedLines: lines.length,
        }
        records.push(rec)
        totalRemoved += rec.removedLines
      }
      continue
    }

    if (change.content !== undefined) {
      const rec = generateDiff(change.path, change.content)
      records.push(rec)
      totalAdded += rec.addedLines
      totalRemoved += rec.removedLines
    }
  }

  return { totalFiles: records.length, totalAdded, totalRemoved, records }
}
