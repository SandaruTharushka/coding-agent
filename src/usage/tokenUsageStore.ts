/**
 * Token usage store.
 * Persists usage records to .qwen-agent/usage/token-usage.json.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { TokenUsage } from '../llm/providers/types.js'
import { estimateCost } from './costEstimator.js'

// ─── Storage ───────────────────────────────────────────────────────────────────

const USAGE_DIR = path.resolve('.qwen-agent', 'usage')
const USAGE_FILE = path.join(USAGE_DIR, 'token-usage.json')

function ensureDir(): void {
  if (!fs.existsSync(USAGE_DIR)) fs.mkdirSync(USAGE_DIR, { recursive: true })
}

function loadRecords(): TokenUsage[] {
  if (!fs.existsSync(USAGE_FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')) as TokenUsage[]
  } catch {
    return []
  }
}

function saveRecords(records: TokenUsage[]): void {
  ensureDir()
  const tmp = USAGE_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf8')
  fs.renameSync(tmp, USAGE_FILE)
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── Estimate tokens locally if provider didn't report ─────────────────────────

function estimateTokenCount(text: string): number {
  // ~4 chars per token (rough approximation)
  return Math.ceil(text.length / 4)
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface RecordUsageInput {
  providerId: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens?: number
  agentName?: string
  taskId?: string
  /** Raw request/response text for local estimation if tokens are 0 */
  inputText?: string
  outputText?: string
}

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  let { inputTokens, outputTokens } = input

  // Local estimation fallback when provider doesn't report usage
  if (inputTokens === 0 && input.inputText) {
    inputTokens = estimateTokenCount(input.inputText)
  }
  if (outputTokens === 0 && input.outputText) {
    outputTokens = estimateTokenCount(input.outputText)
  }

  const totalTokens = input.totalTokens ?? inputTokens + outputTokens
  const estimatedCost = estimateCost(input.providerId, input.model, inputTokens, outputTokens)

  const record: TokenUsage = {
    id: generateId(),
    providerId: input.providerId,
    model: input.model,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCost,
    agentName: input.agentName,
    taskId: input.taskId,
    timestamp: new Date().toISOString(),
  }

  const records = loadRecords()
  records.push(record)
  saveRecords(records)
}

// ─── Summary types ─────────────────────────────────────────────────────────────

export interface UsageSummary {
  totalRecords: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalEstimatedCost: number | null
  byProvider: Record<string, {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCost: number | null
    calls: number
  }>
  byModel: Record<string, {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCost: number | null
    calls: number
  }>
}

export function getUsageSummary(): UsageSummary {
  const records = loadRecords()

  const byProvider: UsageSummary['byProvider'] = {}
  const byModel: UsageSummary['byModel'] = {}
  let totalInput = 0
  let totalOutput = 0
  let totalCost = 0
  let hasCost = false

  for (const r of records) {
    totalInput += r.inputTokens
    totalOutput += r.outputTokens
    if (r.estimatedCost !== null) { totalCost += r.estimatedCost; hasCost = true }

    // By provider
    if (!byProvider[r.providerId]) {
      byProvider[r.providerId] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: null, calls: 0 }
    }
    const p = byProvider[r.providerId]
    p.inputTokens += r.inputTokens
    p.outputTokens += r.outputTokens
    p.totalTokens += r.totalTokens
    if (r.estimatedCost !== null) {
      p.estimatedCost = (p.estimatedCost ?? 0) + r.estimatedCost
    }
    p.calls++

    // By model
    const modelKey = `${r.providerId}/${r.model}`
    if (!byModel[modelKey]) {
      byModel[modelKey] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: null, calls: 0 }
    }
    const m = byModel[modelKey]
    m.inputTokens += r.inputTokens
    m.outputTokens += r.outputTokens
    m.totalTokens += r.totalTokens
    if (r.estimatedCost !== null) {
      m.estimatedCost = (m.estimatedCost ?? 0) + r.estimatedCost
    }
    m.calls++
  }

  return {
    totalRecords: records.length,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    totalEstimatedCost: hasCost ? totalCost : null,
    byProvider,
    byModel,
  }
}

export function getUsageByProvider(providerId: string): TokenUsage[] {
  return loadRecords().filter(r => r.providerId === providerId)
}

export function getUsageByModel(model: string): TokenUsage[] {
  return loadRecords().filter(r => r.model === model)
}

export function getUsageByTask(taskId: string): TokenUsage[] {
  return loadRecords().filter(r => r.taskId === taskId)
}

export function getAllUsage(): TokenUsage[] {
  return loadRecords()
}

export function clearUsage(): void {
  saveRecords([])
}
