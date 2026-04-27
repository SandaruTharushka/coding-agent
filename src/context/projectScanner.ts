import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { execSync } from 'child_process'

// ─── Denylist ─────────────────────────────────────────────────────────────────

/** Exact filenames that must never be included. */
const DENIED_FILENAMES = new Set(['.env', 'id_rsa', 'id_ed25519', 'id_dsa', 'id_ecdsa'])

/** Extensions that always indicate sensitive or binary content. */
const DENIED_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx', '.crt', '.cer'])

/** Patterns matching secret-like filenames (.env, .env.local, .env.production …). */
const DENIED_PATTERNS: RegExp[] = [/^\.env(\..+)?$/]

/** Simple secret pattern used to mask suspicious values encountered in text. */
const SECRET_PATTERN =
  /(?:api[_-]?key|secret|password|token|auth|bearer|private[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9+/=_\-]{8,}/gi

// ─── Ignore lists ─────────────────────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.agent',
  '.qwen-agent',
  '__pycache__',
  '.next',
  '.nuxt',
  'build',
  'coverage',
  '.cache',
  'vendor',
  '.venv',
  'venv',
  'env',
  'target',
  'out',
  '.turbo',
])

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3',
  '.zip', '.tar', '.gz', '.pdf', '.db', '.sqlite',
  '.bin', '.exe', '.dll', '.so', '.dylib',
  '.lock',
])

// ─── Language map ─────────────────────────────────────────────────────────────

export const LANG_MAP: Record<string, string> = {
  '.ts': 'TypeScript',   '.tsx': 'TypeScript/React',
  '.js': 'JavaScript',   '.jsx': 'JavaScript/React',
  '.py': 'Python',       '.go': 'Go',       '.rs': 'Rust',
  '.java': 'Java',       '.kt': 'Kotlin',   '.swift': 'Swift',
  '.rb': 'Ruby',         '.php': 'PHP',     '.cs': 'C#',
  '.cpp': 'C++',         '.c': 'C',         '.sh': 'Shell',
  '.yaml': 'YAML',       '.yml': 'YAML',    '.json': 'JSON',
  '.md': 'Markdown',     '.html': 'HTML',   '.css': 'CSS',
  '.scss': 'SCSS',       '.toml': 'TOML',   '.xml': 'XML',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScannedFile {
  path: string
  relativePath: string
  size: number
  extension: string
  lastModified: Date
  hash: string
  language: string
}

export interface ScanResult {
  root: string
  files: ScannedFile[]
  fileTree: string
  summary: string
  totalFiles: number
  languages: string[]
  packageJson?: Record<string, unknown>
  hasGit: boolean
  hasTsConfig: boolean
  scannedAt: Date
}

export interface ScanOptions {
  maxDepth?: number
  maxFileSizeBytes?: number
}

const DEFAULT_MAX_FILE_SIZE = 500 * 1024

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDenied(filename: string, ext: string): boolean {
  if (DENIED_FILENAMES.has(filename)) return true
  if (DENIED_EXTENSIONS.has(ext)) return true
  for (const pattern of DENIED_PATTERNS) {
    if (pattern.test(filename)) return true
  }
  return false
}

export function maskSecrets(text: string): string {
  return text.replace(SECRET_PATTERN, match => {
    const eqIdx = match.search(/[:=]/)
    return eqIdx === -1 ? match : match.slice(0, eqIdx + 1) + ' [REDACTED]'
  })
}

function computeHash(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath)
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
  } catch {
    return ''
  }
}

function walkDir(
  dir: string,
  root: string,
  depth: number,
  maxDepth: number,
  maxFileSize: number,
): ScannedFile[] {
  if (depth > maxDepth) return []
  const results: ScannedFile[] = []

  let items: fs.Dirent[]
  try {
    items = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const item of items) {
    if (item.isDirectory()) {
      if (IGNORED_DIRS.has(item.name) || item.name.startsWith('.')) continue
      results.push(...walkDir(path.join(dir, item.name), root, depth + 1, maxDepth, maxFileSize))
      continue
    }

    if (!item.isFile()) continue

    const ext = path.extname(item.name).toLowerCase()
    if (BINARY_EXTENSIONS.has(ext)) continue
    if (isDenied(item.name, ext)) continue

    const fullPath = path.join(dir, item.name)
    let stat: fs.Stats
    try {
      stat = fs.statSync(fullPath)
    } catch {
      continue
    }
    if (stat.size > maxFileSize) continue

    results.push({
      path: fullPath,
      relativePath: path.relative(root, fullPath),
      size: stat.size,
      extension: ext,
      lastModified: stat.mtime,
      hash: computeHash(fullPath),
      language: LANG_MAP[ext] ?? 'Unknown',
    })
  }

  return results
}

function buildFileTree(files: ScannedFile[], root: string): string {
  const dirMap = new Map<string, string[]>()
  for (const file of files) {
    const dir = path.dirname(file.relativePath)
    if (!dirMap.has(dir)) dirMap.set(dir, [])
    dirMap.get(dir)!.push(path.basename(file.relativePath))
  }

  const lines: string[] = [path.basename(root) + '/']
  const dirs = [...dirMap.keys()].sort()
  for (const dir of dirs) {
    const fileNames = dirMap.get(dir)!.sort()
    if (dir === '.') {
      for (const f of fileNames) lines.push(`├── ${f}`)
    } else {
      lines.push(`├── ${dir}/`)
      for (const f of fileNames) lines.push(`│   ├── ${f}`)
    }
  }
  return lines.join('\n')
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function scanProject(options: ScanOptions = {}): Promise<ScanResult> {
  const root = process.cwd()
  const maxDepth = options.maxDepth ?? 5
  const maxFileSize = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE

  const files = walkDir(root, root, 0, maxDepth, maxFileSize)
  const extensions = [...new Set(files.map(f => f.extension))]
  const languages = [...new Set(extensions.map(e => LANG_MAP[e]).filter(Boolean))]

  let packageJson: Record<string, unknown> | undefined
  const pkgPath = path.join(root, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    } catch { /* ignore */ }
  }

  const hasGit = fs.existsSync(path.join(root, '.git'))
  const hasTsConfig = files.some(f => f.relativePath.includes('tsconfig'))

  let gitLine = ''
  if (hasGit) {
    try {
      const branch = execSync('git branch --show-current', { encoding: 'utf8', timeout: 5000 }).trim()
      const changed = execSync('git status --short', { encoding: 'utf8', timeout: 5000 })
        .split('\n').filter(Boolean).length
      gitLine = `\nBranch: ${branch}, ${changed} uncommitted change(s)`
    } catch { /* ignore */ }
  }

  const summary = [
    `Project: ${(packageJson?.name as string | undefined) ?? path.basename(root)}`,
    `Root: ${root}`,
    `Files: ${files.length}`,
    `Languages: ${languages.join(', ') || 'unknown'}`,
    (packageJson?.description as string | undefined)
      ? `Description: ${packageJson!.description as string}`
      : '',
    gitLine,
  ]
    .filter(Boolean)
    .join('\n')

  return {
    root,
    files,
    fileTree: buildFileTree(files, root),
    summary,
    totalFiles: files.length,
    languages,
    packageJson,
    hasGit,
    hasTsConfig,
    scannedAt: new Date(),
  }
}
