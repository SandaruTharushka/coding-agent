import * as fs from 'fs'
import * as path from 'path'
import type { VerificationRunResult, CheckResult } from './verificationRunner.js'

const LOG_BASE = '.qwen-agent/verification'

function sanitizeTimestamp(ts: string): string {
  return ts.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
}

function buildErrorSummaryMd(checks: CheckResult[], timestamp: string, attempt: number): string {
  const failed = checks.filter(c => !c.skipped && !c.success)
  if (failed.length === 0) return '# Verification Error Summary\n\nAll checks passed.\n'

  const lines = [
    '# Verification Error Summary',
    '',
    `**Run:** ${timestamp}`,
    `**Attempt:** ${attempt}`,
    '',
  ]

  for (const check of failed) {
    lines.push(`## ${check.name.toUpperCase()}`)
    lines.push('')
    lines.push(`**Command:** \`${check.command}\``)
    lines.push(`**Duration:** ${check.durationMs}ms`)
    lines.push('')
    lines.push('```')
    lines.push(check.errorSummary ?? '(no output captured)')
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

export function saveVerificationLogs(result: VerificationRunResult, attempt: number): string {
  const timestamp = new Date().toISOString()
  const dirName = `${sanitizeTimestamp(timestamp)}-attempt${attempt}`
  const runDir = path.join(LOG_BASE, dirName)

  fs.mkdirSync(runDir, { recursive: true })

  // run.json — structured summary without full stdout/stderr
  const runJson = {
    timestamp,
    attempt,
    success: result.success,
    checks: result.checks.map(c => ({
      name: c.name,
      command: c.command,
      skipped: c.skipped,
      success: c.success,
      durationMs: c.durationMs,
      errorSummary: c.errorSummary,
    })),
  }
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(runJson, null, 2))

  // Individual log files
  for (const check of result.checks) {
    const content = [
      `Command: ${check.command || '(skipped)'}`,
      `Skipped: ${check.skipped}`,
      `Success: ${check.success}`,
      `Duration: ${check.durationMs}ms`,
      '',
      '=== STDOUT ===',
      check.stdout || '(empty)',
      '',
      '=== STDERR ===',
      check.stderr || '(empty)',
    ].join('\n')
    fs.writeFileSync(path.join(runDir, `${check.name}.log`), content)
  }

  // error-summary.md
  fs.writeFileSync(
    path.join(runDir, 'error-summary.md'),
    buildErrorSummaryMd(result.checks, timestamp, attempt),
  )

  return runDir
}

export function getLatestLogDir(): string | null {
  if (!fs.existsSync(LOG_BASE)) return null
  const dirs = fs
    .readdirSync(LOG_BASE)
    .filter(d => fs.statSync(path.join(LOG_BASE, d)).isDirectory())
    .sort()
    .reverse()
  return dirs.length > 0 ? path.join(LOG_BASE, dirs[0]) : null
}
