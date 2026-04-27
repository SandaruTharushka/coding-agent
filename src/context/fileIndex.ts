import * as fs from 'fs'
import * as path from 'path'
import type { ScanResult } from './projectScanner.js'
import { maskContent } from './projectScanner.js'

export interface FileRecord {
  path: string
  relativePath: string
  extension: string
  language: string
  size: number
  lastModified: Date
  isConfig: boolean
  imports: string[]
  exports: string[]
  symbols: string[]
  keywords: string[]
  summary: string
}

export interface FileIndex {
  root: string
  records: Map<string, FileRecord>
  builtAt: Date
}

// ── Regex patterns ─────────────────────────────────────────────────────────────

const RE_IMPORT = /^import\s+.*?from\s+['"]([^'"]+)['"]/gm
const RE_REQUIRE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const RE_EXPORT_NAMED = /^export\s+(?:(?:default|const|let|var|function|class|async\s+function)\s+)([A-Za-z_$][A-Za-z0-9_$]*)/gm
const RE_EXPORT_TYPE = /^export\s+(?:type|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm
const RE_PY_IMPORT = /^(?:import|from)\s+([A-Za-z_][A-Za-z0-9_.]*)/gm
const RE_FUNC_TS = /(?:function\s+|(?:const|let|var)\s+)([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:=\s*(?:async\s*)?\(|<|\()/g
const RE_CLASS = /class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
const RE_INTERFACE = /interface\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
const RE_PY_DEF = /^(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/gm

function extractMatches(content: string, re: RegExp): string[] {
  const matches: string[] = []
  let m: RegExpExecArray | null
  const regex = new RegExp(re.source, re.flags)
  while ((m = regex.exec(content)) !== null) {
    if (m[1]) matches.push(m[1])
  }
  return matches
}

function extractImports(content: string, ext: string): string[] {
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    return [...extractMatches(content, RE_IMPORT), ...extractMatches(content, RE_REQUIRE)]
  }
  if (ext === '.py') return extractMatches(content, RE_PY_IMPORT)
  return []
}

function extractExports(content: string, ext: string): string[] {
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    return [...extractMatches(content, RE_EXPORT_NAMED), ...extractMatches(content, RE_EXPORT_TYPE)]
  }
  return []
}

function extractSymbols(content: string, ext: string): string[] {
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    return [
      ...extractMatches(content, RE_FUNC_TS),
      ...extractMatches(content, RE_CLASS),
      ...extractMatches(content, RE_INTERFACE),
    ]
  }
  if (ext === '.py') return extractMatches(content, RE_PY_DEF)
  return []
}

function extractKeywords(content: string, relativePath: string): string[] {
  const words = new Set<string>()
  relativePath.split(/[/\\.]/).forEach(p => { if (p.length > 2) words.add(p.toLowerCase()) })

  const identifiers = content.match(/\b[A-Za-z_][A-Za-z0-9_]{3,}\b/g) ?? []
  const freq = new Map<string, number>()
  for (const id of identifiers) {
    const key = id.toLowerCase()
    freq.set(key, (freq.get(key) ?? 0) + 1)
  }
  for (const [word, count] of freq) {
    if (count >= 2) words.add(word)
  }
  return [...words].slice(0, 60)
}

function buildSummary(
  content: string,
  relativePath: string,
  symbols: string[],
  exports: string[],
): string {
  const ext = path.extname(relativePath)
  const basename = path.basename(relativePath, ext)
  const lines = content.split('\n')

  const firstMeaningful = lines.find(l => {
    const t = l.trim()
    return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('#')
  }) ?? ''

  const parts: string[] = [`${basename}${ext}`]
  if (exports.length > 0) parts.push(`exports: ${exports.slice(0, 5).join(', ')}`)
  if (symbols.length > 0 && symbols.length !== exports.length) {
    parts.push(`defines: ${symbols.slice(0, 5).join(', ')}`)
  }
  if (firstMeaningful && !firstMeaningful.includes('import')) {
    parts.push(firstMeaningful.slice(0, 80))
  }
  return parts.join(' | ')
}

export function buildIndex(scan: ScanResult): FileIndex {
  const records = new Map<string, FileRecord>()

  for (const rec of scan.records) {
    let content: string
    try {
      content = fs.readFileSync(rec.path, 'utf8')
    } catch {
      continue
    }

    const safe = maskContent(content)
    const imports = extractImports(safe, rec.extension)
    const exports = extractExports(safe, rec.extension)
    const symbols = [...new Set([...extractSymbols(safe, rec.extension), ...exports])]
    const keywords = extractKeywords(safe, rec.relativePath)
    const summary = buildSummary(safe, rec.relativePath, symbols, exports)

    records.set(rec.relativePath, {
      path: rec.path,
      relativePath: rec.relativePath,
      extension: rec.extension,
      language: rec.language,
      size: rec.size,
      lastModified: rec.lastModified,
      isConfig: rec.isConfig,
      imports,
      exports,
      symbols,
      keywords,
      summary,
    })
  }

  return { root: scan.root, records, builtAt: new Date() }
}

export function getRecord(index: FileIndex, relativePath: string): FileRecord | undefined {
  return index.records.get(relativePath)
}
