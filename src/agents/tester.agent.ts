import { BaseAgent } from './base.agent.js'
import { runTesterAgent } from '../../agent/agents/tester.agent.js'
import { runVerification } from '../verification/verificationRunner.js'
import { summarizeForLLM } from '../verification/errorAnalyzer.js'
import { saveVerificationLogs } from '../verification/logger.js'
import type { AgentInput, AgentResult, VerificationResult } from './types.js'

interface TesterInput extends AgentInput {
  changedFiles: string[]
  context: string
}

export class TesterAgent extends BaseAgent {
  constructor() {
    super('tester')
  }

  async run(input: TesterInput): Promise<AgentResult> {
    this.log(`Verifying ${input.changedFiles.length} changed file(s)`)

    // Run deterministic checks first
    const runResult = await runVerification({ runBuild: true, runLint: true, runTest: true })
    saveVerificationLogs(runResult, 1)

    if (runResult.success) {
      const verificationResult: VerificationResult = {
        success: true,
        buildOutput: runResult.checks.find(c => c.name === 'build')?.stdout,
        testOutput: runResult.checks.find(c => c.name === 'test')?.stdout,
        errors: [],
        attempts: 1,
      }
      return this.ok('All checks passed', verificationResult, ['proceed to reviewer'])
    }

    // On failure, build a concise error summary for the LLM
    const errorSummary = summarizeForLLM(runResult.checks)
    this.log(`Checks failed — escalating to LLM tester\n${errorSummary.slice(0, 500)}`)

    try {
      const result = await runTesterAgent(
        input.changedFiles,
        `${input.context}\n\nVerification errors:\n${errorSummary}`,
      )

      const verificationResult: VerificationResult = {
        success: result.success,
        testOutput: result.output,
        errors: result.errors,
        attempts: 1,
      }

      if (result.success || result.fixed) {
        return this.ok(
          result.fixed ? 'Tests passed after auto-fix' : 'Tests passed',
          verificationResult,
          ['proceed to reviewer'],
        )
      }

      return this.fail(
        `Tests failed with ${result.errors.length} error(s)`,
        result.errors.length > 0 ? result.errors : [errorSummary],
        ['retry coder with error logs'],
      )
    } catch (e) {
      return this.fail(
        'Tester encountered an unexpected error',
        [e instanceof Error ? e.message : String(e)],
        ['abort pipeline'],
      )
    }
  }
}
