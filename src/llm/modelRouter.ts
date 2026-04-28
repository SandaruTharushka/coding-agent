/**
 * Model router — resolves which provider+model to use for a given request.
 *
 * Priority order:
 *  1. CLI override (--provider, --model flags)
 *  2. Per-agent profile from config
 *  3. Default provider/model from config
 *  4. Built-in defaults (qwen / qwen-plus)
 */

import { loadAIConfig, getAgentProfile } from '../config/aiConfig.js'
import type { AgentPurpose } from './providers/types.js'
import { PROVIDERS } from './providers/providerRegistry.js'

export type { AgentPurpose }

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ModelProfile = AgentPurpose | 'default'

export interface ModelResolution {
  providerId: string
  model: string
  source: 'override' | 'profile' | 'config' | 'default'
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

export function resolveProviderAndModel(
  overrideProvider?: string,
  overrideModel?: string,
  purpose?: AgentPurpose,
): ModelResolution {
  // 1. Both explicitly overridden
  if (overrideProvider?.trim() && overrideModel?.trim()) {
    return { providerId: overrideProvider.trim(), model: overrideModel.trim(), source: 'override' }
  }

  const cfg = loadAIConfig()

  // 2. Per-agent profile
  if (purpose && purpose !== 'general') {
    const profile = getAgentProfile(purpose)
    const profileProvider = overrideProvider?.trim() ?? profile.providerId
    const profileModel = overrideModel?.trim() ?? profile.model
    return { providerId: profileProvider, model: profileModel, source: 'profile' }
  }

  // 3. Default from config
  const providerId = overrideProvider?.trim() ?? cfg.defaultProvider
  const model = overrideModel?.trim() ?? cfg.defaultModel
  if (providerId && model) {
    return { providerId, model, source: 'config' }
  }

  // 4. Built-in defaults
  return { providerId: 'qwen', model: 'qwen-plus', source: 'default' }
}

/** Convenience — returns just the model string (backward compat with old modelRouter). */
export function resolveModel(
  override?: string,
  profile?: ModelProfile,
): { model: string; source: string } {
  const purpose = profile === 'default' || !profile ? undefined : profile as AgentPurpose
  const resolution = resolveProviderAndModel(undefined, override, purpose)
  return { model: resolution.model, source: resolution.source }
}

export function getModel(override?: string, profile?: ModelProfile): string {
  return resolveModel(override, profile).model
}

// ─── Model registry ────────────────────────────────────────────────────────────

export const KNOWN_MODELS = [
  { id: 'qwen-plus', description: 'Balanced — speed and quality (recommended default)', providerId: 'qwen' },
  { id: 'qwen-max', description: 'Highest quality, slower', providerId: 'qwen' },
  { id: 'qwen-turbo', description: 'Fast, lower cost', providerId: 'qwen' },
  { id: 'qwen-long', description: 'Extended context window', providerId: 'qwen' },
  { id: 'gpt-4o', description: 'OpenAI — flagship multimodal', providerId: 'openai' },
  { id: 'gpt-4o-mini', description: 'OpenAI — fast, cost-effective', providerId: 'openai' },
  { id: 'gpt-4.1', description: 'OpenAI — latest GPT-4.1', providerId: 'openai' },
  { id: 'claude-sonnet-4-6', description: 'Anthropic — balanced', providerId: 'anthropic' },
  { id: 'claude-opus-4-7', description: 'Anthropic — most capable', providerId: 'anthropic' },
  { id: 'gemini-2.0-flash', description: 'Google — fast multimodal', providerId: 'gemini' },
  { id: 'deepseek-chat', description: 'DeepSeek — cost-effective', providerId: 'deepseek' },
  { id: 'deepseek-coder', description: 'DeepSeek — code specialist', providerId: 'deepseek' },
  { id: 'llama-3.3-70b-versatile', description: 'Groq — ultra-fast inference', providerId: 'groq' },
] as const

export type KnownModelId = (typeof KNOWN_MODELS)[number]['id']

export function isKnownModel(model: string): model is KnownModelId {
  return KNOWN_MODELS.some(m => m.id === model)
}

export function getModelsForProvider(providerId: string): string[] {
  const provider = PROVIDERS[providerId]
  if (!provider) return []
  if (provider.supportedModels.length > 0) return provider.supportedModels
  return KNOWN_MODELS.filter(m => m.providerId === providerId).map(m => m.id)
}
