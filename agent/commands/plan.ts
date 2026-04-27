import { CoordinatorAgent } from '../../src/agents/coordinator.agent.js'
import { printPlan } from '../output/formatter.js'
import type { AgentPlan } from '../../src/agents/types.js'

export async function planCommand(task: string, opts: { model?: string }): Promise<void> {
  if (!process.env.QWEN_API_KEY) {
    console.error('\x1b[31m✗ QWEN_API_KEY is not set\x1b[0m')
    process.exit(1)
  }

  if (opts.model) process.env.QWEN_MODEL = opts.model

  const coordinator = new CoordinatorAgent()
  const result = await coordinator.plan(task)

  if (!result.success) {
    console.error('\x1b[31m✗ Plan failed:\x1b[0m', result.errors?.join(', '))
    process.exit(1)
  }

  printPlan(result.data as AgentPlan)
  console.log('\nPlan saved to .agent/plan.json. Run `qwen-agent apply` to execute it.')
}
