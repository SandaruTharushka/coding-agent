import { useState, useEffect } from 'react'
import type { AIConfig, AgentPurpose, UsageSummary } from '../types'

const AGENT_PURPOSES: AgentPurpose[] = ['coordinator', 'architect', 'coder', 'tester', 'reviewer']

const PROVIDER_MODELS: Record<string, string[]> = {
  qwen: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4-turbo'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  openrouter: ['openai/gpt-4o', 'anthropic/claude-sonnet-4-6', 'google/gemini-flash-1.5'],
  deepseek: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  ollama: ['llama3.2', 'codellama', 'mistral', 'phi3'],
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold text-slate-300 border-b border-slate-700/50 pb-2">
      {title}
    </h2>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'connected' || status === 'no-key-required') {
    return <span className="text-xs text-emerald-400 font-medium">✓ {status === 'no-key-required' ? 'local' : 'connected'}</span>
  }
  return <span className="text-xs text-red-400 font-medium">✗ missing key</span>
}

function formatCost(cost: number | null): string {
  if (cost === null) return '—'
  if (cost === 0) return '$0.000000'
  return `$${cost.toFixed(6)}`
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AIConfig | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  // Per-provider key inputs (masked after load)
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [cfgResult, usageResult] = await Promise.all([
        window.electronAPI.getAIConfig(),
        window.electronAPI.getUsageSummary(),
      ])
      if (cfgResult.success && cfgResult.config) setConfig(cfgResult.config)
      if (usageResult.success && usageResult.summary) setUsage(usageResult.summary)
    } finally {
      setLoading(false)
    }
  }

  async function handleSetDefault(provider: string, model: string) {
    setSaving(true)
    try {
      const result = await window.electronAPI.setAIDefault(provider, model)
      if (result.success) {
        setMessage({ text: `Default set to ${provider}/${model}`, ok: true })
        await loadAll()
      } else {
        setMessage({ text: result.error ?? 'Failed', ok: false })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveKey(providerId: string) {
    const key = keyInputs[providerId]?.trim()
    if (!key || key.includes('•')) {
      setMessage({ text: 'Enter a valid API key first', ok: false })
      return
    }
    setSaving(true)
    try {
      const result = await window.electronAPI.setProviderKey(providerId, key)
      if (result.success) {
        setMessage({ text: `Key saved for ${providerId}. Masked for security.`, ok: true })
        setKeyInputs(p => ({ ...p, [providerId]: '' }))
        await loadAll()
      } else {
        setMessage({ text: result.error ?? 'Failed to save key', ok: false })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveKey(providerId: string) {
    setSaving(true)
    try {
      const result = await window.electronAPI.removeProviderKey(providerId)
      if (result.success) {
        setMessage({ text: `Key removed for ${providerId}`, ok: true })
        await loadAll()
      } else {
        setMessage({ text: result.error ?? 'Failed', ok: false })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleTestProvider(providerId: string, model: string) {
    setTesting(providerId)
    setMessage(null)
    try {
      const result = await window.electronAPI.testProvider(providerId, model)
      if (result.success) {
        setMessage({ text: `✓ ${providerId} connected`, ok: true })
      } else {
        setMessage({ text: `✗ ${providerId}: ${result.error ?? 'Failed'}`, ok: false })
      }
    } finally {
      setTesting(null)
    }
  }

  async function handleSetAgentProfile(purpose: AgentPurpose, provider: string, model: string) {
    const result = await window.electronAPI.setAgentProfile(purpose, provider, model)
    if (result.success) {
      setMessage({ text: `Profile set: ${purpose} → ${provider}/${model}`, ok: true })
      await loadAll()
    } else {
      setMessage({ text: result.error ?? 'Failed', ok: false })
    }
  }

  async function handleClearUsage() {
    if (!confirm('Delete all usage records? This cannot be undone.')) return
    await window.electronAPI.clearUsage()
    await loadAll()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        <span className="spin inline-block w-4 h-4 border border-slate-600 border-t-slate-300 rounded-full mr-2" />
        Loading…
      </div>
    )
  }

  const defaultProviderModels = config ? PROVIDER_MODELS[config.defaultProvider] ?? [] : []

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-lg font-semibold text-slate-200">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Configure AI providers, API keys and agent profiles</p>
        </div>

        {message && (
          <div className={[
            'px-3 py-2 rounded text-sm border',
            message.ok
              ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40'
              : 'bg-red-900/30 text-red-400 border-red-700/40',
          ].join(' ')}>
            {message.text}
          </div>
        )}

        {/* ── Section 1: Default Provider ── */}
        <div className="panel p-4 space-y-4">
          <SectionHeader title="Default Provider & Model" />
          {config && (
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="label">Provider</label>
                <select
                  className="input"
                  value={config.defaultProvider}
                  onChange={(e) => setConfig(c => c ? { ...c, defaultProvider: e.target.value } : c)}
                >
                  {Object.keys(PROVIDER_MODELS).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="label">Model</label>
                <select
                  className="input"
                  value={config.defaultModel}
                  onChange={(e) => setConfig(c => c ? { ...c, defaultModel: e.target.value } : c)}
                >
                  {defaultProviderModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => config && handleSetDefault(config.defaultProvider, config.defaultModel)}
                disabled={saving}
                className="btn-primary"
              >
                Save
              </button>
            </div>
          )}
        </div>

        {/* ── Section 2: API Keys ── */}
        <div className="panel p-4 space-y-4">
          <SectionHeader title="API Keys" />
          <p className="text-xs text-slate-500">Keys are stored in <code className="mono text-slate-400">.env</code> and never shown in plaintext after saving.</p>
          {config?.providerStatuses.filter(p => p.status !== 'no-key-required').map(ps => (
            <div key={ps.id} className="space-y-2 border-b border-slate-700/30 pb-3 last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">{ps.name}</span>
                <div className="flex items-center gap-3">
                  <StatusBadge status={ps.status} />
                  {ps.status === 'connected' && (
                    <span className="text-xs text-slate-500">{ps.maskedKey}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKeys[ps.id] ? 'text' : 'password'}
                    value={keyInputs[ps.id] ?? ''}
                    onChange={(e) => setKeyInputs(p => ({ ...p, [ps.id]: e.target.value }))}
                    placeholder={ps.status === 'connected' ? 'Enter new key to replace…' : 'Enter API key…'}
                    className="input pr-16 text-sm"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeys(p => ({ ...p, [ps.id]: !p[ps.id] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
                  >
                    {showKeys[ps.id] ? 'Hide' : 'Show'}
                  </button>
                </div>
                <button
                  onClick={() => handleSaveKey(ps.id)}
                  disabled={saving || !keyInputs[ps.id]}
                  className="btn-primary text-sm"
                >
                  Save
                </button>
                {ps.status === 'connected' && (
                  <button
                    onClick={() => handleRemoveKey(ps.id)}
                    disabled={saving}
                    className="btn-ghost text-sm text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          {/* Ollama — no key needed */}
          {config?.providerStatuses.filter(p => p.status === 'no-key-required').map(ps => (
            <div key={ps.id} className="flex items-center justify-between py-1">
              <span className="text-sm text-slate-400">{ps.name}</span>
              <StatusBadge status={ps.status} />
            </div>
          ))}
        </div>

        {/* ── Section 3: Agent Model Profiles ── */}
        <div className="panel p-4 space-y-4">
          <SectionHeader title="Agent Model Profiles" />
          <p className="text-xs text-slate-500">Override the provider and model per agent role.</p>
          {config && AGENT_PURPOSES.map(purpose => {
            const profile = config.agentProfiles[purpose]
            const provider = profile?.providerId ?? config.defaultProvider
            const model = profile?.model ?? config.defaultModel
            const models = PROVIDER_MODELS[provider] ?? []
            return (
              <div key={purpose} className="flex gap-3 items-end border-b border-slate-700/30 pb-3 last:border-0">
                <div className="w-28 shrink-0">
                  <label className="label capitalize">{purpose}</label>
                  <span className="text-xs text-slate-500">agent</span>
                </div>
                <div className="flex-1">
                  <label className="label">Provider</label>
                  <select
                    className="input text-sm"
                    value={provider}
                    onChange={(e) => {
                      const newProvider = e.target.value
                      const newModel = PROVIDER_MODELS[newProvider]?.[0] ?? model
                      handleSetAgentProfile(purpose, newProvider, newModel)
                    }}
                  >
                    {Object.keys(PROVIDER_MODELS).map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="label">Model</label>
                  <select
                    className="input text-sm"
                    value={model}
                    onChange={(e) => handleSetAgentProfile(purpose, provider, e.target.value)}
                  >
                    {models.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Section 4: Test Connection ── */}
        <div className="panel p-4 space-y-4">
          <SectionHeader title="Test Connection" />
          <div className="grid grid-cols-2 gap-2">
            {config?.providerStatuses.map(ps => (
              <button
                key={ps.id}
                onClick={() => {
                  const models = PROVIDER_MODELS[ps.id]
                  const model = config.agentProfiles['general']?.model ??
                    (ps.id === config.defaultProvider ? config.defaultModel : models?.[0] ?? 'default')
                  handleTestProvider(ps.id, model)
                }}
                disabled={testing !== null || ps.status === 'missing-key'}
                className={[
                  'flex items-center justify-between px-3 py-2 rounded text-sm border',
                  ps.status === 'missing-key'
                    ? 'border-slate-700/30 text-slate-600 cursor-not-allowed'
                    : 'border-slate-700/50 text-slate-300 hover:border-blue-500/50 cursor-pointer',
                ].join(' ')}
              >
                <span>{ps.name}</span>
                {testing === ps.id ? (
                  <span className="spin inline-block w-3 h-3 border border-slate-600 border-t-slate-300 rounded-full" />
                ) : (
                  <StatusBadge status={ps.status} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Section 5: Token Usage Summary ── */}
        <div className="panel p-4 space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeader title="Token Usage Summary" />
            <button onClick={handleClearUsage} className="text-xs text-red-400 hover:text-red-300">
              Clear all
            </button>
          </div>
          {usage && usage.totalRecords > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-slate-500">Total calls</span>
                <span className="text-slate-300">{usage.totalRecords}</span>
                <span className="text-slate-500">Total tokens</span>
                <span className="text-slate-300">{usage.totalTokens.toLocaleString()}</span>
                <span className="text-slate-500">Input tokens</span>
                <span className="text-slate-300">{usage.totalInputTokens.toLocaleString()}</span>
                <span className="text-slate-500">Output tokens</span>
                <span className="text-slate-300">{usage.totalOutputTokens.toLocaleString()}</span>
              </div>

              {Object.keys(usage.byProvider).length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">By provider</p>
                  {Object.entries(usage.byProvider).map(([id, data]) => (
                    <div key={id} className="flex items-center justify-between text-xs py-0.5">
                      <span className="text-slate-400">{id}</span>
                      <span className="text-slate-500">{data.totalTokens.toLocaleString()} tokens · {data.calls} calls</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No usage recorded yet. Run agent tasks to track token usage.</p>
          )}
        </div>

        {/* ── Section 6: Cost Summary ── */}
        {usage && usage.totalEstimatedCost !== null && (
          <div className="panel p-4 space-y-3">
            <SectionHeader title="Cost Summary" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-slate-500">Total estimated cost</span>
              <span className="text-emerald-400 font-medium">{formatCost(usage.totalEstimatedCost)}</span>
            </div>
            {Object.entries(usage.byModel).map(([model, data]) => (
              data.estimatedCost !== null && (
                <div key={model} className="flex justify-between text-xs text-slate-500">
                  <span>{model}</span>
                  <span>{formatCost(data.estimatedCost)}</span>
                </div>
              )
            ))}
            <p className="text-xs text-slate-600">
              Estimates based on published pricing. Actual billing may differ.
            </p>
          </div>
        )}

        {/* Security note */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="text-yellow-400 font-semibold">Security: </span>
            API keys are stored only in <code className="mono text-slate-400">.env</code> (git-ignored).
            They are never shown in plaintext after saving, never logged, and never sent to the renderer process.
          </p>
        </div>
      </div>
    </div>
  )
}
