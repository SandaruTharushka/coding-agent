import * as path from 'path'
import type { FileIndex, FileRecord } from './fileIndex.js'

// ── Config ─────────────────────────────────────────────────────────────────────

const CONFIG_FILES = new Set([
  'package.json', 'tsconfig.json', 'tsconfig.qwen.json',
  '.eslintrc', '.eslintrc.json', '.prettierrc', 'vite.config.ts',
  'vite.config.js', 'jest.config.ts', 'jest.config.js',
  'next.config.js', 'Makefile', 'Dockerfile', '.gitignore',
])

const ENTRY_PATTERNS = ['index', 'main', 'cli', 'app', 'server', 'entry']

export interface ScoredFile {
  path: string
  relativePath: string
  score: number
  reasons: string[]
}

export interface SelectorOptions {
  maxFiles?: number
  includeConfigs?: boolean
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreRecord(record: FileRecord, taskWords: string[]): ScoredFile {
  let score = 0
  const reasons: string[] = []

  const basename = path.basename(record.relativePath).toLowerCase()
  const dirParts = path.dirname(record.relativePath).toLowerCase().split(/[/\\]/)

  // Filename match
  for (const word of taskWords) {
    if (basename.includes(word)) {
      score += 15
      reasons.push(`filename matches "${word}"`)
      break
    }
  }

  // Folder match
  for (const word of taskWords) {
    if (dirParts.some(p => p.includes(word))) {
      score += 8
      reasons.push(`folder matches "${word}"`)
      break
    }
  }

  // Export match
  const exportsLower = record.exports.map(e => e.toLowerCase())
  for (const word of taskWords) {
    if (exportsLower.some(e => e.includes(word))) {
      score += 12
      reasons.push(`export matches "${word}"`)
      break
    }
  }

  // Symbol match
  const symbolsLower = record.symbols.map(s => s.toLowerCase())
  for (const word of taskWords) {
    if (symbolsLower.some(s => s.includes(word))) {
      score += 10
      reasons.push(`symbol matches "${word}"`)
      break
    }
  }

  // Keyword match
  for (const word of taskWords) {
    if (record.keywords.includes(word)) {
      score += 6
      reasons.push(`keyword matches "${word}"`)
      break
    }
  }

  // Summary match
  const summaryLower = record.summary.toLowerCase()
  for (const word of taskWords) {
    if (summaryLower.includes(word)) {
      score += 5
      reasons.push(`summary matches "${word}"`)
      break
    }
  }

  // Import relation
  for (const word of taskWords) {
    if (record.imports.some(imp => imp.toLowerCase().includes(word))) {
      score += 7
      reasons.push(`imports match "${word}"`)
      break
    }
  }

  // Recency boost (recently modified files are likely more relevant)
  const ageMs = Date.now() - record.lastModified.getTime()
  if (ageMs < 3_600_000) {
    score += 20
    reasons.push('modified in last hour')
  } else if (ageMs < 86_400_000) {
    score += 10
    reasons.push('modified in last 24h')
  } else if (ageMs < 7 * 86_400_000) {
    score += 3
    reasons.push('modified this week')
  }

  // Entry file bonus
  if (ENTRY_PATTERNS.some(p => basename === p || basename.startsWith(p))) {
    score += 6
    reasons.push('entry/main file')
  }

  // Source code preference
  if (['.ts', '.js', '.py', '.go', '.rs'].includes(record.extension)) {
    score += 3
  }

  return { path: record.path, relativePath: record.relativePath, score, reasons: [...new Set(reasons)] }
}

// ── Main exports ───────────────────────────────────────────────────────────────

/**
 * Select and rank files from the index that are relevant to the given task.
 * Returns files sorted descending by score. Config files are always included
 * unless explicitly disabled.
 */
export function selectRelevantFiles(
  task: string,
  index: FileIndex,
  options: SelectorOptions = {},
): ScoredFile[] {
  const maxFiles = options.maxFiles ?? 30
  const taskWords = task.toLowerCase().split(/\W+/).filter(w => w.length > 2)

  const scoreMap = new Map<string, ScoredFile>()

  for (const record of index.records.values()) {
    const scored = scoreRecord(record, taskWords)
    if (scored.score > 0) {
      scoreMap.set(record.relativePath, scored)
    }
  }

  // Always include config files
  if (options.includeConfigs !== false) {
    for (const record of index.records.values()) {
      const basename = path.basename(record.relativePath)
      if (CONFIG_FILES.has(basename)) {
        const existing = scoreMap.get(record.relativePath)
        if (existing) {
          existing.score += 5
          existing.reasons = [...new Set([...existing.reasons, 'project config file'])]
        } else {
          scoreMap.set(record.relativePath, {
            path: record.path,
            relativePath: record.relativePath,
            score: 5,
            reasons: ['project config file'],
          })
        }
      }
    }
  }

  return [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)
}

/**
 * Find files related to a specific target by import/export relationships
 * and directory proximity.
 */
export function getRelatedFiles(
  targetRelativePath: string,
  index: FileIndex,
  maxResults = 5,
): ScoredFile[] {
  const target = index.records.get(targetRelativePath)
  if (!target) return []

  const targetBasename = path.basename(targetRelativePath, target.extension)
  const results: ScoredFile[] = []

  for (const record of index.records.values()) {
    if (record.relativePath === targetRelativePath) continue

    let score = 0
    const reasons: string[] = []
    const recBasename = path.basename(record.relativePath, record.extension)

    if (record.imports.some(imp => imp.includes(targetBasename))) {
      score += 15
      reasons.push(`imports ${targetBasename}`)
    }
    if (target.imports.some(imp => imp.includes(recBasename))) {
      score += 15
      reasons.push(`imported by ${path.basename(targetRelativePath)}`)
    }
    if (path.dirname(record.relativePath) === path.dirname(targetRelativePath)) {
      score += 5
      reasons.push('same directory')
    }

    if (score > 0) {
      results.push({ path: record.path, relativePath: record.relativePath, score, reasons })
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults)
}
