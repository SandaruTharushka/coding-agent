import { scanProject } from '../../src/context/projectScanner.js'
import { buildFileIndex } from '../../src/context/fileIndex.js'
import { selectRelevantFiles } from '../../src/context/relevanceSelector.js'
import { buildContext, formatContextForLLM } from '../../src/context/contextBuilder.js'
import { readCache, writeCache, isCacheValid, invalidateCache } from '../../src/context/cache.js'
import { estimateTokens } from '../../src/context/tokenBudget.js'
import { banner, section, success, info, log, warn, fmt } from '../output/formatter.js'

export interface ContextCommandOptions {
  json?: boolean
  refresh?: boolean
  maxFiles?: string
  maxTokens?: string
}

export async function contextCommand(task: string, opts: ContextCommandOptions): Promise<void> {
  const maxFiles = parseInt(opts.maxFiles ?? '30', 10)
  const maxTokens = parseInt(opts.maxTokens ?? '40000', 10)

  if (!opts.json) banner('CONTEXT ENGINE')

  // ── Scan ──────────────────────────────────────────────────────────────────
  if (!opts.json) info('Scanning project files…')

  const scan = await scanProject()

  // ── Cache ─────────────────────────────────────────────────────────────────
  if (opts.refresh) invalidateCache()

  const existingCache = readCache()
  const cacheHit = existingCache && isCacheValid(existingCache, scan.files)

  if (!cacheHit) {
    writeCache(scan.files)
    if (!opts.json) info('Cache updated')
  } else if (!opts.json) {
    info(`Cache valid (scanned ${existingCache.scannedAt})`)
  }

  // ── Index + select ────────────────────────────────────────────────────────
  const index = buildFileIndex(scan.files)
  const ranked = selectRelevantFiles(task, index, { maxFiles })
  const ctx = buildContext(scan, ranked, { maxTokens })

  // ── Output ────────────────────────────────────────────────────────────────
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          task,
          scannedFiles: scan.totalFiles,
          selectedFiles: ctx.selectedFileCount,
          totalTokens: ctx.totalTokens,
          truncated: ctx.truncated,
          files: ranked.map(f => ({
            path: f.relativePath,
            score: f.score,
            reasons: f.reasons,
          })),
          context: formatContextForLLM(ctx),
        },
        null,
        2,
      ),
    )
    return
  }

  success(`Scanned ${scan.totalFiles} files, selected ${ctx.selectedFileCount}`)

  section('Ranked Files')
  for (const f of ranked) {
    const inContext = ctx.files.some(c => c.relativePath === f.relativePath)
    const marker = inContext ? fmt.green('✓') : fmt.dim('–')
    console.log(`  ${marker} ${fmt.bold(f.relativePath)} ${fmt.dim(`(score: ${f.score})`)}`)
    for (const reason of f.reasons) {
      log(fmt.dim(`    • ${reason}`))
    }
  }

  section('Token Budget')
  log(`Max tokens:   ${maxTokens.toLocaleString()}`)
  log(`Used tokens:  ${ctx.totalTokens.toLocaleString()} (~${Math.round((ctx.totalTokens / maxTokens) * 100)}%)`)
  log(`In context:   ${ctx.selectedFileCount} file(s)${ctx.truncated ? ' (budget limit reached)' : ''}`)

  section('Context Preview')
  const formatted = formatContextForLLM(ctx)
  const preview = formatted.split('\n').slice(0, 40).join('\n')
  console.log(fmt.dim(preview))
  if (formatted.split('\n').length > 40) {
    log(fmt.dim(`… (${estimateTokens(formatted).toLocaleString()} tokens total)`))
  }

  console.log()
  if (opts.refresh) {
    warn('Cache was refreshed (--refresh)')
  }
}
