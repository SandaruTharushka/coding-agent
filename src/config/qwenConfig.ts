/**
 * Qwen configuration — backward-compatible wrapper around the unified aiConfig.
 *
 * All existing code that imports from qwenConfig continues to work unchanged.
 * New code should import from aiConfig directly.
 */

import * as fs from 'fs'
import * as path from 'path'
import { loadAIConfig, maskApiKey as maskKey } from './aiConfig.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QwenConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
  maxRetries: number
  maxTokens: number
  stream: boolean
}

export interface QwenConfigValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
}

// ─── .env loader ─────────────────────────────────────────────────────────────

/**
 * Load a .env file into process.env. Safe to call multiple times (idempotent).
 * Existing env vars are NOT overwritten (shell env takes priority).
 */
export function loadDotEnv(filePath = '.env'): void {
  const abs = path.resolve(filePath)
  if (!fs.existsSync(abs)) return
  const lines = fs.readFileSync(abs, 'utf8').split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const stripped = line.startsWith('export ') ? line.slice(7) : line
    const eq = stripped.indexOf('=')
    if (eq === -1) continue
    const key = stripped.slice(0, eq).trim()
    let val = stripped.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    const commentIdx = val.indexOf(' #')
    if (commentIdx !== -1) val = val.slice(0, commentIdx).trim()
    if (key && !process.env[key]) {
      process.env[key] = val
    }
  }
}

// ─── Config loader ────────────────────────────────────────────────────────────

export function loadQwenConfig(): QwenConfig {
  const ai = loadAIConfig()
  const qwenKey = ai.providerApiKeys['qwen'] ?? ''
  const qwenUrl = ai.providerBaseUrls['qwen'] ?? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'

  // Use default model only if it's a qwen model, otherwise fall back to qwen-plus
  const isQwenModel = ai.defaultProvider === 'qwen' ||
    ai.defaultModel.startsWith('qwen')
  const model = isQwenModel ? ai.defaultModel : (process.env.QWEN_MODEL ?? 'qwen-plus')

  return {
    apiKey: qwenKey,
    baseUrl: qwenUrl,
    model,
    timeoutMs: ai.timeoutMs,
    maxRetries: ai.maxRetries,
    maxTokens: ai.maxTokens,
    stream: ai.stream,
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateQwenConfig(config: QwenConfig): QwenConfigValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (!config.apiKey) {
    errors.push('QWEN_API_KEY is required but not set')
  }
  if (!config.baseUrl.startsWith('http')) {
    errors.push('QWEN_BASE_URL must be a valid HTTP(S) URL')
  }
  if (!config.model.trim()) {
    errors.push('QWEN_MODEL must not be empty')
  }
  if (config.timeoutMs < 1_000) {
    warnings.push(`QWEN_TIMEOUT_MS=${config.timeoutMs} is very low — consider >= 5000`)
  }
  if (config.maxTokens > 32_768) {
    warnings.push(`QWEN_MAX_TOKENS=${config.maxTokens} exceeds typical model limits`)
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function maskApiKey(key: string): string {
  return maskKey(key)
}

export function configToDisplayRows(config: QwenConfig): Array<[string, string]> {
  return [
    ['QWEN_API_KEY', maskApiKey(config.apiKey)],
    ['QWEN_BASE_URL', config.baseUrl],
    ['QWEN_MODEL', config.model],
    ['QWEN_TIMEOUT_MS', String(config.timeoutMs)],
    ['QWEN_MAX_RETRIES', String(config.maxRetries)],
    ['QWEN_MAX_TOKENS', String(config.maxTokens)],
    ['QWEN_STREAM', String(config.stream)],
  ]
}
