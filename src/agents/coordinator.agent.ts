import { BaseAgent } from './base.agent.js'
import { ArchitectAgent } from './architect.agent.js'
import { CoderAgent } from './coder.agent.js'
import { TesterAgent } from './tester.agent.js'
import { ReviewerAgent } from './reviewer.agent.js'
import { scanProject } from '../../agent/scanner/project.js'
import { buildContext, formatContextForLLM } from '../../agent/context/engine.js'
import {
  writePlan,
  readPlan,
  addTask,
  updateTaskStatus,
  addDecision,
} from '../../agent/memory/store.js'
import { banner, info, success, error, warn, section } from '../../agent/output/formatter.js'
import type { AgentResult, AgentPlan } from './types.js'
import type { Plan } from '../../agent/types.js'

const MAX_RETRIES = 3

export class CoordinatorAgent extends BaseAgent {
  private architect = new ArchitectAgent()
  private coder = new CoderAgent()
  private tester = new TesterAgent()
  private reviewer = new ReviewerAgent()

  constructor() {
    super('coordinator')
  }

  /**
   * Phase 1: Architect creates a plan and saves it to .agent/plan.json
   */
  async plan(task: string): Promise<AgentResult> {
    banner('PHASE 1 — ARCHITECT')
    info(`Task: ${task}`)

    const project = await scanProject()
    const ctx = buildContext(project, task)
    const ctxText = formatContextForLLM(ctx, project)

    addTask(task, 'in_progress')

    const architectResult = await this.architect.run({ task, context: ctxText })
    if (!architectResult.success || !architectResult.data) {
      return this.fail('Architect failed to create a plan', architectResult.errors, [
        'check task description and retry',
      ])
    }

    const agentPlan = architectResult.data as AgentPlan
    writePlan(agentPlan as Plan)
    addDecision(
      `Plan created for: ${task}`,
      `${agentPlan.filesToChange.length} file(s), ${agentPlan.steps.length} step(s)`,
    )

    return this.ok(`Plan created: ${agentPlan.filesToChange.length} file(s) planned`, agentPlan, [
      'run apply to execute the plan',
    ])
  }

  /**
   * Phase 2–4: Coder → Tester (with retry) → Reviewer → finalize
   * If dryRun is true, the plan is shown but no changes are applied.
   */
  async apply(dryRun = false): Promise<AgentResult> {
    const storedPlan = readPlan() as AgentPlan | null
    if (!storedPlan) {
      return this.fail('No plan found — run `qwen-agent plan "<task>"` first')
    }

    if (dryRun) {
      info('Dry run — no changes applied')
      return this.ok('Dry run completed', storedPlan, ['run apply without --dry-run to execute'])
    }

    const project = await scanProject()
    const ctx = buildContext(project, storedPlan.task)
    const ctxText = formatContextForLLM(ctx, project)

    updateTaskStatus(storedPlan.task, 'in_progress')

    // ── Phase 2 + 3: Coder → Tester with up to MAX_RETRIES ──────────────────
    let testerPassed = false
    let lastTesterErrors: string[] = []

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      banner(`PHASE 2 — CODER${attempt > 1 ? ` (retry ${attempt - 1}/${MAX_RETRIES - 1})` : ''}`)

      const coderContext =
        attempt === 1
          ? ctxText
          : `${ctxText}\n\nFailed tests to fix (attempt ${attempt - 1}):\n${lastTesterErrors.join('\n')}`

      const coderResult = await this.coder.run({
        task: storedPlan.task,
        plan: storedPlan,
        context: coderContext,
      })

      if (!coderResult.success) {
        updateTaskStatus(storedPlan.task, 'failed', coderResult.errors?.join('; '))
        return this.fail('Coder failed to apply changes', coderResult.errors)
      }

      banner(`PHASE 3 — TESTER (attempt ${attempt}/${MAX_RETRIES})`)

      const freshProject = await scanProject()
      const freshCtx = buildContext(freshProject, storedPlan.task)
      const freshCtxText = formatContextForLLM(freshCtx, freshProject)

      const testerResult = await this.tester.run({
        task: storedPlan.task,
        changedFiles: storedPlan.filesToChange.map(f => f.path),
        context: freshCtxText,
      })

      if (testerResult.success) {
        testerPassed = true
        break
      }

      lastTesterErrors = testerResult.errors ?? []

      if (attempt < MAX_RETRIES) {
        warn(`Tests failed (attempt ${attempt}/${MAX_RETRIES}) — retrying coder with error logs`)
        lastTesterErrors.forEach(e => warn(`  • ${e}`))
      } else {
        error(`Tests failed after ${MAX_RETRIES} attempt(s) — stopping`)
        updateTaskStatus(storedPlan.task, 'failed', lastTesterErrors.join('; '))
        return this.fail(
          `Tests failed after ${MAX_RETRIES} attempt(s)`,
          lastTesterErrors,
          ['inspect errors and fix manually, then run `qwen-agent test`'],
        )
      }
    }

    if (!testerPassed) {
      return this.fail(`Tests failed after ${MAX_RETRIES} attempt(s)`, lastTesterErrors)
    }

    // ── Phase 4: Reviewer ────────────────────────────────────────────────────
    banner('PHASE 4 — REVIEWER')

    const reviewProject = await scanProject()
    const reviewCtx = buildContext(reviewProject, storedPlan.task)
    const reviewCtxText = formatContextForLLM(reviewCtx, reviewProject)

    const reviewResult = await this.reviewer.run({
      task: storedPlan.task,
      plan: storedPlan,
      context: reviewCtxText,
    })

    if (!reviewResult.success) {
      error('Reviewer rejected the implementation:')
      reviewResult.errors?.forEach(i => warn(`  • ${i}`))
      updateTaskStatus(storedPlan.task, 'failed', reviewResult.errors?.join('; '))
      return this.fail('Reviewer rejected implementation', reviewResult.errors, [
        'address issues and run apply again',
      ])
    }

    const reviewData = reviewResult.data as { suggestions?: string[] } | undefined
    if (reviewData?.suggestions && reviewData.suggestions.length > 0) {
      section('Reviewer suggestions (non-blocking)')
      reviewData.suggestions.forEach(s => info(`  • ${s}`))
    }

    // ── Finalize ─────────────────────────────────────────────────────────────
    const appliedFiles = storedPlan.filesToChange.map(f => f.path)
    storedPlan.status = 'completed'
    storedPlan.appliedAt = new Date().toISOString()
    writePlan(storedPlan as Plan)
    updateTaskStatus(storedPlan.task, 'completed')

    success(`Applied changes to ${appliedFiles.length} file(s)`)

    return this.ok(
      `Successfully applied changes to ${appliedFiles.length} file(s)`,
      { appliedFiles, plan: storedPlan },
      ['run `qwen-agent test` to verify', 'run `agent commit` to commit changes'],
    )
  }

  /**
   * Run verification only (no coder — just tester)
   */
  async test(): Promise<AgentResult> {
    banner('VERIFICATION')

    const project = await scanProject()
    const ctx = buildContext(project, 'verify build and tests')
    const ctxText = formatContextForLLM(ctx, project)

    return this.tester.run({
      task: 'verify build and tests',
      changedFiles: [],
      context: ctxText,
    })
  }

  /**
   * Run reviewer only against the stored plan
   */
  async review(): Promise<AgentResult> {
    banner('REVIEW')

    const storedPlan = readPlan() as AgentPlan | null
    if (!storedPlan) {
      return this.fail('No plan found — run `qwen-agent plan "<task>"` first')
    }

    const project = await scanProject()
    const ctx = buildContext(project, storedPlan.task)
    const ctxText = formatContextForLLM(ctx, project)

    return this.reviewer.run({
      task: storedPlan.task,
      plan: storedPlan,
      context: ctxText,
    })
  }
}
