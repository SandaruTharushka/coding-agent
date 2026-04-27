import { readPlan } from '../memory/store.js'
import { CoordinatorAgent } from '../../src/agents/coordinator.agent.js'
import { banner, info, warn, success, error } from '../output/formatter.js'
import { verifyCommand } from './verify.js'
import type { AgentPlan } from '../../src/agents/types.js'

export async function applyCommand(opts: { dryRun?: boolean; verify?: boolean }): Promise<void> {
  if (!process.env.QWEN_API_KEY) {
    console.error('\x1b[31m✗ QWEN_API_KEY is not set\x1b[0m')
    process.exit(1)
  }

  const plan = readPlan()
  if (!plan) {
    error('No plan found. Run `qwen-agent plan "<task>"` first.')
    process.exit(1)
  }

  if (plan.status === 'completed') {
    warn('This plan has already been applied.')
    warn('Run `qwen-agent plan "<task>"` to create a new plan.')
    return
  }

  if (opts.dryRun) {
    banner('DRY RUN — PLAN PREVIEW')
    info(`Task: ${plan.task}`)
    plan.filesToChange.forEach(f => info(`  [${f.action}] ${f.path} — ${f.reason}`))
    return
  }

  const coordinator = new CoordinatorAgent()
  const result = await coordinator.apply(false)

  if (result.success) {
    const data = result.data as { appliedFiles: string[] } | undefined
    const files = data?.appliedFiles ?? []
    success(`\nDone. ${files.length} file(s) changed.`)
    if (files.length > 0) {
      info('Changed files:')
      files.forEach((f: string) => console.log(`  • ${f}`))
    }
    if (opts.verify) {
      console.log()
      await verifyCommand({})
    } else {
      console.log('\nRun `qwen-agent verify` to check build/lint, then `agent commit` to commit.')
    }
  } else {
    error('Apply failed:')
    result.errors?.forEach(e => console.log(`  • ${e}`))
    process.exit(1)
  }
}

export async function applyTaskCommand(
  task: string,
  opts: { model?: string; dryRun?: boolean; verify?: boolean },
): Promise<void> {
  if (!process.env.QWEN_API_KEY) {
    console.error('\x1b[31m✗ QWEN_API_KEY is not set\x1b[0m')
    process.exit(1)
  }

  if (opts.model) process.env.QWEN_MODEL = opts.model

  const coordinator = new CoordinatorAgent()

  const planResult = await coordinator.plan(task)
  if (!planResult.success) {
    error('Planning failed:')
    planResult.errors?.forEach(e => console.log(`  • ${e}`))
    process.exit(1)
  }

  if (opts.dryRun) {
    const agentPlan = planResult.data as AgentPlan
    banner('DRY RUN — PLAN PREVIEW')
    agentPlan.filesToChange.forEach(f => info(`  [${f.action}] ${f.path} — ${f.reason}`))
    return
  }

  const applyResult = await coordinator.apply(false)
  if (applyResult.success) {
    const data = applyResult.data as { appliedFiles: string[] } | undefined
    const files = data?.appliedFiles ?? []
    success(`\nDone. ${files.length} file(s) changed.`)
    files.forEach((f: string) => console.log(`  • ${f}`))
    if (opts.verify) {
      console.log()
      await verifyCommand({})
    }
  } else {
    error('Apply failed:')
    applyResult.errors?.forEach(e => console.log(`  • ${e}`))
    process.exit(1)
  }
}
