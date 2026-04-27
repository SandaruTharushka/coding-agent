import { BaseAgent } from './base.agent.js'
import { runReviewerAgent } from '../../agent/agents/reviewer.agent.js'
import type { AgentInput, AgentResult, AgentPlan, ReviewResult } from './types.js'

interface ReviewerInput extends AgentInput {
  plan: AgentPlan
  context: string
}

export class ReviewerAgent extends BaseAgent {
  constructor() {
    super('reviewer')
  }

  async run(input: ReviewerInput): Promise<AgentResult> {
    this.log(`Reviewing implementation for: ${input.plan.task}`)
    try {
      const result = await runReviewerAgent(input.plan, input.context)

      const reviewResult: ReviewResult = {
        approved: result.approved,
        issues: result.issues,
        suggestions: result.suggestions,
      }

      if (result.approved) {
        return this.ok(
          `Review approved${result.suggestions.length > 0 ? ` with ${result.suggestions.length} suggestion(s)` : ''}`,
          reviewResult,
          ['finalize changes'],
        )
      }

      return this.fail(
        `Review rejected: ${result.issues.length} critical issue(s)`,
        result.issues,
        ['address reviewer issues'],
      )
    } catch (e) {
      return this.fail(
        'Reviewer encountered an unexpected error',
        [e instanceof Error ? e.message : String(e)],
        ['abort pipeline'],
      )
    }
  }
}
