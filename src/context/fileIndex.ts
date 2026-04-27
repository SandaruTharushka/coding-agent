import * as fs from 'fs'
import * as path from 'path'
import type { ScannedFile } from './projectScanner.js'
import { maskSecrets } from './projectScanner.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileRecord {
  path: string
  relativePath: string
  extension: string
  language: string
  size: number
  lastModified: Date
  hash: string
  imports: string[]
  exports: string[]
  symbols: string[]
  keywords: string[]
  summary: string
}

export interface FileIndex {
  records: Map<string, FileRecord>
  builtAt: Date
}

// ─── Extractors ───────────────────────────────────────────────────────────────

function extractImports(content: string, ext: string): string[] {
  const imports: string[] = []

  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    const importRe = /(?:^|\n)\s*import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g
    let m: RegExpExecArray | null
    while ((m = importRe.exec(content)) !== null) imports.push(m[1])

    const requireRe = /require\(['"]([^'"]+)['"]\)/g
    while ((m = requireRe.exec(content)) !== null) imports.push(m[1])
  } else if (ext === '.py') {
    const pyRe = /^\s*(?:from\s+(\S+)\s+import|import\s+(\S+))/gm
    let m: RegExpExecArray | null
    while ((m = pyRe.exec(content)) !== null) imports.push(m[1] ?? m[2])
  }

  return [...new Set(imports)]
}

function extractExports(content: string, ext: string): string[] {
  const exports: string[] = []

  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    const namedRe =
      /(?:^|\n)\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
    let m: RegExpExecArray | null
    while ((m = namedRe.exec(content)) !== null) exports.push(m[1])

    const bracketRe = /export\s*\{([^}]+)\}/g
    while ((m = bracketRe.exec(content)) !== null) {
      const names = m[1]
        .split(',')
        .map(s => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean)
      exports.push(...names)
    }
  }

  return [...new Set(exports)]
}

function extractSymbols(content: string, ext: string): string[] {
  const symbols: string[] = []

  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    const re =
      /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) symbols.push(m[1])
  } else if (ext === '.py') {
    const re = /^(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/gm
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) symbols.push(m[1])
  }

  return [...new Set(symbols)]
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'they', 'will',
  'return', 'string', 'number', 'boolean', 'const', 'function',
  'import', 'export', 'async', 'await', 'interface', 'type',
  'class', 'extends', 'implements', 'null', 'undefined',
  'true', 'false', 'void', 'never', 'object', 'array',
])

function extractKeywords(content: string, relativePath: string): string[] {
  const pathParts = relativePath
    .replace(/\\/g, '/')
    .replace(/[._-]/g, ' ')
    .split(/[\s/]+/)
    .filter(p => p.length > 2)

  const freq = new Map<string, number>()
  const wordRe = /\b[a-zA-Z][a-zA-Z0-9]{3,}\b/g
  let m: RegExpExecArray | null
  while ((m = wordRe.exec(content)) !== null) {
    const lower = m[0].toLowerCase()
    freq.set(lower, (freq.get(lower) ?? 0) + 1)
  }

  const topWords = [...freq.entries()]
    .filter(([word, count]) => count >= 2 && !STOP_WORDS.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word)

  return [...new Set([...pathParts, ...topWords])]
}

function buildSummary(content: string, ext: string): string {
  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    const jsdoc = content.match(/\/\*\*[\s\S]*?\*\//)
    if (jsdoc) {
      const cleaned = jsdoc[0]
        .replace(/\/\*\*|\*\//g, '')
        .replace(/\s*\*\s?/gm, ' ')
        .trim()
      if (cleaned) return cleaned.slice(0, 200)
    }
    for (const line of content.split('\n').slice(0, 20)) {
      const m = line.match(/^\s*\/\/\s*(.+)/)
      if (m) return m[1].trim().slice(0, 200)
    }
  }

  if (ext === '.py') {
    const m = content.match(/^"""([\s\S]*?)"""/)
    if (m) return m[1].trim().slice(0, 200)
  }

  if (ext === '.md') {
    const m = content.match(/^#\s+(.+)/m)
    if (m) return m[1].trim().slice(0, 200)
  }

  for (const line of content.split('\n').slice(0, 10)) {
    const t = line.trim()
    if (t && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*')) {
      return t.slice(0, 200)
    }
  }

  return ''
}

// ─── Main exports ─────────────────────────────────────────────────────────────

export function buildFileIndex(files: ScannedFile[]): FileIndex {
  const records = new Map<string, FileRecord>()

  for (const file of files) {
    let raw = ''
    try {
      raw = fs.readFileSync(file.path, 'utf8')
    } catch {
      continue
    }

    const content = maskSecrets(raw)

    records.set(file.relativePath, {
      path: file.path,
      relativePath: file.relativePath,
      extension: file.extension,
      language: file.language,
      size: file.size,
      lastModified: file.lastModified,
      hash: file.hash,
      imports: extractImports(content, file.extension),
      exports: extractExports(content, file.extension),
      symbols: extractSymbols(content, file.extension),
      keywords: extractKeywords(content, file.relativePath),
      summary: buildSummary(content, file.extension),
    })
  }

  return { records, builtAt: new Date() }
}

export function searchIndex(index: FileIndex, query: string): FileRecord[] {
  const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 2)
  const scored: Array<{ record: FileRecord; score: number }> = []

  for (const record of index.records.values()) {
    const bag = [
      record.relativePath.toLowerCase(),
      ...record.symbols.map(s => s.toLowerCase()),
      ...record.exports.map(e => e.toLowerCase()),
      ...record.keywords,
      record.summary.toLowerCase(),
    ].join(' ')

    let score = 0
    for (const word of words) {
      if (bag.includes(word)) score++
    }
    if (score > 0) scored.push({ record, score })
  }

  return scored.sort((a, b) => b.score - a.score).map(r => r.record)
}
