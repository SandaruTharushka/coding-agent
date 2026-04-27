import { useState, useEffect } from 'react'
import type { QwenConfig } from '../types'

const MODELS = [
  'qwen-plus',
  'qwen-max',
  'qwen-max-longcontext',
  'qwen-turbo',
  'qwen2.5-coder-32b-instruct',
  'qwen2.5-72b-instruct',
]

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
    </div>
  )
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Partial<QwenConfig>>({})
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    setLoading(true)
    try {
      const result = await window.electronAPI.getQwenConfig()
      if (result.success && result.config) {
        setConfig(result.config)
        setApiKeyInput(result.config.apiKey ?? '')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const updates: Partial<QwenConfig> = { ...config }
      if (apiKeyInput && !apiKeyInput.includes('•')) {
        updates.apiKey = apiKeyInput
      }
      const result = await window.electronAPI.updateQwenConfig(updates)
      if (result.success) {
        setMessage({ text: 'Settings saved. API key is masked for security.', ok: true })
        await loadConfig()
      } else {
        setMessage({ text: result.error ?? 'Failed to save', ok: false })
      }
    } finally {
      setSaving(false)
    }
  }

  function update<K extends keyof QwenConfig>(key: K, value: QwenConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        <span className="spin inline-block w-4 h-4 border border-slate-600 border-t-slate-300 rounded-full mr-2" />
        Loading config…
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-slate-200">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Configure Qwen API connection and agent parameters</p>
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

        {/* API section */}
        <div className="panel p-4 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 border-b border-slate-700/50 pb-2">API Configuration</h2>

          <Field
            label="API Key"
            hint="Key is masked after saving and never displayed in plaintext again"
          >
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-…"
                className="input pr-16"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>

          <Field
            label="Base URL"
            hint="OpenAI-compatible endpoint for Qwen API"
          >
            <input
              type="url"
              value={config.baseUrl ?? ''}
              onChange={(e) => update('baseUrl', e.target.value)}
              className="input"
              placeholder="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
            />
          </Field>

          <Field label="Model">
            <select
              value={config.model ?? 'qwen-plus'}
              onChange={(e) => update('model', e.target.value)}
              className="input"
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Limits section */}
        <div className="panel p-4 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 border-b border-slate-700/50 pb-2">Limits</h2>

          <Field label={`Timeout (ms): ${config.timeoutMs ?? 60000}`}>
            <input
              type="range"
              min={5000}
              max={300000}
              step={5000}
              value={config.timeoutMs ?? 60000}
              onChange={(e) => update('timeoutMs', parseInt(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>5s</span><span>5min</span>
            </div>
          </Field>

          <Field label={`Max Retries: ${config.maxRetries ?? 3}`}>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={config.maxRetries ?? 3}
              onChange={(e) => update('maxRetries', parseInt(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>0</span><span>10</span>
            </div>
          </Field>

          <Field label={`Max Tokens: ${(config.maxTokens ?? 8192).toLocaleString()}`}>
            <input
              type="range"
              min={1024}
              max={32768}
              step={1024}
              value={config.maxTokens ?? 8192}
              onChange={(e) => update('maxTokens', parseInt(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>1K</span><span>32K</span>
            </div>
          </Field>
        </div>

        {/* Save */}
        <div className="flex justify-end gap-3">
          <button onClick={loadConfig} className="btn-ghost">Reset</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? (
              <>
                <span className="spin inline-block w-3 h-3 border border-white/30 border-t-white rounded-full mr-1.5" />
                Saving…
              </>
            ) : 'Save Settings'}
          </button>
        </div>

        {/* Safety note */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="text-yellow-400 font-semibold">Security: </span>
            The API key is stored in the project <code className="mono text-slate-400">.env</code> file.
            It is never shown in plaintext after saving, and the desktop UI never exposes raw Node.js
            file APIs to the renderer process.
          </p>
        </div>
      </div>
    </div>
  )
}
