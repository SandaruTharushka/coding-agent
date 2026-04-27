import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type { ScanResult } from './projectScanner.js'
import type { FileIndex, FileRecord } from './fileIndex.js'

const CACHE_DIR = '.qwen-agent'
const CACHE_FILE = path.join(CACHE_DIR, 'context-cache.json')
const CACHE_VERSION = 1

interface CachedFileRecord {
  relativePath: string
  hash: string
  size: number
  lastModified: string
  extension: string
  language: string
  isConfig: boolean
  imports: string[]
  exports: string[]
  symbols: string[]
  keywords: string[]
  summary: string
}

interface CacheData {
  version: number
  scannedAt: string
  root: string
  fileTree: string
  totalFiles: number
  languages: string[]
  files: CachedFileRecord[]
}

export interface CacheValidationResult {
  valid: boolean
  changedFiles: string[]
  missingFiles: string[]
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
  }
  const gitignore = path.join(CACHE_DIR, '.gitignore')
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(gitignore, '*\n', 'utf8')
  }
  // Also add .qwen-agent/ to root .gitignore if not already present
  const rootGitignore = '.gitignore'
  if (fs.existsSync(rootGitignore)) {
    const content = fs.readFileSync(rootGitignore, 'utf8')
    if (!content.includes('.qwen-agent')) {
      fs.appendFileSync(rootGitignore, '\n.qwen-agent/\n', 'utf8')
    }
  }
}

export function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
}

export function readCache(): CacheData | null {
  if (!fs.existsSync(CACHE_FILE)) return null
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as CacheData
    if (data.version !== CACHE_VERSION) return null
    return data
  } catch {
    return null
  }
}

export function writeCache(scan: ScanResult, index: FileIndex): void {
  ensureCacheDir()

  const files: CachedFileRecord[] = []
  for (const record of index.records.values()) {
    let hash = ''
    try {
      hash = computeHash(fs.readFileSync(record.path, 'utf8'))
    } catch { /* skip */ }

    files.push({
      relativePath: record.relativePath,
      hash,
      size: record.size,
      lastModified: record.lastModified.toISOString(),
      extension: record.extension,
      language: record.language,
      isConfig: record.isConfig,
      imports: record.imports,
      exports: record.exports,
      symbols: record.symbols,
      keywords: record.keywords,
      summary: record.summary,
    })
  }

  const data: CacheData = {
    version: CACHE_VERSION,
    scannedAt: scan.scannedAt.toISOString(),
    root: scan.root,
    fileTree: scan.fileTree,
    totalFiles: scan.totalFiles,
    languages: scan.languages,
    files,
  }

  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch { /* ignore write failures */ }
}

export function validateCache(cache: CacheData): CacheValidationResult {
  const changedFiles: string[] = []
  const missingFiles: string[] = []

  for (const cached of cache.files) {
    const fullPath = path.join(cache.root, cached.relativePath)
    if (!fs.existsSync(fullPath)) {
      missingFiles.push(cached.relativePath)
      continue
    }
    try {
      const hash = computeHash(fs.readFileSync(fullPath, 'utf8'))
      if (hash !== cached.hash) changedFiles.push(cached.relativePath)
    } catch {
      changedFiles.push(cached.relativePath)
    }
  }

  return { valid: changedFiles.length === 0 && missingFiles.length === 0, changedFiles, missingFiles }
}

export function rebuildIndexFromCache(cache: CacheData): FileIndex {
  const records = new Map<string, FileRecord>()

  for (const f of cache.files) {
    records.set(f.relativePath, {
      path: path.join(cache.root, f.relativePath),
      relativePath: f.relativePath,
      extension: f.extension,
      language: f.language,
      size: f.size,
      lastModified: new Date(f.lastModified),
      isConfig: f.isConfig,
      imports: f.imports,
      exports: f.exports,
      symbols: f.symbols,
      keywords: f.keywords,
      summary: f.summary,
    })
  }

  return { root: cache.root, records, builtAt: new Date(cache.scannedAt) }
}

export function clearCache(): void {
  if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE)
}

export type { CacheData, CachedFileRecord }
