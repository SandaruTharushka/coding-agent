/**
 * Model router for the Qwen coding agent.
 *
 * Supports:
 *  - A default model from centralized config
 *  - Per-command model overrides
 *  - Named profiles (coder / planner / tester) from env vars
 */

import { loadQwenConfig } from '../config/qwenConfig.js'

// ─── Types ─────────────────────────────────────────────────────────────────

export type ModelProfile = 'default' | 'coder' | 'planner' | 'tester'

export interface ModelResolution {
  model: string
  source: 'override' | 'profile' | 'config' | 'default'
}

// ─── Profile env-var mapping ──────────────────────────────────────────────

const PROFILE_ENV: Record<Exclude<ModelProfile, 'default'>, string> = {
  coder: 'QWEN_CODER_MODEL',
  planner: 'QWEN_PLANNER_MODEL',
  tester: 'QWEN_TESTER_MODEL',
}

// ─── Resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve the model to use, in priority order:
 *  1. Explicit override (e.g. --model flag)
 *  2. Profile-specific env var (QWEN_CODER_MODEL, QWEN_PLANNER_MODEL, …)
 *  3. QWEN_MODEL from centralized config
 */
export function resolveModel(override?: string, profile?: ModelProfile): ModelResolution {
  if (override?.trim()) {
    return { model: override.trim(), source: 'override' }
  }

  if (profile && profile !== 'default') {
    const envKey = PROFILE_ENV[profile]
    const profileModel = process.env[envKey]
    if (profileModel?.trim()) {
      return { model: profileModel.trim(), source: 'profile' }
    }
  }

  const config = loadQwenConfig()
  if (config.model) {
    return { model: config.model, source: 'config' }
  }

  return { model: 'qwen-plus', source: 'default' }
}

/**
 * Convenience: return just the model string.
 */
export function getModel(override?: string, profile?: ModelProfile): string {
  return resolveModel(override, profile).model
}

// ─── Available models registry ─────────────────────────────────────────────

export const KNOWN_MODELS = [
  { id: 'qwen-plus', description: 'Balanced — speed and quality (recommended default)' },
  { id: 'qwen-max', description: 'Highest quality, slower' },
  { id: 'qwen-turbo', description: 'Fast, lower cost' },
  { id: 'qwen-long', description: 'Extended context window' },
] as const

export type KnownModelId = (typeof KNOWN_MODELS)[number]['id']

export function isKnownModel(model: string): model is KnownModelId {
  return KNOWN_MODELS.some(m => m.id === model)
}
