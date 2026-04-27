import { BaseAgent } from './base.agent.js'
import { runArchitectAgent } from '../../agent/agents/architect.agent.js'
import type { AgentInput, AgentResult, AgentPlan } from './types.js'

interface ArchitectInput extends AgentInput {
  context: string
}

export class ArchitectAgent extends BaseAgent {
  constructor() {
    super('architect')
  }

  async run(input: ArchitectInput): Promise<AgentResult> {
    this.log(`Analyzing task: ${input.task}`)
    try {
      const plan = await runArchitectAgent(input.task, input.context)
      const agentPlan: AgentPlan = plan
      return this.ok(
        `Plan created: ${plan.filesToChange.length} file(s), ${plan.steps.length} step(s)`,
        agentPlan,
        ['proceed to coder'],
      )
    } catch (e) {
      return this.fail(
        'Failed to create plan',
        [e instanceof Error ? e.message : String(e)],
        ['abort pipeline'],
      )
    }
  }
}
