import { runVerification } from '../../src/verification/verificationRunner.js'
import { runRetryLoop } from '../../src/verification/retryLoop.js'
import { saveVerificationLogs } from '../../src/verification/logger.js'
import { banner, section, success, error, info, fmt } from '../output/formatter.js'

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function printCheck(check: {
  name: string
  command: string
  skipped: boolean
  success: boolean
  durationMs: number
  errorSummary?: string
}): void {
  const icon = check.skipped ? fmt.dim('○') : check.success ? fmt.green('✓') : fmt.red('✗')
  const status = check.skipped ? fmt.dim('SKIPPED') : check.success ? fmt.green('PASS') : fmt.red('FAIL')
  const dur = check.skipped ? '' : `  ${fmt.dim(formatDuration(check.durationMs))}`

  console.log(`  ${icon} ${fmt.bold(check.name.padEnd(6))}  ${status}${dur}`)
  if (!check.skipped && check.command) {
    console.log(`         ${fmt.dim(`$ ${check.command}`)}`)
  }
  if (!check.success && !check.skipped && check.errorSummary) {
    const lines = check.errorSummary.split('\n').slice(0, 12)
    for (const line of lines) {
      console.log(`         ${fmt.red(line)}`)
    }
    const total = check.errorSummary.split('\n').length
    if (total > 12) {
      console.log(`         ${fmt.dim(`... (${total - 12} more lines — see .qwen-agent/verification/)`)}`)
    }
  }
}

function printResults(checks: Array<{
  name: string
  command: string
  skipped: boolean
  success: boolean
  durationMs: number
  errorSummary?: string
}>): void {
  section('Results')
  for (const check of checks) printCheck(check)
  console.log()
}

export interface VerifyOptions {
  build?: boolean
  lint?: boolean
  test?: boolean
  retry?: boolean
}

export async function verifyCommand(opts: VerifyOptions = {}): Promise<void> {
  const hasFilter = opts.build ?? opts.lint ?? opts.test
  const runBuild = hasFilter ? !!opts.build : true
  const runLint = hasFilter ? !!opts.lint : true
  const runTest = hasFilter ? !!opts.test : true

  const active = [runBuild && 'build', runLint && 'lint', runTest && 'test'].filter(Boolean)
  banner('VERIFICATION')
  info(`Checks: ${active.join(' + ')}`)
  console.log()

  if (opts.retry) {
    info('Retry mode — will re-run up to 3× on failure')
    console.log()

    const retryResult = await runRetryLoop({ runBuild, runLint, runTest, maxRetries: 3 })
    printResults(retryResult.finalResult.checks)

    if (retryResult.success) {
      success(`Verification passed (${retryResult.attempts} attempt(s))`)
    } else {
      error(`Verification failed after ${retryResult.attempts} attempt(s)`)
      info('Logs saved to .qwen-agent/verification/')
      info('Run `qwen-agent rollback` to undo recent changes if needed')
      process.exit(1)
    }
    return
  }

  const result = await runVerification({ runBuild, runLint, runTest })
  saveVerificationLogs(result, 1)
  printResults(result.checks)

  if (result.success) {
    success('All checks passed')
  } else {
    const failCount = result.checks.filter(c => !c.skipped && !c.success).length
    error(`${failCount} check(s) failed`)
    info('Logs saved to .qwen-agent/verification/')
    info('Run with --retry to re-run failed checks up to 3×')
    process.exit(1)
  }
}
