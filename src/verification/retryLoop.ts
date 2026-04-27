import { runVerification, type VerificationRunResult, type RunnerOptions } from './verificationRunner.js'
import { summarizeForLLM } from './errorAnalyzer.js'
import { saveVerificationLogs } from './logger.js'

export interface RetryLoopOptions extends RunnerOptions {
  maxRetries?: number
  /** Called with error summary when verification fails. Return true if fixes were applied. */
  autoFix?: (errorSummary: string, attempt: number) => Promise<boolean>
}

export interface RetryLoopResult {
  success: boolean
  attempts: number
  finalResult: VerificationRunResult
  errorSummaries: string[]
}

export async function runRetryLoop(options: RetryLoopOptions = {}): Promise<RetryLoopResult> {
  const { maxRetries = 3, autoFix, ...runnerOptions } = options
  const errorSummaries: string[] = []
  let lastResult: VerificationRunResult = { success: false, checks: [] }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastResult = await runVerification(runnerOptions)
    saveVerificationLogs(lastResult, attempt)

    if (lastResult.success) {
      return {
        success: true,
        attempts: attempt,
        finalResult: lastResult,
        errorSummaries,
      }
    }

    const summary = summarizeForLLM(lastResult.checks)
    errorSummaries.push(summary)

    if (attempt < maxRetries && autoFix) {
      const fixed = await autoFix(summary, attempt)
      if (!fixed) break
      // autoFix applied changes — loop to next attempt
    } else {
      break
    }
  }

  return {
    success: false,
    attempts: errorSummaries.length,
    finalResult: lastResult,
    errorSummaries,
  }
}
