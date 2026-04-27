import * as fs from 'fs'
import * as path from 'path'
import { estimateTokens, trimToBudget } from './tokenBudget.js'
import { maskSecrets } from './projectScanner.js'
import type { ScanResult } from './projectScanner.js'
import type { ScoredFile } from './relevanceSelector.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextFile {
  relativePath: string
  content: string
  lineStart?: number
  lineEnd?: number
  truncated: boolean
  tokens: number
}

export interface BuiltContext {
  summary: string
  fileTree: string
  files: ContextFile[]
  totalTokens: number
  truncated: boolean
  selectedFileCount: number
}

export interface ContextBuilderOptions {
  maxTokens?: number
  reserveTokens?: number
  maxChunkLines?: number
}

const DEFAULT_MAX_TOKENS = 40_000
const DEFAULT_RESERVE = 4_000
const DEFAULT_MAX_CHUNK_LINES = 500

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build a token-budgeted LLM context from a scan result and ranked file list.
 * Output is deterministic: given the same inputs the same files are included
 * in the same order.
 */
export function buildContext(
  scan: ScanResult,
  rankedFiles: ScoredFile[],
  options: ContextBuilderOptions = {},
): BuiltContext {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS
  const reserveTokens = options.reserveTokens ?? DEFAULT_RESERVE
  const maxChunkLines = options.maxChunkLines ?? DEFAULT_MAX_CHUNK_LINES

  const overhead = estimateTokens(scan.summary) + estimateTokens(scan.fileTree)
  const budgetForFiles = maxTokens - reserveTokens - overhead

  // Read and chunk files
  interface LoadedChunk {
    id: string
    content: string
    priority: number
    relativePath: string
    lineStart?: number
    lineEnd?: number
    isFileTruncated: boolean
  }

  const chunks: LoadedChunk[] = []

  for (let i = 0; i < rankedFiles.length; i++) {
    const ranked = rankedFiles[i]
    let raw: string
    try {
      raw = fs.readFileSync(ranked.path, 'utf8')
    } catch {
      continue
    }

    const content = maskSecrets(raw)
    const lines = content.split('\n')
    const isFileTruncated = lines.length > maxChunkLines

    const chunkContent = isFileTruncated
      ? lines.slice(0, maxChunkLines).join('\n') +
        `\n...(truncated — showing first ${maxChunkLines} of ${lines.length} lines)`
      : content

    chunks.push({
      id: ranked.relativePath,
      content: chunkContent,
      priority: rankedFiles.length - i, // higher index = lower priority
      relativePath: ranked.relativePath,
      lineStart: isFileTruncated ? 1 : undefined,
      lineEnd: isFileTruncated ? maxChunkLines : undefined,
      isFileTruncated,
    })
  }

  // Trim to token budget
  const trimmed = trimToBudget(chunks, budgetForFiles)
  const trimmedIds = new Set(trimmed.map(c => c.id))

  // Rebuild in original ranked order for deterministic output
  const contextFiles: ContextFile[] = []
  for (const chunk of chunks) {
    if (!trimmedIds.has(chunk.id)) continue
    const trimmedChunk = trimmed.find(c => c.id === chunk.id)!
    const wasBudgetTruncated = trimmedChunk.content !== chunk.content

    contextFiles.push({
      relativePath: chunk.relativePath,
      content: trimmedChunk.content,
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineEnd,
      truncated: chunk.isFileTruncated || wasBudgetTruncated,
      tokens: estimateTokens(trimmedChunk.content),
    })
  }

  const totalTokens = overhead + contextFiles.reduce((sum, f) => sum + f.tokens, 0)

  return {
    summary: scan.summary,
    fileTree: scan.fileTree,
    files: contextFiles,
    totalTokens,
    truncated: contextFiles.length < rankedFiles.length,
    selectedFileCount: contextFiles.length,
  }
}

// ─── Formatter ────────────────────────────────────────────────────────────────

/** Serialize a BuiltContext into a Markdown string ready for LLM consumption. */
export function formatContextForLLM(ctx: BuiltContext): string {
  const parts: string[] = [
    `## Project Summary\n${ctx.summary}`,
    `## Project Structure\n\`\`\`\n${ctx.fileTree}\n\`\`\``,
  ]

  for (const file of ctx.files) {
    const ext = path.extname(file.relativePath).slice(1) || 'text'
    const lineInfo =
      file.lineStart != null ? ` (lines ${file.lineStart}–${file.lineEnd})` : ''
    parts.push(
      `## File: ${file.relativePath}${lineInfo}\n\`\`\`${ext}\n${file.content}\n\`\`\``,
    )
  }

  return parts.join('\n\n')
}
