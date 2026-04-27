import * as fs from 'fs'
import * as path from 'path'
import type { FileIndex } from './fileIndex.js'
import type { ScanResult } from './projectScanner.js'
import { selectRelevantFiles } from './relevanceSelector.js'
import { estimateTokens, trimToBudget } from './tokenBudget.js'
import type { BudgetChunk } from './tokenBudget.js'

const CHUNK_SIZE_CHARS = 6_000
const DEFAULT_MAX_TOKENS = 40_000
const RESERVE_TOKENS = 4_000

export interface ContextChunk extends BudgetChunk {
  filePath: string
  lineStart?: number
  lineEnd?: number
}

export interface BuiltContext {
  text: string
  filesIncluded: string[]
  filesOmitted: string[]
  totalTokens: number
  truncated: boolean
}

export interface BuildOptions {
  maxTokens?: number
  maxFiles?: number
  task?: string
  includeConfigs?: boolean
}

function chunkFile(relativePath: string, content: string, basePriority: number): ContextChunk[] {
  if (content.length <= CHUNK_SIZE_CHARS) {
    return [{ id: relativePath, content, priority: basePriority, filePath: relativePath }]
  }

  const lines = content.split('\n')
  const chunks: ContextChunk[] = []
  let lineStart = 0
  let chunkIdx = 0

  while (lineStart < lines.length) {
    let chars = 0
    let lineEnd = lineStart
    while (lineEnd < lines.length && chars + lines[lineEnd].length < CHUNK_SIZE_CHARS) {
      chars += lines[lineEnd].length + 1
      lineEnd++
    }

    chunks.push({
      id: `${relativePath}#${chunkIdx}`,
      content: lines.slice(lineStart, lineEnd).join('\n'),
      priority: basePriority - chunkIdx * 2,
      filePath: relativePath,
      lineStart: lineStart + 1,
      lineEnd,
    })

    lineStart = lineEnd
    chunkIdx++
  }

  return chunks
}

function buildProjectSummary(scan: ScanResult, selectedCount: number): string {
  return [
    `Project root: ${scan.root}`,
    `Total files scanned: ${scan.totalFiles}`,
    `Languages: ${scan.languages.join(', ') || 'unknown'}`,
    `Files in context: ${selectedCount}`,
    `Scanned at: ${scan.scannedAt.toISOString()}`,
  ].join('\n')
}

export function buildLLMContext(
  scan: ScanResult,
  index: FileIndex,
  options: BuildOptions = {},
): BuiltContext {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS
  const task = options.task ?? ''

  const selected = selectRelevantFiles(task, index, {
    maxFiles: options.maxFiles ?? 40,
    includeConfigs: options.includeConfigs,
  })

  const projectSummary = buildProjectSummary(scan, selected.length)
  const headerTokens = estimateTokens(projectSummary) + estimateTokens(scan.fileTree) + 200
  const availableForFiles = maxTokens - headerTokens - RESERVE_TOKENS

  const allChunks: ContextChunk[] = []
  for (const sf of selected) {
    let content: string
    try {
      content = fs.readFileSync(sf.path, 'utf8')
    } catch {
      continue
    }
    allChunks.push(...chunkFile(sf.relativePath, content, sf.score))
  }

  const keptChunks = trimToBudget(allChunks, availableForFiles)
  const keptPaths = new Set(keptChunks.map(c => c.filePath))

  const filesIncluded = selected.filter(sf => keptPaths.has(sf.relativePath)).map(sf => sf.relativePath)
  const filesOmitted = selected.filter(sf => !keptPaths.has(sf.relativePath)).map(sf => sf.relativePath)

  const parts: string[] = [
    `## Project Summary\n${projectSummary}`,
    `## File Tree\n\`\`\`\n${scan.fileTree}\n\`\`\``,
  ]

  const chunksByFile = new Map<string, ContextChunk[]>()
  for (const chunk of keptChunks) {
    if (!chunksByFile.has(chunk.filePath)) chunksByFile.set(chunk.filePath, [])
    chunksByFile.get(chunk.filePath)!.push(chunk)
  }

  for (const [filePath, chunks] of chunksByFile) {
    const ext = path.extname(filePath).slice(1) || 'text'
    for (const chunk of chunks) {
      const header = chunk.lineStart !== undefined
        ? `## File: ${filePath} (lines ${chunk.lineStart}–${chunk.lineEnd})`
        : `## File: ${filePath}`
      parts.push(`${header}\n\`\`\`${ext}\n${chunk.content}\n\`\`\``)
    }
  }

  const text = parts.join('\n\n')
  return {
    text,
    filesIncluded,
    filesOmitted,
    totalTokens: estimateTokens(text),
    truncated: filesOmitted.length > 0,
  }
}

/**
 * Build context focused on changed files and their related files.
 * Used by the reviewer agent.
 */
export function buildReviewContext(
  changedFiles: string[],
  scan: ScanResult,
  index: FileIndex,
  options: BuildOptions = {},
): BuiltContext {
  const changedTask = changedFiles
    .map(f => path.basename(f, path.extname(f)))
    .join(' ')

  return buildLLMContext(scan, index, {
    ...options,
    task: changedTask,
    maxFiles: options.maxFiles ?? 20,
  })
}
