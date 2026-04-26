/**
 * Centralized Qwen configuration loader.
 *
 * All other modules must obtain Qwen settings exclusively through this module.
 * Never read QWEN_* env vars directly elsewhere.
 */

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS = {
  baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  model: 'qwen-plus',
  timeoutMs: 60_000,
  maxRetries: 3,
  maxTokens: 8192,
  stream: true,
} as const

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

import * as fs from 'fs'
import * as path from 'path'

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
    // Strip optional "export " prefix
    const stripped = line.startsWith('export ') ? line.slice(7) : line
    const eq = stripped.indexOf('=')
    if (eq === -1) continue
    const key = stripped.slice(0, eq).trim()
    let val = stripped.slice(eq + 1).trim()
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    // Remove inline comments (e.g. value # comment)
    const commentIdx = val.indexOf(' #')
    if (commentIdx !== -1) val = val.slice(0, commentIdx).trim()
    if (key && !process.env[key]) {
      process.env[key] = val
    }
  }
}

// ─── Config loader ────────────────────────────────────────────────────────────

/**
 * Read and return the Qwen configuration from environment variables.
 * Call loadDotEnv() before this if you need .env support.
 */
export function loadQwenConfig(): QwenConfig {
  return {
    apiKey: process.env.QWEN_API_KEY ?? '',
    baseUrl: process.env.QWEN_BASE_URL ?? DEFAULTS.baseUrl,
    model: process.env.QWEN_MODEL ?? DEFAULTS.model,
    timeoutMs: parsePositiveInt(process.env.QWEN_TIMEOUT_MS, DEFAULTS.timeoutMs),
    maxRetries: parseNonNegativeInt(process.env.QWEN_MAX_RETRIES, DEFAULTS.maxRetries),
    maxTokens: parsePositiveInt(process.env.QWEN_MAX_TOKENS, DEFAULTS.maxTokens),
    stream: process.env.QWEN_STREAM !== 'false',
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
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
  if (!key) return '(not set)'
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}****${key.slice(-4)}`
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
