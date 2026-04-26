import { coordinatePlan } from '../agents/coordinator.agent.js'
import { printPlan, info } from '../output/formatter.js'

export async function planCommand(task: string, opts: { model?: string }): Promise<void> {
  if (!process.env.QWEN_API_KEY) {
    console.error('\x1b[31m✗ QWEN_API_KEY is not set\x1b[0m')
    process.exit(1)
  }

  if (opts.model) process.env.QWEN_MODEL = opts.model

  info(`Planning: "${task}"`)
  const plan = await coordinatePlan(task)
  printPlan(plan)
  console.log('Plan saved to .agent/plan.json. Run `agent apply` to execute it.')
}
