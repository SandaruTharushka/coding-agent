import { useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface Provider {
  name: string
  enabled: boolean
  model: string
  apiKey: string
  usage: number
  cost: number
}

const defaultProviders: Provider[] = [
  { name: 'OpenAI', enabled: true, model: 'gpt-5-codex', apiKey: '', usage: 42000, cost: 0.84 },
  { name: 'Anthropic', enabled: false, model: 'claude-sonnet', apiKey: '', usage: 12000, cost: 0.19 },
  { name: 'Qwen / DashScope', enabled: false, model: 'qwen-max', apiKey: '', usage: 9000, cost: 0.07 },
  { name: 'Google Gemini', enabled: false, model: 'gemini-2.5-pro', apiKey: '', usage: 11000, cost: 0.11 },
  { name: 'OpenRouter', enabled: false, model: 'openrouter/auto', apiKey: '', usage: 6000, cost: 0.09 },
  { name: 'Local Ollama', enabled: true, model: 'qwen2.5-coder:14b', apiKey: 'local', usage: 0, cost: 0 },
]

export default function ProviderSettings() {
  const [providers, setProviders] = useState(defaultProviders)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  const totalCost = useMemo(() => providers.reduce((sum, p) => sum + p.cost, 0), [providers])

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#2a2a32] bg-[#18181d] p-4">
        <h2 className="mb-1 text-lg font-semibold text-[#f5f5f7]">API Providers</h2>
        <p className="text-sm text-[#9ca3af]">Manage keys, default models, token usage, and provider routing.</p>
      </div>
      {providers.map((provider) => (
        <div key={provider.name} className="rounded-2xl border border-[#2a2a32] bg-[#18181d] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#f5f5f7]">{provider.name}</h3>
              <p className="text-xs text-[#9ca3af]">Cost: ${provider.cost.toFixed(2)} · Tokens: {provider.usage.toLocaleString()}</p>
            </div>
            <button
              onClick={() => setProviders((prev) => prev.map((p) => p.name === provider.name ? { ...p, enabled: !p.enabled } : p))}
              className={`rounded-full px-3 py-1 text-xs ${provider.enabled ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-[#2a2a32] text-[#9ca3af]'}`}
            >
              {provider.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs text-[#9ca3af]">API Key
              <div className="relative mt-1">
                <input
                  type={showKeys[provider.name] ? 'text' : 'password'}
                  value={provider.apiKey}
                  onChange={(e) => setProviders((prev) => prev.map((p) => p.name === provider.name ? { ...p, apiKey: e.target.value } : p))}
                  placeholder="Enter API key"
                  className="w-full rounded-xl border border-[#2a2a32] bg-[#101014] px-3 py-2 text-sm text-[#f5f5f7]"
                />
                <button onClick={() => setShowKeys((prev) => ({ ...prev, [provider.name]: !prev[provider.name] }))} className="absolute right-2 top-2 text-[#9ca3af]">
                  {showKeys[provider.name] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            <label className="text-xs text-[#9ca3af]">Default model
              <input
                value={provider.model}
                onChange={(e) => setProviders((prev) => prev.map((p) => p.name === provider.name ? { ...p, model: e.target.value } : p))}
                className="mt-1 w-full rounded-xl border border-[#2a2a32] bg-[#101014] px-3 py-2 text-sm text-[#f5f5f7]"
              />
            </label>
          </div>
        </div>
      ))}
      <div className="rounded-2xl border border-[#2a2a32] bg-[#18181d] p-4 text-sm text-[#9ca3af]">
        Total estimated spend this session: <span className="text-[#f5f5f7]">${totalCost.toFixed(2)}</span>
      </div>
    </div>
  )
}
