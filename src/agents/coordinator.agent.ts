import { BaseAgent } from './base.agent.js'
import { ArchitectAgent } from './architect.agent.js'
import { CoderAgent } from './coder.agent.js'
import { TesterAgent } from './tester.agent.js'
import { ReviewerAgent } from './reviewer.agent.js'
import { runVerification } from '../verification/verificationRunner.js'
import { summarizeForLLM } from '../verification/errorAnalyzer.js'
import { saveVerificationLogs } from '../verification/logger.js'
import { scanProjectFiles } from '../../src/context/projectScanner.js'
import { buildIndex } from '../../src/context/fileIndex.js'
import { buildLLMContext, buildReviewContext } from '../../src/context/contextBuilder.js'
import { readCache, writeCache, validateCache, rebuildIndexFromCache } from '../../src/context/cache.js'
import {
  writePlan,
  readPlan,
  addTask,
  updateTaskStatus,
  addDecision,
} from '../../agent/memory/store.js'
import {
  addTask as memAddTask,
  updateTask as memUpdateTask,
  addDecision as memAddDecision,
  addAgentRun as memAddAgentRun,
  findTaskByRequest,
} from '../../src/memory/memoryStore.js'
import { banner, info, success, error, warn, section } from '../../agent/output/formatter.js'
import { backupFiles } from '../patch/backupManager.js'
import { generateDiffSummary } from '../patch/diffPreview.js'
import { createSession, saveSession } from '../patch/editSession.js'
import { rollbackSession } from '../patch/rollbackManager.js'
import type { AgentResult, AgentPlan } from './types.js'
import type { Plan } from '../../agent/types.js'
import type { ScanResult } from '../../src/context/projectScanner.js'
import type { FileIndex } from '../../src/context/fileIndex.js'

const MAX_RETRIES = 3

async function getProjectContext(): Promise<{ scan: ScanResult; index: FileIndex }> {
  const cached = readCache()
  if (cached) {
    const validation = validateCache(cached)
    if (validation.valid) {
      info('Using cached project index')
      const scan: ScanResult = {
        root: cached.root,
        records: [],
        fileTree: cached.fileTree,
        scannedAt: new Date(cached.scannedAt),
        totalFiles: cached.totalFiles,
        languages: cached.languages,
      }
      return { scan, index: rebuildIndexFromCache(cached) }
    }
  }
  info('Scanning project files...')
  const scan = await scanProjectFiles()
  const index = buildIndex(scan)
  writeCache(scan, index)
  info(`Scanned ${scan.totalFiles} files`)
  return { scan, index }
}

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
   * Architect receives project summary + top-ranked files for the task.
   */
  async plan(task: string): Promise<AgentResult> {
    banner('PHASE 1 — ARCHITECT')
    info(`Task: ${task}`)

    const { scan, index } = await getProjectContext()
    const ctx = buildLLMContext(scan, index, { task, maxFiles: 30 })
    info(`Context: ${ctx.filesIncluded.length} files, ~${ctx.totalTokens} tokens`)

    addTask(task, 'in_progress')

    // Create rich TaskRecord in memory store
    const memTask = memAddTask({
      title: task.slice(0, 120),
      userRequest: task,
      status: 'planned',
      changedFiles: [],
      verificationSummary: '',
      commitHash: '',
    })

    const architectResult = await this.architect.run({ task, context: ctx.text })

    // Record architect run
    memAddAgentRun({
      taskId: memTask.id,
      agent: 'architect',
      inputSummary: task.slice(0, 300),
      outputSummary: architectResult.summary.slice(0, 300),
      success: architectResult.success,
      errors: architectResult.errors ?? [],
    })

    if (!architectResult.success || !architectResult.data) {
      memUpdateTask(memTask.id, { status: 'failed' })
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

    // Record architectural decision
    memAddDecision({
      taskId: memTask.id,
      decision: `Plan created for: ${task.slice(0, 100)}`,
      reason: `${agentPlan.filesToChange.length} file(s), ${agentPlan.steps.length} step(s)`,
      agent: 'architect',
    })

    return this.ok(`Plan created: ${agentPlan.filesToChange.length} file(s) planned`, agentPlan, [
      'run apply to execute the plan',
    ])
  }

  /**
   * Phase 2–4: Coder → Tester (with retry) → Reviewer → finalize.
   * Coder receives only relevant selected files. Reviewer receives changed files + related.
   * A Safe Edit session is created before the Coder runs; all planned files are backed up
   * first so any failure can be rolled back via `qwen-agent rollback`.
   */
  async apply(dryRun = false): Promise<AgentResult> {
    const storedPlan = readPlan() as AgentPlan | null
    if (!storedPlan) {
      return this.fail('No plan found — run `qwen-agent plan "<task>"` first')
    }

    if (dryRun) {
      info('Dry run — no changes applied')
      const diffs = generateDiffSummary(
        storedPlan.filesToChange.map(f => ({
          path: f.path,
          content: f.content,
          action: f.action,
        })),
      )
      info(`Planned: ${diffs.totalFiles} file(s)  +${diffs.totalAdded}  -${diffs.totalRemoved}`)
      return this.ok('Dry run completed', { plan: storedPlan, diffSummary: diffs }, [
        'run apply without --dry-run to execute',
      ])
    }

    const { scan, index } = await getProjectContext()
    const ctx = buildLLMContext(scan, index, { task: storedPlan.task, maxFiles: 25 })
    info(`Coder context: ${ctx.filesIncluded.length} files, ~${ctx.totalTokens} tokens`)

    updateTaskStatus(storedPlan.task, 'in_progress')

    // Locate (or create) the memory TaskRecord for this task
    let memTask = findTaskByRequest(storedPlan.task)
    if (!memTask) {
      memTask = memAddTask({
        title: storedPlan.task.slice(0, 120),
        userRequest: storedPlan.task,
        status: 'planned',
        changedFiles: [],
        verificationSummary: '',
        commitHash: '',
      })
    }

    // ── Safe Edit: create session + backup planned files ──────────────────────
    const session = createSession(storedPlan.task)
    const plannedPaths = storedPlan.filesToChange
      .filter(f => f.action !== 'create')
      .map(f => f.path)
    const backupRecords = backupFiles(session.id, plannedPaths)
    session.backups = backupRecords
    session.status = 'previewed'
    saveSession(session)
    info(`Edit session ${session.id.slice(0, 8)} — ${backupRecords.length} file(s) backed up`)

    // ── Phase 2 + 3: Coder → Tester with up to MAX_RETRIES ──────────────────
    let testerPassed = false
    let lastTesterErrors: string[] = []

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      banner(`PHASE 2 — CODER${attempt > 1 ? ` (retry ${attempt - 1}/${MAX_RETRIES - 1})` : ''}`)

      const coderContext =
        attempt === 1
          ? ctx.text
          : `${ctx.text}\n\nFailed tests to fix (attempt ${attempt - 1}):\n${lastTesterErrors.join('\n')}`

      const coderResult = await this.coder.run({
        task: storedPlan.task,
        plan: storedPlan,
        context: coderContext,
      })

      // Record coder run
      memAddAgentRun({
        taskId: memTask.id,
        agent: 'coder',
        inputSummary: `attempt ${attempt}: ${storedPlan.task.slice(0, 200)}`,
        outputSummary: coderResult.summary.slice(0, 300),
        success: coderResult.success,
        errors: coderResult.errors ?? [],
      })

      if (!coderResult.success) {
        session.status = 'failed'
        saveSession(session)
        updateTaskStatus(storedPlan.task, 'failed', coderResult.errors?.join('; '))
        memUpdateTask(memTask.id, { status: 'failed' })
        return this.fail('Coder failed to apply changes', coderResult.errors)
      }

      banner(`PHASE 3 — TESTER (attempt ${attempt}/${MAX_RETRIES})`)

      // Fresh scan after coder made changes
      const freshScan = await scanProjectFiles()
      const freshIndex = buildIndex(freshScan)
      writeCache(freshScan, freshIndex)
      const freshCtx = buildLLMContext(freshScan, freshIndex, {
        task: storedPlan.task,
        maxFiles: 20,
      })

      const testerResult = await this.tester.run({
        task: storedPlan.task,
        changedFiles: storedPlan.filesToChange.map(f => f.path),
        context: freshCtx.text,
      })

      // Record tester run
      memAddAgentRun({
        taskId: memTask.id,
        agent: 'tester',
        inputSummary: `attempt ${attempt}: verify ${storedPlan.task.slice(0, 150)}`,
        outputSummary: testerResult.summary.slice(0, 300),
        success: testerResult.success,
        errors: testerResult.errors ?? [],
      })

      if (testerResult.success) {
        testerPassed = true
        memUpdateTask(memTask.id, {
          verificationSummary: testerResult.summary.slice(0, 300),
        })
        break
      }

      lastTesterErrors = testerResult.errors ?? []

      if (attempt < MAX_RETRIES) {
        warn(`Tests failed (attempt ${attempt}/${MAX_RETRIES}) — retrying coder with error logs`)
        lastTesterErrors.forEach(e => warn(`  • ${e}`))
      } else {
        error(`Tests failed after ${MAX_RETRIES} attempt(s) — rolling back`)
        const rb = await rollbackSession(session.id)
        if (rb.success) {
          warn(`Rolled back session ${session.id.slice(0, 8)} (${rb.restoredFiles.length} file(s) restored)`)
        } else {
          warn(`Auto-rollback failed — run: qwen-agent rollback ${session.id}`)
        }
        updateTaskStatus(storedPlan.task, 'failed', lastTesterErrors.join('; '))
        memUpdateTask(memTask.id, {
          status: 'rolled_back',
          verificationSummary: lastTesterErrors.join('; ').slice(0, 300),
        })
        return this.fail(
          `Tests failed after ${MAX_RETRIES} attempt(s) — changes rolled back`,
          lastTesterErrors,
          ['inspect errors and fix manually, then run `qwen-agent apply`'],
        )
      }
    }

    if (!testerPassed) {
      return this.fail(`Tests failed after ${MAX_RETRIES} attempt(s)`, lastTesterErrors)
    }

    // ── Phase 4: Reviewer — gets changed files + related files ───────────────
    banner('PHASE 4 — REVIEWER')

    const reviewScan = await scanProjectFiles()
    const reviewIndex = buildIndex(reviewScan)
    writeCache(reviewScan, reviewIndex)

    const changedFilePaths = storedPlan.filesToChange.map(f => f.path)
    const reviewCtx = buildReviewContext(changedFilePaths, reviewScan, reviewIndex, {
      maxFiles: 20,
    })
    info(`Review context: ${reviewCtx.filesIncluded.length} files, ~${reviewCtx.totalTokens} tokens`)

    const reviewResult = await this.reviewer.run({
      task: storedPlan.task,
      plan: storedPlan,
      context: reviewCtx.text,
    })

    // Record reviewer run and decision
    memAddAgentRun({
      taskId: memTask.id,
      agent: 'reviewer',
      inputSummary: `review: ${storedPlan.task.slice(0, 200)}`,
      outputSummary: reviewResult.summary.slice(0, 300),
      success: reviewResult.success,
      errors: reviewResult.errors ?? [],
    })
    memAddDecision({
      taskId: memTask.id,
      decision: reviewResult.success ? 'Implementation approved' : 'Implementation rejected',
      reason: (reviewResult.errors ?? [reviewResult.summary]).join('; ').slice(0, 300),
      agent: 'reviewer',
    })

    if (!reviewResult.success) {
      error('Reviewer rejected the implementation:')
      reviewResult.errors?.forEach(i => warn(`  • ${i}`))
      // Roll back on reviewer rejection too
      const rb = await rollbackSession(session.id)
      if (rb.success) {
        warn(`Rolled back session ${session.id.slice(0, 8)} (${rb.restoredFiles.length} file(s) restored)`)
      } else {
        warn(`Auto-rollback failed — run: qwen-agent rollback ${session.id}`)
      }
      updateTaskStatus(storedPlan.task, 'failed', reviewResult.errors?.join('; '))
      memUpdateTask(memTask.id, { status: 'rolled_back' })
      return this.fail('Reviewer rejected implementation — changes rolled back', reviewResult.errors, [
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
    memUpdateTask(memTask.id, { status: 'applied', changedFiles: appliedFiles })

    // Record applied files and diffs in the session
    session.changedFiles = appliedFiles
    session.diffs = generateDiffSummary(
      storedPlan.filesToChange.map(f => ({
        path: f.path,
        content: f.content,
        action: f.action,
      })),
    ).records
    session.status = 'applied'
    saveSession(session)

    success(`Applied changes to ${appliedFiles.length} file(s)`)
    info(`Edit session: ${session.id}`)
    info(`Backup     : .qwen-agent/backups/${session.id}/`)
    info(`Rollback   : qwen-agent rollback ${session.id}`)

    return this.ok(
      `Successfully applied changes to ${appliedFiles.length} file(s)`,
      { appliedFiles, plan: storedPlan, sessionId: session.id },
      [
        'run `qwen-agent test` to verify',
        'run `qwen-agent diff` to review changes',
        'run `qwen-agent rollback` to undo',
        'run `agent commit` to commit changes',
      ],
    )
  }

  /**
   * Run verification only (no coder — just tester).
   * Uses deterministic runner first; escalates to LLM tester only on failure.
   */
  async test(): Promise<AgentResult> {
    banner('VERIFICATION')

    const runResult = await runVerification({ runBuild: true, runLint: true, runTest: true })
    saveVerificationLogs(runResult, 1)

    if (runResult.success) {
      return this.ok('All checks passed', { success: true, errors: [], attempts: 1 }, [
        'ready to commit',
      ])
    }

    // Escalate to LLM-powered tester with structured error context
    const errorSummary = summarizeForLLM(runResult.checks)
    info('Checks failed — running LLM tester for analysis')
    warn(errorSummary.slice(0, 800))

    const { scan, index } = await getProjectContext()
    const ctx = buildLLMContext(scan, index, { task: 'verify build and tests', maxFiles: 15 })

    return this.tester.run({
      task: 'verify build and tests',
      changedFiles: [],
      context: `${ctx.text}\n\nVerification errors to analyze:\n${errorSummary}`,
    })
  }

  /**
   * Run reviewer only against the stored plan.
   */
  async review(): Promise<AgentResult> {
    banner('REVIEW')

    const storedPlan = readPlan() as AgentPlan | null
    if (!storedPlan) {
      return this.fail('No plan found — run `qwen-agent plan "<task>"` first')
    }

    const { scan, index } = await getProjectContext()
    const changedFilePaths = storedPlan.filesToChange.map(f => f.path)
    const ctx = buildReviewContext(changedFilePaths, scan, index, { maxFiles: 20 })

    return this.reviewer.run({
      task: storedPlan.task,
      plan: storedPlan,
      context: ctx.text,
    })
  }
}
