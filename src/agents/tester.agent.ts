import { BaseAgent } from './base.agent.js'
import { runTesterAgent } from '../../agent/agents/tester.agent.js'
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
    try {
      const result = await runTesterAgent(input.changedFiles, input.context)

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
        result.errors,
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
