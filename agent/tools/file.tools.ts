import * as fs from 'fs'
import * as path from 'path'
import { spawnSync } from 'child_process'

const ROOT = process.cwd()

// Files that must never be read or written by the agent
const PROTECTED_BASENAMES = new Set([
  '.env', '.env.local', '.env.production', '.env.staging', '.env.development',
  'id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa',
])
const PROTECTED_EXTENSIONS = new Set(['.pem', '.key', '.cert', '.p12', '.pfx', '.der', '.crt'])
const PROTECTED_BASENAME_PREFIX = ['.env.']

// Max bytes for a file to be sent to the LLM (10 MB)
const MAX_READ_BYTES = 10 * 1024 * 1024

// Patterns whose values should be masked in file read output
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
      const eqIdx = match.search(/[:=]/)
      return eqIdx !== -1 ? match.slice(0, eqIdx + 1) + ' ***MASKED***' : '***MASKED***'
    })
  }
  return out
}

function resolveSafe(filePath: string): string {
  const abs = path.resolve(ROOT, filePath)
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
    throw new Error(`Path escape rejected: "${filePath}" resolves outside project root`)
  }
  return abs
}

function assertNotProtected(filePath: string): void {
  const base = path.basename(filePath)
  const ext = path.extname(filePath).toLowerCase()

  if (PROTECTED_BASENAMES.has(base)) {
    throw new Error(`Access denied: "${base}" is a protected file`)
  }
  if (PROTECTED_BASENAME_PREFIX.some(p => base.startsWith(p))) {
    throw new Error(`Access denied: "${base}" matches a protected .env pattern`)
  }
  if (PROTECTED_EXTENSIONS.has(ext)) {
    throw new Error(`Access denied: "${ext}" files (keys/certs) are protected`)
  }
}

function isBinary(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, 512)
  for (let i = 0; i < limit; i++) {
    if (buffer[i] === 0) return true
  }
  return false
}

export function readFile(filePath: string, offset?: number, limit?: number): string {
  const abs = resolveSafe(filePath)
  assertNotProtected(filePath)

  if (!fs.existsSync(abs)) throw new Error(`File not found: ${filePath}`)

  const stat = fs.statSync(abs)
  if (stat.size > MAX_READ_BYTES) {
    throw new Error(
      `File too large to read (${stat.size} bytes > ${MAX_READ_BYTES} limit): ${filePath}`,
    )
  }

  const raw = fs.readFileSync(abs)
  if (isBinary(raw)) {
    throw new Error(`Binary file detected — will not send to LLM: ${filePath}`)
  }

  const text = raw.toString('utf8')
  const lines = text.split('\n')
  const start = Math.max(0, (offset ?? 1) - 1)
  const end = limit != null ? start + limit : lines.length
  const slice = lines.slice(start, end).map((l, i) => `${start + i + 1}\t${l}`).join('\n')
  return maskSecrets(slice)
}

export function writeFile(filePath: string, content: string): string {
  const abs = resolveSafe(filePath)
  assertNotProtected(filePath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
  return `Written ${fs.statSync(abs).size} bytes to ${filePath}`
}

export function editFile(filePath: string, oldString: string, newString: string): string {
  const abs = resolveSafe(filePath)
  assertNotProtected(filePath)
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${filePath}`)
  const content = fs.readFileSync(abs, 'utf8')
  if (!content.includes(oldString)) {
    throw new Error(`old_string not found in ${filePath} — read the file to get exact content`)
  }
  const count = content.split(oldString).length - 1
  if (count > 1) {
    throw new Error(`old_string found ${count} times in ${filePath} — provide more context`)
  }
  fs.writeFileSync(abs, content.replace(oldString, newString), 'utf8')
  return `Edited ${filePath} (1 replacement)`
}

export function searchFile(pattern: string, dir?: string, include?: string): string {
  const searchDir = dir ? resolveSafe(dir) : ROOT

  // Build args without shell interpolation (avoids injection)
  const args: string[] = ['-rn', '--line-number', '-m', '100']
  if (include) args.push(`--include=${include}`)
  args.push('--', pattern, searchDir)

  const proc = spawnSync('grep', args, { encoding: 'utf8', timeout: 15_000 })
  if (proc.error) throw proc.error
  if (proc.status === 1) return '(no matches)'
  if (proc.status !== 0) throw new Error(`grep exited ${proc.status}: ${proc.stderr}`)

  const lines = (proc.stdout ?? '').split('\n').slice(0, 100)
  return lines.join('\n') || '(no matches)'
}

export function listFiles(dir?: string, recursive = false, pattern?: string): string {
  const searchDir = dir ? resolveSafe(dir) : ROOT
  if (!fs.existsSync(searchDir)) throw new Error(`Directory not found: ${dir ?? '.'}`)

  const depth = recursive ? '10' : '1'
  const args: string[] = [searchDir, '-maxdepth', depth]
  if (pattern) args.push('-name', pattern)

  const proc = spawnSync('find', args, { encoding: 'utf8', timeout: 10_000 })
  if (proc.error) throw proc.error

  const lines = (proc.stdout ?? '')
    .split('\n')
    .filter(l => !/node_modules|\/\.git/.test(l))
    .sort()
    .slice(0, 200)
  return lines.join('\n')
}
