import * as fs from 'fs'
import { runCommand } from '../../agent/shell/executor.js'

export type CheckName = 'build' | 'lint' | 'test'

export interface CheckResult {
  name: CheckName
  command: string
  skipped: boolean
  success: boolean
  stdout: string
  stderr: string
  durationMs: number
  errorSummary?: string
}

export interface VerificationRunResult {
  success: boolean
  checks: CheckResult[]
}

export interface RunnerOptions {
  runBuild?: boolean
  runLint?: boolean
  runTest?: boolean
  cwd?: string
}

function readPackageScripts(): Record<string, string> {
  const pkgPath = 'package.json'
  if (!fs.existsSync(pkgPath)) return {}
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
    return pkg.scripts ?? {}
  } catch {
    return {}
  }
}

function detectBuildCommand(scripts: Record<string, string>): string | null {
  if (scripts.build) return 'npm run build'
  if (scripts.compile) return 'npm run compile'
  if (scripts.tsc) return 'npm run tsc'
  return null
}

function detectLintCommand(scripts: Record<string, string>): string | null {
  if (scripts.lint) return 'npm run lint'
  if (scripts['type-check']) return 'npm run type-check'
  if (scripts.typecheck) return 'npm run typecheck'
  if (scripts.check) return 'npm run check'
  return null
}

function detectTestCommand(scripts: Record<string, string>): string | null {
  if (scripts.test && !scripts.test.includes('no test')) return 'npm test'
  if (scripts['test:unit']) return 'npm run test:unit'
  if (scripts['test:run']) return 'npm run test:run'
  return null
}

function skippedCheck(name: CheckName, reason: string): CheckResult {
  return {
    name,
    command: '',
    skipped: true,
    success: true,
    stdout: '',
    stderr: '',
    durationMs: 0,
    errorSummary: reason,
  }
}

async function runCheck(name: CheckName, command: string, cwd?: string): Promise<CheckResult> {
  const start = Date.now()
  const result = await runCommand(command, { cwd, requireApproval: false, silent: true })
  const durationMs = Date.now() - start
  const ok = result.exitCode === 0

  let errorSummary: string | undefined
  if (!ok) {
    const combined = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    errorSummary = combined.length > 3000 ? combined.slice(0, 3000) + '\n...(truncated)' : combined
  }

  return {
    name,
    command,
    skipped: false,
    success: ok,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs,
    errorSummary,
  }
}

export async function runVerification(options: RunnerOptions = {}): Promise<VerificationRunResult> {
  const { runBuild = true, runLint = true, runTest = true, cwd } = options
  const scripts = readPackageScripts()
  const checks: CheckResult[] = []

  if (runBuild) {
    const cmd = detectBuildCommand(scripts)
    const check = cmd
      ? await runCheck('build', cmd, cwd)
      : skippedCheck('build', 'No build script found in package.json')
    checks.push(check)

    // Abort remaining checks on build failure — they will all fail too
    if (!check.skipped && !check.success) {
      if (runLint) checks.push(skippedCheck('lint', 'Skipped — build failed'))
      if (runTest) checks.push(skippedCheck('test', 'Skipped — build failed'))
      return { success: false, checks }
    }
  }

  if (runLint) {
    const cmd = detectLintCommand(scripts)
    const check = cmd
      ? await runCheck('lint', cmd, cwd)
      : skippedCheck('lint', 'No lint script found in package.json')
    checks.push(check)
  }

  if (runTest) {
    const cmd = detectTestCommand(scripts)
    const check = cmd
      ? await runCheck('test', cmd, cwd)
      : skippedCheck('test', 'No test script found in package.json')
    checks.push(check)
  }

  const success = checks.every(c => c.skipped || c.success)
  return { success, checks }
}
