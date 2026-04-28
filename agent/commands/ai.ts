import * as readline from 'readline'
import { listProviders, getProvider } from '../../src/llm/providers/providerRegistry.js'
import {
  loadAIConfig,
  validateAIConfig,
  maskApiKey,
  getProviderStatus,
  saveProviderKey,
  removeProviderKey,
  setDefaultProvider,
  setAgentProfile,
  getProviderApiKey,
} from '../../src/config/aiConfig.js'
import { testProviderConnection } from '../../src/llm/unifiedLLMClient.js'
import { getModelsForProvider } from '../../src/llm/modelRouter.js'
import type { AgentPurpose } from '../../src/llm/providers/types.js'
import { banner, section, success, error, warn, info, fmt } from '../output/formatter.js'

// ─── ai providers ─────────────────────────────────────────────────────────────

export function aiProvidersCommand(): void {
  banner('AI PROVIDERS')
  const cfg = loadAIConfig()
  const statuses = getProviderStatus(cfg)

  const w0 = 12, w1 = 22, w2 = 12, w3 = 20
  console.log(
    '  ' +
    fmt.bold('ID'.padEnd(w0)) +
    fmt.bold('Name'.padEnd(w1)) +
    fmt.bold('Status'.padEnd(w2)) +
    fmt.bold('Key'),
  )
  console.log('  ' + '─'.repeat(w0 + w1 + w2 + w3))

  for (const s of statuses) {
    const isDefault = s.id === cfg.defaultProvider
    const statusIcon =
      s.status === 'connected' ? fmt.green('✓ connected')
      : s.status === 'no-key-required' ? fmt.cyan('✓ local')
      : fmt.red('✗ missing key')

    const idDisplay = isDefault ? fmt.bold(fmt.cyan(s.id.padEnd(w0))) : s.id.padEnd(w0)
    console.log(
      '  ' + idDisplay + s.name.padEnd(w1) + statusIcon.padEnd(w2 + 10) + s.maskedKey,
    )
  }

  console.log()
  info(`Default provider: ${fmt.bold(cfg.defaultProvider)} / ${fmt.bold(cfg.defaultModel)}`)
  info('Run: qwen-agent ai config set-default --provider <id> --model <model>')
}

// ─── ai config show ───────────────────────────────────────────────────────────

export function aiConfigShowCommand(): void {
  banner('AI CONFIGURATION')
  const cfg = loadAIConfig()

  section('Default')
  console.log(`  ${fmt.cyan('Provider'.padEnd(16))} ${cfg.defaultProvider}`)
  console.log(`  ${fmt.cyan('Model'.padEnd(16))} ${cfg.defaultModel}`)
  console.log(`  ${fmt.cyan('Max Tokens'.padEnd(16))} ${cfg.maxTokens}`)
  console.log(`  ${fmt.cyan('Timeout'.padEnd(16))} ${cfg.timeoutMs}ms`)
  console.log(`  ${fmt.cyan('Max Retries'.padEnd(16))} ${cfg.maxRetries}`)
  console.log(`  ${fmt.cyan('Stream'.padEnd(16))} ${cfg.stream}`)

  section('Agent Model Profiles')
  const purposes: AgentPurpose[] = ['coordinator', 'architect', 'coder', 'tester', 'reviewer']
  for (const p of purposes) {
    const profile = cfg.agentProfiles[p]
    if (profile) {
      console.log(
        `  ${fmt.cyan(p.padEnd(14))} ${profile.providerId}/${profile.model}`,
      )
    }
  }

  section('Provider API Keys')
  const statuses = getProviderStatus(cfg)
  for (const s of statuses) {
    const icon = s.status === 'connected' || s.status === 'no-key-required'
      ? fmt.green('✓')
      : fmt.red('✗')
    console.log(`  ${icon} ${s.id.padEnd(14)} ${s.maskedKey}`)
  }

  const { valid, errors, warnings } = validateAIConfig(cfg)
  console.log()
  if (valid) success('Configuration is valid')
  else errors.forEach(e => error(e))
  warnings.forEach(w => warn(w))
}

// ─── ai config set-default ────────────────────────────────────────────────────

export function aiConfigSetDefaultCommand(opts: { provider?: string; model?: string }): void {
  const cfg = loadAIConfig()
  const providerId = opts.provider ?? cfg.defaultProvider
  const model = opts.model ?? cfg.defaultModel

  const provider = getProvider(providerId)
  if (!provider) {
    error(`Unknown provider: "${providerId}"`)
    info(`Available: ${listProviders().map(p => p.id).join(', ')}`)
    process.exit(1)
  }

  setDefaultProvider(providerId, model)
  success(`Default set to: ${fmt.bold(providerId)} / ${fmt.bold(model)}`)
  info('Run: qwen-agent ai config show  to verify')
}

// ─── ai key set ───────────────────────────────────────────────────────────────

export async function aiKeySetCommand(opts: { provider?: string }): Promise<void> {
  banner('SET API KEY')

  const providerId = opts.provider ?? 'qwen'
  const provider = getProvider(providerId)
  if (!provider) {
    error(`Unknown provider: "${providerId}"`)
    process.exit(1)
  }

  if (provider.authType === 'none') {
    warn(`${provider.name} does not require an API key`)
    return
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const apiKey = await new Promise<string>(resolve => {
    rl.question(`Enter API key for ${provider.name} (${provider.apiKeyEnvName}): `, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })

  if (!apiKey) {
    error('No API key provided')
    process.exit(1)
  }

  saveProviderKey(providerId, apiKey)
  success(`.env updated — ${provider.apiKeyEnvName}: ${maskApiKey(apiKey)}`)
  info('Reload your shell or restart the agent to pick up the new key.')
}

// ─── ai key remove ────────────────────────────────────────────────────────────

export function aiKeyRemoveCommand(opts: { provider?: string }): void {
  const providerId = opts.provider ?? 'qwen'
  const provider = getProvider(providerId)
  if (!provider) {
    error(`Unknown provider: "${providerId}"`)
    process.exit(1)
  }

  removeProviderKey(providerId)
  success(`Removed key for ${provider.name} from .env`)
}

// ─── ai models ────────────────────────────────────────────────────────────────

export function aiModelsCommand(opts: { provider?: string }): void {
  const providerId = opts.provider ?? 'qwen'
  const provider = getProvider(providerId)
  if (!provider) {
    error(`Unknown provider: "${providerId}"`)
    process.exit(1)
  }

  banner(`MODELS — ${provider.name}`)
  const models = getModelsForProvider(providerId)

  if (models.length === 0) {
    info(`${provider.name} supports dynamic models. Check their documentation for available model IDs.`)
    return
  }

  const cfg = loadAIConfig()
  for (const m of models) {
    const isDefault = m === cfg.defaultModel && providerId === cfg.defaultProvider
    const marker = isDefault ? fmt.green('*') : ' '
    const pricing = provider.pricing?.[m]
    const priceStr = pricing
      ? fmt.dim(`  $${pricing.inputPer1kTokens}/1k in  $${pricing.outputPer1kTokens}/1k out`)
      : ''
    console.log(`  ${marker} ${fmt.bold(m)}${priceStr}`)
  }
}

// ─── ai test ──────────────────────────────────────────────────────────────────

export async function aiTestCommand(opts: { provider?: string; model?: string }): Promise<void> {
  const cfg = loadAIConfig()
  const providerId = opts.provider ?? cfg.defaultProvider
  const model = opts.model ?? cfg.defaultModel

  const provider = getProvider(providerId)
  if (!provider) {
    error(`Unknown provider: "${providerId}"`)
    process.exit(1)
  }

  banner(`TEST CONNECTION — ${provider.name}`)
  info(`Provider: ${fmt.bold(providerId)}`)
  info(`Model:    ${fmt.bold(model)}`)
  console.log()

  process.stdout.write('  Testing connection… ')
  const result = await testProviderConnection(providerId, model)

  if (result.success) {
    console.log(fmt.green('OK') + fmt.dim(` (${result.latencyMs}ms)`))
    success(`${provider.name} is reachable and responding`)
  } else {
    console.log(fmt.red('FAILED'))
    error(result.error ?? 'Unknown error')
    process.exit(1)
  }
}

// ─── ai profile set ───────────────────────────────────────────────────────────

export function aiProfileSetCommand(opts: {
  agent?: string
  provider?: string
  model?: string
}): void {
  const validAgents: AgentPurpose[] = ['coordinator', 'architect', 'coder', 'tester', 'reviewer', 'general']

  if (!opts.agent) {
    error('--agent is required')
    info(`Valid agents: ${validAgents.join(', ')}`)
    process.exit(1)
  }

  if (!validAgents.includes(opts.agent as AgentPurpose)) {
    error(`Unknown agent: "${opts.agent}"`)
    info(`Valid agents: ${validAgents.join(', ')}`)
    process.exit(1)
  }

  const cfg = loadAIConfig()
  const providerId = opts.provider ?? cfg.defaultProvider
  const model = opts.model ?? cfg.defaultModel

  const provider = getProvider(providerId)
  if (!provider) {
    error(`Unknown provider: "${providerId}"`)
    process.exit(1)
  }

  setAgentProfile(opts.agent as AgentPurpose, providerId, model)
  success(`Profile set: ${fmt.bold(opts.agent)} → ${fmt.bold(providerId)}/${fmt.bold(model)}`)
}
