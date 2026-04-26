import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

const ROOT = process.cwd()

function resolveSafe(filePath: string): string {
  const abs = path.resolve(ROOT, filePath)
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
    throw new Error(`Path escape rejected: "${filePath}" resolves outside project root`)
  }
  return abs
}

export function readFile(filePath: string, offset?: number, limit?: number): string {
  const abs = resolveSafe(filePath)
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${filePath}`)
  const lines = fs.readFileSync(abs, 'utf8').split('\n')
  const start = Math.max(0, (offset ?? 1) - 1)
  const end = limit != null ? start + limit : lines.length
  return lines
    .slice(start, end)
    .map((l, i) => `${start + i + 1}\t${l}`)
    .join('\n')
}

export function writeFile(filePath: string, content: string): string {
  const abs = resolveSafe(filePath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
  return `Written ${fs.statSync(abs).size} bytes to ${filePath}`
}

export function editFile(filePath: string, oldString: string, newString: string): string {
  const abs = resolveSafe(filePath)
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
  const includeFlag = include ? `--include="${include}"` : ''
  try {
    const result = execSync(
      `grep -rn ${includeFlag} --line-number -m 100 "${pattern.replace(/"/g, '\\"')}" "${searchDir}" 2>/dev/null | head -100`,
      { encoding: 'utf8', timeout: 15_000 },
    )
    return result || '(no matches)'
  } catch (e: unknown) {
    const err = e as { status?: number }
    if (err.status === 1) return '(no matches)'
    throw e
  }
}

export function listFiles(dir?: string, recursive = false, pattern?: string): string {
  const searchDir = dir ? resolveSafe(dir) : ROOT
  if (!fs.existsSync(searchDir)) throw new Error(`Directory not found: ${dir ?? '.'}`)
  const depth = recursive ? '10' : '1'
  const nameFlag = pattern ? `-name "${pattern}"` : ''
  return execSync(
    `find "${searchDir}" -maxdepth ${depth} ${nameFlag} | grep -v node_modules | grep -v \\.git | sort | head -200`,
    { encoding: 'utf8', timeout: 10_000 },
  )
}
