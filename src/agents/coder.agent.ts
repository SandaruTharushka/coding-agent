import { BaseAgent } from './base.agent.js'
import { runCoderAgent } from '../../agent/agents/coder.agent.js'
import type { AgentInput, AgentResult, AgentPlan } from './types.js'

interface CoderInput extends AgentInput {
  plan: AgentPlan
  context: string
}

export class CoderAgent extends BaseAgent {
  constructor() {
    super('coder')
  }

  async run(input: CoderInput): Promise<AgentResult> {
    this.log(`Implementing plan for: ${input.plan.task}`)
    try {
      const output = await runCoderAgent(input.plan, input.context)
      return this.ok(
        `Code changes applied for ${input.plan.filesToChange.length} file(s)`,
        { output },
        ['proceed to tester'],
      )
    } catch (e) {
      return this.fail(
        'Failed to apply code changes',
        [e instanceof Error ? e.message : String(e)],
        ['retry or abort'],
      )
    }
  }
}
