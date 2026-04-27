import * as fs from 'fs'
import * as path from 'path'
import type { ScannedFile } from './projectScanner.js'

// ─── Paths ────────────────────────────────────────────────────────────────────

const CACHE_DIR = '.qwen-agent'
const CACHE_FILE = path.join(CACHE_DIR, 'context-cache.json')
const GITIGNORE_FILE = path.join(CACHE_DIR, '.gitignore')

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CacheEntry {
  relativePath: string
  hash: string
  size: number
  lastModified: string
  summary?: string
}

export interface ContextCache {
  version: number
  scannedAt: string
  projectRoot: string
  entries: Record<string, CacheEntry>
}

const CACHE_VERSION = 1

/** Config files whose hash change invalidates the entire cache. */
const CONFIG_FILENAMES = new Set(['package.json', 'tsconfig.json', 'tsconfig.qwen.json'])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
  }
  // Ignore everything inside .qwen-agent/
  if (!fs.existsSync(GITIGNORE_FILE)) {
    fs.writeFileSync(GITIGNORE_FILE, '*\n', 'utf8')
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function readCache(): ContextCache | null {
  if (!fs.existsSync(CACHE_FILE)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as ContextCache
    if (parsed.version !== CACHE_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function writeCache(files: ScannedFile[], summaries?: Map<string, string>): void {
  ensureCacheDir()

  const entries: Record<string, CacheEntry> = {}
  for (const file of files) {
    entries[file.relativePath] = {
      relativePath: file.relativePath,
      hash: file.hash,
      size: file.size,
      lastModified: file.lastModified.toISOString(),
      summary: summaries?.get(file.relativePath),
    }
  }

  const cache: ContextCache = {
    version: CACHE_VERSION,
    scannedAt: new Date().toISOString(),
    projectRoot: process.cwd(),
    entries,
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8')
}

/**
 * Returns true if the cache is still valid for the given file list.
 * Invalidated when:
 *  - project root changed
 *  - any config file hash changed
 *  - cache version mismatch
 */
export function isCacheValid(cache: ContextCache, files: ScannedFile[]): boolean {
  if (cache.version !== CACHE_VERSION) return false
  if (cache.projectRoot !== process.cwd()) return false

  for (const file of files) {
    const basename = path.basename(file.relativePath)
    if (CONFIG_FILENAMES.has(basename)) {
      const cached = cache.entries[file.relativePath]
      if (!cached || cached.hash !== file.hash) return false
    }
  }

  return true
}

export function getCachedSummary(cache: ContextCache, relativePath: string): string | undefined {
  return cache.entries[relativePath]?.summary
}

export function invalidateCache(): void {
  if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE)
}
