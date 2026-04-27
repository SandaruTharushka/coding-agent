import * as fs from 'fs'
import * as path from 'path'

const IGNORED_DIRS = new Set([
  'node_modules', 'dist', '.git', '.agent', '.qwen-agent',
  '__pycache__', '.next', '.nuxt', 'build', 'coverage',
  '.cache', 'vendor', '.venv', 'venv', 'env', 'target',
  'out', '.turbo', '.svelte-kit', '.parcel-cache',
])

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.tiff',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.mp3', '.wav', '.ogg', '.avi', '.mov', '.mkv',
  '.zip', '.tar', '.gz', '.bz2', '.rar', '.7z', '.xz',
  '.pdf', '.db', '.sqlite', '.bin', '.exe', '.dll', '.so',
  '.class', '.pyc', '.o', '.obj', '.a', '.lib', '.wasm',
  '.lock',
])

const DENIED_FILENAMES = new Set([
  '.env', '.env.local', '.env.production', '.env.staging',
  '.env.development', '.env.test',
  'id_rsa', 'id_ed25519', 'id_dsa', 'id_ecdsa',
  '.htpasswd', 'credentials',
])

const DENIED_EXTENSIONS = new Set([
  '.pem', '.key', '.crt', '.cer', '.p12', '.pfx', '.p8', '.asc',
])

const MAX_FILE_SIZE_DEFAULT = 500 * 1024

const LANG_MAP: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript/React',
  '.js': 'JavaScript', '.jsx': 'JavaScript/React',
  '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.py': 'Python', '.go': 'Go', '.rs': 'Rust',
  '.java': 'Java', '.kt': 'Kotlin', '.swift': 'Swift',
  '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#',
  '.cpp': 'C++', '.c': 'C', '.sh': 'Shell', '.bash': 'Shell',
  '.yaml': 'YAML', '.yml': 'YAML', '.json': 'JSON',
  '.toml': 'TOML', '.md': 'Markdown', '.html': 'HTML',
  '.css': 'CSS', '.scss': 'SCSS', '.less': 'Less',
  '.graphql': 'GraphQL', '.proto': 'Protobuf',
  '.sql': 'SQL', '.lua': 'Lua', '.dart': 'Dart',
}

const CONFIG_NAMES = new Set([
  'package.json', 'tsconfig.json', 'tsconfig.qwen.json',
  '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.prettierrc', '.prettierrc.json',
  'vite.config.ts', 'vite.config.js',
  'webpack.config.js', 'rollup.config.js',
  'jest.config.ts', 'jest.config.js',
  'next.config.js', 'next.config.ts',
  '.babelrc', 'babel.config.js',
  'pyproject.toml', 'setup.py', 'Cargo.toml',
  'go.mod', 'go.sum', 'Makefile', 'Dockerfile',
  '.dockerignore', '.gitignore',
])

export interface ScanRecord {
  path: string
  relativePath: string
  size: number
  extension: string
  language: string
  lastModified: Date
  isConfig: boolean
}

export interface ScanResult {
  root: string
  records: ScanRecord[]
  fileTree: string
  scannedAt: Date
  totalFiles: number
  languages: string[]
}

export interface ScanOptions {
  maxDepth?: number
  maxFileSizeBytes?: number
  root?: string
}

export function isSafeFile(filePath: string, root: string): boolean {
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(path.resolve(root))) return false

  const basename = path.basename(filePath)
  if (DENIED_FILENAMES.has(basename)) return false

  const ext = path.extname(filePath).toLowerCase()
  if (DENIED_EXTENSIONS.has(ext)) return false

  if (/(?:secrets?|private|credentials?)[\\/]/i.test(filePath)) return false

  return true
}

export function maskContent(content: string): string {
  return content.replace(
    /((?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|ACCESS_KEY)\s*=\s*)["']?([A-Za-z0-9+/=_\-]{16,})["']?/gi,
    '$1[MASKED]',
  )
}

function walkDir(
  dir: string,
  root: string,
  depth: number,
  maxDepth: number,
  maxFileSize: number,
): ScanRecord[] {
  if (depth > maxDepth) return []

  const records: ScanRecord[] = []
  let items: fs.Dirent[]
  try {
    items = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const item of items) {
    const fullPath = path.join(dir, item.name)

    if (item.isDirectory()) {
      if (IGNORED_DIRS.has(item.name) || item.name.startsWith('.')) continue
      records.push(...walkDir(fullPath, root, depth + 1, maxDepth, maxFileSize))
      continue
    }

    if (!item.isFile()) continue

    const ext = path.extname(item.name).toLowerCase()
    if (BINARY_EXTENSIONS.has(ext)) continue
    if (!isSafeFile(fullPath, root)) continue

    let stat: fs.Stats
    try {
      stat = fs.statSync(fullPath)
    } catch {
      continue
    }
    if (stat.size > maxFileSize) continue

    const relativePath = path.relative(root, fullPath)
    records.push({
      path: fullPath,
      relativePath,
      size: stat.size,
      extension: ext,
      language: LANG_MAP[ext] ?? 'Unknown',
      lastModified: stat.mtime,
      isConfig: CONFIG_NAMES.has(item.name),
    })
  }

  return records
}

function buildFileTree(records: ScanRecord[], root: string): string {
  const dirMap = new Map<string, string[]>()
  for (const rec of records) {
    const dir = path.dirname(rec.relativePath)
    if (!dirMap.has(dir)) dirMap.set(dir, [])
    dirMap.get(dir)!.push(path.basename(rec.relativePath))
  }

  const lines: string[] = [path.basename(root) + '/']
  const dirs = [...dirMap.keys()].sort()
  for (const dir of dirs) {
    const files = dirMap.get(dir)!.sort()
    if (dir === '.') {
      for (const f of files) lines.push(`├── ${f}`)
    } else {
      lines.push(`├── ${dir}/`)
      for (const f of files) lines.push(`│   ├── ${f}`)
    }
  }
  return lines.join('\n')
}

export async function scanProjectFiles(options: ScanOptions = {}): Promise<ScanResult> {
  const root = path.resolve(options.root ?? process.cwd())
  const maxDepth = options.maxDepth ?? 8
  const maxFileSize = options.maxFileSizeBytes ?? MAX_FILE_SIZE_DEFAULT

  const records = walkDir(root, root, 0, maxDepth, maxFileSize)
  const languages = [...new Set(records.map(r => r.language).filter(l => l !== 'Unknown'))]
  const fileTree = buildFileTree(records, root)

  return {
    root,
    records,
    fileTree,
    scannedAt: new Date(),
    totalFiles: records.length,
    languages,
  }
}
