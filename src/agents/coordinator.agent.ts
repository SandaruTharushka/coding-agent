import { BaseAgent } from './base.agent.js'
import { ArchitectAgent } from './architect.agent.js'
import { CoderAgent } from './coder.agent.js'
import { TesterAgent } from './tester.agent.js'
import { ReviewerAgent } from './reviewer.agent.js'
import { scanProject } from '../context/projectScanner.js'
import { buildFileIndex } from '../context/fileIndex.js'
import { selectRelevantFiles, getRelatedFiles } from '../context/relevanceSelector.js'
import { buildContext, formatContextForLLM } from '../context/contextBuilder.js'
import { readCache, writeCache, isCacheValid, invalidateCache } from '../context/cache.js'
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

// ─── Context engine helpers ───────────────────────────────────────────────────

interface ContextEngineResult {
  ctxText: string
  totalFiles: number
  selectedFiles: number
}

async function buildArchitectContext(task: string): Promise<ContextEngineResult> {
  const scan = await scanProject()

  const cache = readCache()
  if (!cache || !isCacheValid(cache, scan.files)) {
    writeCache(scan.files)
  }

  const index = buildFileIndex(scan.files)
  // Architect needs a broad view: project summary + all ranked files
  const ranked = selectRelevantFiles(task, index, { maxFiles: 40, includeConfigs: true })
  const ctx = buildContext(scan, ranked, { maxTokens: 40_000, reserveTokens: 8_000 })

  return { ctxText: formatContextForLLM(ctx), totalFiles: scan.totalFiles, selectedFiles: ctx.selectedFileCount }
}

async function buildCoderContext(task: string, extraErrors?: string): Promise<ContextEngineResult> {
  const scan = await scanProject()
  const index = buildFileIndex(scan.files)
  // Coder needs precise, directly relevant files only
  const ranked = selectRelevantFiles(task, index, { maxFiles: 20, includeConfigs: false })
  const ctx = buildContext(scan, ranked, { maxTokens: 36_000, reserveTokens: 6_000 })

  let ctxText = formatContextForLLM(ctx)
  if (extraErrors) ctxText += `\n\n## Errors to Fix\n${extraErrors}`

  return { ctxText, totalFiles: scan.totalFiles, selectedFiles: ctx.selectedFileCount }
}

async function buildReviewerContext(
  task: string,
  changedPaths: string[],
): Promise<ContextEngineResult> {
  const scan = await scanProject()
  const index = buildFileIndex(scan.files)

  // Reviewer sees changed files + files related to those changes
  const changedRelative = changedPaths.map(p => {
    const rec = [...index.records.values()].find(r => r.path === p || r.relativePath === p)
    return rec?.relativePath ?? p
  })

  const relatedSet = new Set<string>()
  for (const rel of changedRelative) {
    for (const related of getRelatedFiles(rel, index, 5)) {
      relatedSet.add(related.relativePath)
    }
  }

  const ranked = selectRelevantFiles(task, index, { maxFiles: 30, includeConfigs: true })
  // Boost changed and related files to the front
  const boosted = ranked.map(f => {
    const isChanged = changedRelative.includes(f.relativePath)
    const isRelated = relatedSet.has(f.relativePath)
    return {
      ...f,
      score: f.score + (isChanged ? 50 : 0) + (isRelated ? 20 : 0),
      reasons: [
        ...f.reasons,
        ...(isChanged ? ['directly changed'] : []),
        ...(isRelated ? ['related to changed file'] : []),
      ],
    }
  }).sort((a, b) => b.score - a.score)

  const ctx = buildContext(scan, boosted, { maxTokens: 40_000, reserveTokens: 6_000 })
  return { ctxText: formatContextForLLM(ctx), totalFiles: scan.totalFiles, selectedFiles: ctx.selectedFileCount }
}

// ─── Coordinator ──────────────────────────────────────────────────────────────

export class CoordinatorAgent extends BaseAgent {
  private architect = new ArchitectAgent()
  private coder = new CoderAgent()
  private tester = new TesterAgent()
  private reviewer = new ReviewerAgent()

  constructor() {
    super('coordinator')
  }

  /**
   * Phase 1: Architect creates a plan and saves it to .agent/plan.json.
   * Context: project summary + broad ranked file list.
   */
  async plan(task: string): Promise<AgentResult> {
    banner('PHASE 1 — ARCHITECT')
    info(`Task: ${task}`)

    const { ctxText, totalFiles, selectedFiles } = await buildArchitectContext(task)
    info(`Context: ${selectedFiles}/${totalFiles} files selected`)

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
   * Phase 2–4: Coder → Tester (with retry) → Reviewer → finalize.
   * Each agent receives a context tailored to its role.
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

    // Invalidate cache so coder/tester see fresh state after each attempt
    invalidateCache()

    updateTaskStatus(storedPlan.task, 'in_progress')

    // ── Phase 2 + 3: Coder → Tester with up to MAX_RETRIES ──────────────────
    let testerPassed = false
    let lastTesterErrors: string[] = []

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      banner(`PHASE 2 — CODER${attempt > 1 ? ` (retry ${attempt - 1}/${MAX_RETRIES - 1})` : ''}`)

      const { ctxText: coderCtx, selectedFiles: coderSel, totalFiles } = await buildCoderContext(
        storedPlan.task,
        attempt > 1 ? lastTesterErrors.join('\n') : undefined,
      )
      info(`Context: ${coderSel}/${totalFiles} files selected for coder`)

      const coderResult = await this.coder.run({
        task: storedPlan.task,
        plan: storedPlan,
        context: coderCtx,
      })

      if (!coderResult.success) {
        updateTaskStatus(storedPlan.task, 'failed', coderResult.errors?.join('; '))
        return this.fail('Coder failed to apply changes', coderResult.errors)
      }

      banner(`PHASE 3 — TESTER (attempt ${attempt}/${MAX_RETRIES})`)

      // Tester always rescans to see changes the coder just made
      invalidateCache()
      const { ctxText: testerCtx, selectedFiles: testerSel } = await buildCoderContext(
        storedPlan.task,
      )
      info(`Context: ${testerSel}/${totalFiles} files selected for tester`)

      const testerResult = await this.tester.run({
        task: storedPlan.task,
        changedFiles: storedPlan.filesToChange.map(f => f.path),
        context: testerCtx,
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

    const changedPaths = storedPlan.filesToChange.map(f => f.path)
    const { ctxText: reviewCtx, selectedFiles: reviewSel, totalFiles } =
      await buildReviewerContext(storedPlan.task, changedPaths)
    info(`Context: ${reviewSel}/${totalFiles} files selected for reviewer (changed + related)`)

    const reviewResult = await this.reviewer.run({
      task: storedPlan.task,
      plan: storedPlan,
      context: reviewCtx,
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

  /** Run verification only (no coder — just tester). */
  async test(): Promise<AgentResult> {
    banner('VERIFICATION')

    const { ctxText, selectedFiles, totalFiles } = await buildCoderContext('verify build and tests')
    info(`Context: ${selectedFiles}/${totalFiles} files selected`)

    return this.tester.run({
      task: 'verify build and tests',
      changedFiles: [],
      context: ctxText,
    })
  }

  /** Run reviewer only against the stored plan. */
  async review(): Promise<AgentResult> {
    banner('REVIEW')

    const storedPlan = readPlan() as AgentPlan | null
    if (!storedPlan) {
      return this.fail('No plan found — run `qwen-agent plan "<task>"` first')
    }

    const changedPaths = storedPlan.filesToChange.map(f => f.path)
    const { ctxText, selectedFiles, totalFiles } = await buildReviewerContext(
      storedPlan.task,
      changedPaths,
    )
    info(`Context: ${selectedFiles}/${totalFiles} files selected`)

    return this.reviewer.run({
      task: storedPlan.task,
      plan: storedPlan,
      context: ctxText,
    })
  }
}
