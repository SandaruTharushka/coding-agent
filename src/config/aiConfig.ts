/**
 * Unified AI configuration loader.
 *
 * Reads from (in priority order):
 *  1. Shell environment variables
 *  2. .env file (loaded once at CLI startup)
 *  3. .qwen-agent/ai-config.json (persistent per-project config)
 *  4. Built-in defaults
 *
 * Backward compatible: QWEN_API_KEY and all QWEN_* env vars continue to work.
 */

import * as fs from 'fs'
import * as path from 'path'
import { PROVIDERS, getProvider } from '../llm/providers/providerRegistry.js'
import type { ModelProfile, AgentPurpose } from '../llm/providers/types.js'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AgentModelProfile {
  providerId: string
  model: string
  maxTokens?: number
  temperature?: number
}

export interface AIConfig {
  defaultProvider: string
  defaultModel: string
  providerApiKeys: Record<string, string>
  providerBaseUrls: Record<string, string>
  agentProfiles: Record<AgentPurpose, AgentModelProfile>
  maxTokens: number
  timeoutMs: number
  maxRetries: number
  stream: boolean
}

export interface AIConfigValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
}

// ─── Storage path ──────────────────────────────────────────────────────────────

const CONFIG_DIR = '.qwen-agent'
const CONFIG_FILE = 'ai-config.json'

function getConfigPath(): string {
  return path.resolve(CONFIG_DIR, CONFIG_FILE)
}

// ─── Persistent config file ────────────────────────────────────────────────────

interface PersistedConfig {
  defaultProvider?: string
  defaultModel?: string
  providerApiKeys?: Record<string, string>
  providerBaseUrls?: Record<string, string>
  agentProfiles?: Record<string, AgentModelProfile>
  maxTokens?: number
  timeoutMs?: number
  maxRetries?: number
  stream?: boolean
}

function loadPersistedConfig(): PersistedConfig {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as PersistedConfig
  } catch {
    return {}
  }
}

export function savePersistedConfig(updates: Partial<PersistedConfig>): void {
  const configPath = getConfigPath()
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const existing = loadPersistedConfig()
  const merged: PersistedConfig = {
    ...existing,
    ...updates,
    providerApiKeys: { ...existing.providerApiKeys, ...updates.providerApiKeys },
    providerBaseUrls: { ...existing.providerBaseUrls, ...updates.providerBaseUrls },
    agentProfiles: { ...existing.agentProfiles, ...updates.agentProfiles },
  }

  // Never persist raw API keys to the config file — store in .env instead
  // The file stores non-sensitive config only; keys come from env at runtime
  const safeConfig: PersistedConfig = { ...merged }
  delete safeConfig.providerApiKeys

  const tmp = configPath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(safeConfig, null, 2), 'utf8')
  fs.renameSync(tmp, configPath)
}

export function saveProviderKey(providerId: string, apiKey: string): void {
  const envFile = path.resolve('.env')
  const provider = getProvider(providerId)
  if (!provider?.apiKeyEnvName) return

  const envVar = provider.apiKeyEnvName
  const line = `${envVar}=${apiKey}`

  if (fs.existsSync(envFile)) {
    let content = fs.readFileSync(envFile, 'utf8')
    const regex = new RegExp(`^${envVar}=.*`, 'm')
    if (regex.test(content)) {
      content = content.replace(regex, line)
    } else {
      content = content.trimEnd() + `\n${line}\n`
    }
    fs.writeFileSync(envFile, content, 'utf8')
  } else {
    fs.writeFileSync(envFile, `${line}\n`, 'utf8')
  }

  // Ensure .gitignore covers .env
  const gi = '.gitignore'
  if (fs.existsSync(gi)) {
    const giContent = fs.readFileSync(gi, 'utf8')
    if (!giContent.includes('.env')) {
      fs.appendFileSync(gi, '\n.env\n')
    }
  }
}

// ─── Config loader ─────────────────────────────────────────────────────────────

const DEFAULTS = {
  defaultProvider: 'qwen',
  defaultModel: 'qwen-plus',
  maxTokens: 8192,
  timeoutMs: 60_000,
  maxRetries: 3,
  stream: true,
} as const

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function loadAIConfig(): AIConfig {
  const persisted = loadPersistedConfig()

  // Resolve default provider: env > persisted > QWEN compat > default
  const defaultProvider =
    process.env.AI_DEFAULT_PROVIDER ??
    persisted.defaultProvider ??
    DEFAULTS.defaultProvider

  const defaultModel =
    process.env.AI_DEFAULT_MODEL ??
    process.env.QWEN_MODEL ??
    persisted.defaultModel ??
    DEFAULTS.defaultModel

  // Collect API keys from environment (shell env always takes priority)
  const providerApiKeys: Record<string, string> = {}
  for (const provider of Object.values(PROVIDERS)) {
    if (provider.apiKeyEnvName) {
      const key = process.env[provider.apiKeyEnvName] ?? ''
      if (key) providerApiKeys[provider.id] = key
    }
  }

  // Collect base URL overrides from environment and persisted config
  const providerBaseUrls: Record<string, string> = { ...persisted.providerBaseUrls }
  if (process.env.QWEN_BASE_URL) providerBaseUrls['qwen'] = process.env.QWEN_BASE_URL
  if (process.env.OPENAI_BASE_URL) providerBaseUrls['openai'] = process.env.OPENAI_BASE_URL
  if (process.env.ANTHROPIC_BASE_URL) providerBaseUrls['anthropic'] = process.env.ANTHROPIC_BASE_URL
  if (process.env.OLLAMA_BASE_URL) providerBaseUrls['ollama'] = process.env.OLLAMA_BASE_URL

  // Per-agent profiles from persisted config + env overrides
  const agentProfiles: Record<AgentPurpose, AgentModelProfile> = {
    coordinator: { providerId: defaultProvider, model: defaultModel },
    architect: { providerId: defaultProvider, model: defaultModel },
    coder: { providerId: defaultProvider, model: defaultModel },
    tester: { providerId: defaultProvider, model: defaultModel },
    reviewer: { providerId: defaultProvider, model: defaultModel },
    general: { providerId: defaultProvider, model: defaultModel },
    ...(persisted.agentProfiles as Record<AgentPurpose, AgentModelProfile> | undefined),
  }

  // Legacy QWEN_*_MODEL env var overrides
  if (process.env.QWEN_CODER_MODEL) agentProfiles.coder = { providerId: 'qwen', model: process.env.QWEN_CODER_MODEL }
  if (process.env.QWEN_PLANNER_MODEL) agentProfiles.architect = { providerId: 'qwen', model: process.env.QWEN_PLANNER_MODEL }
  if (process.env.QWEN_TESTER_MODEL) agentProfiles.tester = { providerId: 'qwen', model: process.env.QWEN_TESTER_MODEL }

  return {
    defaultProvider,
    defaultModel,
    providerApiKeys,
    providerBaseUrls,
    agentProfiles,
    maxTokens: parsePositiveInt(process.env.QWEN_MAX_TOKENS, persisted.maxTokens ?? DEFAULTS.maxTokens),
    timeoutMs: parsePositiveInt(process.env.QWEN_TIMEOUT_MS, persisted.timeoutMs ?? DEFAULTS.timeoutMs),
    maxRetries: parseNonNegativeInt(process.env.QWEN_MAX_RETRIES, persisted.maxRetries ?? DEFAULTS.maxRetries),
    stream: process.env.QWEN_STREAM !== 'false' && (persisted.stream ?? DEFAULTS.stream),
  }
}

// ─── Provider key helpers ──────────────────────────────────────────────────────

export function getProviderApiKey(providerId: string): string {
  const cfg = loadAIConfig()
  return cfg.providerApiKeys[providerId] ?? ''
}

export function getProviderBaseUrl(providerId: string): string {
  const cfg = loadAIConfig()
  return cfg.providerBaseUrls[providerId] ?? getProvider(providerId)?.baseUrl ?? ''
}

export function getAgentProfile(purpose: AgentPurpose): AgentModelProfile {
  const cfg = loadAIConfig()
  return cfg.agentProfiles[purpose] ?? {
    providerId: cfg.defaultProvider,
    model: cfg.defaultModel,
  }
}

// ─── Validation ────────────────────────────────────────────────────────────────

export function validateAIConfig(cfg: AIConfig): AIConfigValidation {
  const errors: string[] = []
  const warnings: string[] = []

  const provider = getProvider(cfg.defaultProvider)
  if (!provider) {
    errors.push(`Unknown default provider: "${cfg.defaultProvider}"`)
  } else if (provider.apiKeyEnvName && !cfg.providerApiKeys[cfg.defaultProvider]) {
    errors.push(`${provider.apiKeyEnvName} is required for provider "${cfg.defaultProvider}" but not set`)
  }

  if (!cfg.defaultModel.trim()) {
    errors.push('defaultModel must not be empty')
  }
  if (cfg.timeoutMs < 1_000) {
    warnings.push(`timeoutMs=${cfg.timeoutMs} is very low — consider >= 5000`)
  }
  if (cfg.maxTokens > 32_768) {
    warnings.push(`maxTokens=${cfg.maxTokens} exceeds typical model limits`)
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ─── Display helpers ───────────────────────────────────────────────────────────

export function maskApiKey(key: string): string {
  if (!key) return '(not set)'
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}****${key.slice(-4)}`
}

export function getProviderStatus(cfg: AIConfig): Array<{
  id: string
  name: string
  status: 'connected' | 'missing-key' | 'no-key-required'
  maskedKey: string
}> {
  return Object.values(PROVIDERS).map(p => {
    const key = cfg.providerApiKeys[p.id] ?? ''
    const noKeyRequired = p.authType === 'none'
    return {
      id: p.id,
      name: p.name,
      status: noKeyRequired ? 'no-key-required' : key ? 'connected' : 'missing-key',
      maskedKey: noKeyRequired ? 'n/a' : maskApiKey(key),
    }
  })
}

export function setDefaultProvider(providerId: string, model: string): void {
  savePersistedConfig({ defaultProvider: providerId, defaultModel: model })
}

export function setAgentProfile(purpose: AgentPurpose, providerId: string, model: string, opts?: { maxTokens?: number; temperature?: number }): void {
  const existing = loadPersistedConfig()
  savePersistedConfig({
    agentProfiles: {
      ...existing.agentProfiles,
      [purpose]: { providerId, model, ...opts },
    },
  })
}

export function removeProviderKey(providerId: string): void {
  const provider = getProvider(providerId)
  if (!provider?.apiKeyEnvName) return

  const envFile = path.resolve('.env')
  if (!fs.existsSync(envFile)) return

  const envVar = provider.apiKeyEnvName
  const regex = new RegExp(`^${envVar}=.*\n?`, 'm')
  const content = fs.readFileSync(envFile, 'utf8').replace(regex, '')
  fs.writeFileSync(envFile, content, 'utf8')
}
