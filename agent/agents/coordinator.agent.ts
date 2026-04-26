import { runArchitectAgent } from './architect.agent.js'
import { runCoderAgent } from './coder.agent.js'
import { runTesterAgent } from './tester.agent.js'
import { runReviewerAgent } from './reviewer.agent.js'
import { scanProject } from '../scanner/project.js'
import { buildContext, formatContextForLLM } from '../context/engine.js'
import {
  writePlan,
  readPlan,
  addTask,
  updateTaskStatus,
  addDecision,
} from '../memory/store.js'
import { banner, section, success, error, warn, info } from '../output/formatter.js'
import type { Plan } from '../types.js'

export interface CoordinatorResult {
  plan?: Plan
  success: boolean
  appliedFiles: string[]
  errors: string[]
}

export async function coordinatePlan(task: string): Promise<Plan> {
  banner('PHASE 1 — ARCHITECT')
  info(`Task: ${task}`)

  const project = await scanProject()
  const ctx = buildContext(project, task)
  const ctxText = formatContextForLLM(ctx, project)

  addTask(task, 'in_progress')
  const plan = await runArchitectAgent(task, ctxText)
  writePlan(plan)
  addDecision(
    `Plan created for: ${task}`,
    `${plan.filesToChange.length} file(s), ${plan.steps.length} step(s)`,
  )
  return plan
}

export async function coordinateApply(dryRun = false): Promise<CoordinatorResult> {
  const plan = readPlan()
  if (!plan) {
    return {
      success: false,
      appliedFiles: [],
      errors: ['No plan found. Run `agent plan "<task>"` first.'],
    }
  }

  banner('PHASE 2 — CODER')
  info(`Task: ${plan.task}`)
  section('Planned changes')
  plan.filesToChange.forEach(f => info(`  [${f.action}] ${f.path}`))

  if (dryRun) {
    info('Dry run — no changes applied')
    return { plan, success: true, appliedFiles: [], errors: [] }
  }

  const project = await scanProject()
  const ctx = buildContext(project, plan.task)
  const ctxText = formatContextForLLM(ctx, project)

  updateTaskStatus(plan.task, 'in_progress')
  await runCoderAgent(plan, ctxText)

  banner('PHASE 3 — TESTER')
  const testerResult = await runTesterAgent(
    plan.filesToChange.map(f => f.path),
    ctxText,
  )

  if (!testerResult.success && !testerResult.fixed) {
    warn('Tester reported failures:')
    testerResult.errors.forEach(e => warn(`  • ${e}`))
  } else if (testerResult.success) {
    success('Tests passed')
  }

  banner('PHASE 4 — REVIEWER')
  const freshProject = await scanProject()
  const freshCtx = buildContext(freshProject, plan.task)
  const freshCtxText = formatContextForLLM(freshCtx, freshProject)
  const review = await runReviewerAgent(plan, freshCtxText)

  if (!review.approved) {
    error('Reviewer rejected the implementation:')
    review.issues.forEach(i => warn(`  • ${i}`))
    updateTaskStatus(plan.task, 'failed', review.issues.join('; '))
    return { plan, success: false, appliedFiles: [], errors: review.issues }
  }

  if (review.suggestions.length > 0) {
    section('Reviewer suggestions (non-blocking)')
    review.suggestions.forEach(s => info(`  • ${s}`))
  }

  const appliedFiles = plan.filesToChange.map(f => f.path)
  plan.status = 'completed'
  plan.appliedAt = new Date().toISOString()
  writePlan(plan)
  updateTaskStatus(plan.task, 'completed')

  success(`Applied changes to ${appliedFiles.length} file(s)`)
  return { plan, success: true, appliedFiles, errors: [] }
}
