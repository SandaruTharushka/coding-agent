import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import type { FileEntry, ProjectContext } from '../types.js'

const IGNORED_DIRS = new Set([
  'node_modules', 'dist', '.git', '.agent', '__pycache__',
  '.next', '.nuxt', 'build', 'coverage', '.cache', 'vendor',
  '.venv', 'venv', 'env', 'target', 'out', '.turbo',
])

const IGNORED_EXTENSIONS = new Set([
  '.lock', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.zip',
  '.tar', '.gz', '.pdf', '.db', '.sqlite', '.bin', '.exe',
])

const MAX_FILE_SIZE = 500 * 1024

const LANG_MAP: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript/React',
  '.js': 'JavaScript', '.jsx': 'JavaScript/React',
  '.py': 'Python', '.go': 'Go', '.rs': 'Rust',
  '.java': 'Java', '.kt': 'Kotlin', '.swift': 'Swift',
  '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#',
  '.cpp': 'C++', '.c': 'C', '.sh': 'Shell',
  '.yaml': 'YAML', '.yml': 'YAML', '.json': 'JSON',
  '.md': 'Markdown', '.html': 'HTML', '.css': 'CSS',
  '.scss': 'SCSS',
}

function walkDir(dir: string, root: string, depth: number, maxDepth: number): FileEntry[] {
  if (depth > maxDepth) return []
  const entries: FileEntry[] = []
  let items: fs.Dirent[]
  try {
    items = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const item of items) {
    if (item.isDirectory()) {
      if (IGNORED_DIRS.has(item.name) || item.name.startsWith('.')) continue
      entries.push(...walkDir(path.join(dir, item.name), root, depth + 1, maxDepth))
      continue
    }
    if (!item.isFile()) continue

    const ext = path.extname(item.name).toLowerCase()
    if (IGNORED_EXTENSIONS.has(ext)) continue

    const fullPath = path.join(dir, item.name)
    let stat: fs.Stats
    try {
      stat = fs.statSync(fullPath)
    } catch {
      continue
    }
    if (stat.size > MAX_FILE_SIZE) continue

    entries.push({
      path: fullPath,
      relativePath: path.relative(root, fullPath),
      size: stat.size,
      extension: ext,
      modified: stat.mtime.toISOString(),
    })
  }
  return entries
}

function buildTree(files: FileEntry[], root: string): string {
  const dirMap = new Map<string, string[]>()
  for (const file of files) {
    const dir = path.dirname(file.relativePath)
    if (!dirMap.has(dir)) dirMap.set(dir, [])
    dirMap.get(dir)!.push(path.basename(file.relativePath))
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

export async function scanProject(maxDepth = 5): Promise<ProjectContext> {
  const root = process.cwd()
  const files = walkDir(root, root, 0, maxDepth)
  const extensions = [...new Set(files.map(f => f.extension))]
  const languages = [...new Set(extensions.map(e => LANG_MAP[e]).filter(Boolean))]

  let packageJson: Record<string, unknown> | undefined
  const pkgPath = path.join(root, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
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
    fileTree: buildTree(files, root),
    files,
    summary,
    totalFiles: files.length,
    languages,
    packageJson,
    hasGit,
    hasTsConfig,
  }
}
