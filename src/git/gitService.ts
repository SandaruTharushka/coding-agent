import { execSync } from 'child_process'

export interface ChangedFile {
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'unknown'
  path: string
  oldPath?: string
}

export interface GitResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
}

function run(command: string, cwd?: string): GitResult {
  try {
    const stdout = execSync(command, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { success: true, stdout, stderr: '', exitCode: 0 }
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number; message?: string }
    return {
      success: false,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message ?? String(e),
      exitCode: err.status ?? 1,
    }
  }
}

export function isGitRepo(cwd?: string): boolean {
  return run('git rev-parse --git-dir', cwd).success
}

export function getCurrentBranch(cwd?: string): string {
  const result = run('git rev-parse --abbrev-ref HEAD', cwd)
  return result.success ? result.stdout.trim() : 'unknown'
}

export function getStatus(cwd?: string): string {
  const result = run('git status --short', cwd)
  return result.success ? result.stdout : ''
}

export function getChangedFiles(cwd?: string): ChangedFile[] {
  const staged = run('git diff --cached --name-status', cwd)
  const unstaged = run('git diff --name-status', cwd)
  const untracked = run('git ls-files --others --exclude-standard', cwd)

  const files: ChangedFile[] = []
  const seen = new Set<string>()

  function parseStatusLine(line: string): ChangedFile | null {
    const parts = line.split('\t')
    if (parts.length < 2) return null
    const code = parts[0].trim()
    const path = parts[parts.length - 1].trim()
    const oldPath = parts.length === 3 ? parts[1].trim() : undefined

    let status: ChangedFile['status']
    switch (code[0]) {
      case 'A': status = 'added'; break
      case 'M': status = 'modified'; break
      case 'D': status = 'deleted'; break
      case 'R': status = 'renamed'; break
      case 'C': status = 'copied'; break
      default: status = 'unknown'
    }
    return { status, path, oldPath }
  }

  for (const raw of [staged.stdout, unstaged.stdout]) {
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      const f = parseStatusLine(line)
      if (f && !seen.has(f.path)) {
        seen.add(f.path)
        files.push(f)
      }
    }
  }

  for (const line of untracked.stdout.split('\n')) {
    const path = line.trim()
    if (path && !seen.has(path)) {
      seen.add(path)
      files.push({ status: 'untracked', path })
    }
  }

  return files
}

export function getDiffSummary(cwd?: string): string {
  const staged = run('git diff --cached --stat', cwd)
  const unstaged = run('git diff --stat', cwd)
  const parts: string[] = []
  if (staged.stdout.trim()) parts.push('Staged:\n' + staged.stdout)
  if (unstaged.stdout.trim()) parts.push('Unstaged:\n' + unstaged.stdout)
  return parts.join('\n')
}

export function getFullDiff(cwd?: string): string {
  const staged = run('git diff --cached', cwd)
  const unstaged = run('git diff', cwd)
  return [staged.stdout, unstaged.stdout].filter(Boolean).join('\n')
}

export function stageFiles(files: string[], cwd?: string): GitResult {
  if (files.length === 0) return run('git add -A', cwd)
  const paths = files.map(f => JSON.stringify(f)).join(' ')
  return run(`git add ${paths}`, cwd)
}

export function commit(message: string, cwd?: string): GitResult {
  return run(`git commit -m ${JSON.stringify(message)}`, cwd)
}

export function push(remote = 'origin', branch?: string, cwd?: string): GitResult {
  const target = branch ?? getCurrentBranch(cwd)
  return run(`git push -u ${remote} ${target}`, cwd)
}

export function hasUncommittedChanges(cwd?: string): boolean {
  const result = run('git status --porcelain', cwd)
  return result.success && result.stdout.trim().length > 0
}

export function getLastCommitHash(cwd?: string): string {
  const result = run('git rev-parse --short HEAD', cwd)
  return result.success ? result.stdout.trim() : ''
}

export function getRemoteUrl(remote = 'origin', cwd?: string): string {
  const result = run(`git remote get-url ${remote}`, cwd)
  return result.success ? result.stdout.trim() : ''
}
