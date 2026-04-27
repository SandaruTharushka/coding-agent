import { scanProjectFiles } from '../../src/context/projectScanner.js'
import { buildIndex } from '../../src/context/fileIndex.js'
import { selectRelevantFiles } from '../../src/context/relevanceSelector.js'
import { buildLLMContext } from '../../src/context/contextBuilder.js'
import { readCache, writeCache, validateCache, rebuildIndexFromCache } from '../../src/context/cache.js'
import { banner, success, info, warn, section, log, fmt } from '../output/formatter.js'
import type { ScanResult } from '../../src/context/projectScanner.js'
import type { FileIndex } from '../../src/context/fileIndex.js'

interface ContextOptions {
  json?: boolean
  refresh?: boolean
  maxFiles?: string
  maxTokens?: string
}

async function loadScanAndIndex(forceRefresh: boolean, quiet: boolean): Promise<{
  scan: ScanResult
  index: FileIndex
}> {
  if (!forceRefresh) {
    const cached = readCache()
    if (cached) {
      const validation = validateCache(cached)
      if (validation.valid) {
        if (!quiet) info('Using cached index (no changes detected)')
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
      if (!quiet) {
        warn(
          `Cache stale: ${validation.changedFiles.length} changed, ` +
          `${validation.missingFiles.length} missing — rescanning`,
        )
      }
    }
  }

  if (!quiet) info('Scanning project files...')
  const scan = await scanProjectFiles()
  const index = buildIndex(scan)
  writeCache(scan, index)
  if (!quiet) success(`Scanned ${scan.totalFiles} files, index built`)

  return { scan, index }
}

export async function contextCommand(task: string, opts: ContextOptions): Promise<void> {
  const maxFiles = parseInt(opts.maxFiles ?? '30', 10)
  const maxTokens = parseInt(opts.maxTokens ?? '40000', 10)
  const forceRefresh = opts.refresh === true

  if (!opts.json) banner('CONTEXT ENGINE')

  const { scan, index } = await loadScanAndIndex(forceRefresh, opts.json === true)

  const selected = selectRelevantFiles(task, index, { maxFiles, includeConfigs: true })
  const ctx = buildLLMContext(scan, index, { task, maxFiles, maxTokens })

  if (opts.json) {
    const output = {
      task,
      filesScanned: scan.totalFiles,
      filesSelected: selected.length,
      filesIncluded: ctx.filesIncluded,
      filesOmitted: ctx.filesOmitted,
      estimatedTokens: ctx.totalTokens,
      truncated: ctx.truncated,
      selected: selected.map(f => ({ path: f.relativePath, score: f.score, reasons: f.reasons })),
      context: ctx.text,
    }
    console.log(JSON.stringify(output, null, 2))
    return
  }

  section('Task')
  log(task)

  section('Scan Summary')
  log(`Files scanned:   ${scan.totalFiles}`)
  log(`Files selected:  ${selected.length}`)
  log(`Languages:       ${scan.languages.join(', ') || 'unknown'}`)

  section('Selected Files (by score)')
  const displayFiles = selected.slice(0, 20)
  for (const file of displayFiles) {
    const scoreStr = fmt.cyan(`[${file.score}]`)
    const reasonStr = fmt.dim(file.reasons.slice(0, 3).join(', '))
    console.log(`  ${scoreStr} ${file.relativePath}`)
    console.log(`        ${reasonStr}`)
  }
  if (selected.length > 20) {
    log(fmt.dim(`... and ${selected.length - 20} more`))
  }

  section('Token Budget')
  log(`Estimated tokens: ${fmt.bold(String(ctx.totalTokens))} / ${maxTokens}`)
  log(`Context size:     ${fmt.bold((ctx.text.length / 1024).toFixed(1))} KB`)
  if (ctx.truncated) {
    warn(`Budget exceeded — ${ctx.filesOmitted.length} file(s) omitted`)
    ctx.filesOmitted.slice(0, 5).forEach(f => log(fmt.dim(`  omitted: ${f}`)))
  }

  console.log()
  success('Context engine ready')
}
