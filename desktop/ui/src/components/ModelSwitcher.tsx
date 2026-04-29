import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import type { ModelId, Model } from '../types'

const MODELS: Model[] = [
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6',  shortName: 'Sonnet 4.6',  provider: 'anthropic', color: '#ff6a3d' },
  { id: 'claude-opus-4-7',   name: 'Claude Opus 4.7',    shortName: 'Opus 4.7',    provider: 'anthropic', color: '#ff8c5a' },
  { id: 'claude-haiku-4-5',  name: 'Claude Haiku 4.5',   shortName: 'Haiku 4.5',   provider: 'anthropic', color: '#ffaa75' },
  { id: 'qwen-coder',        name: 'Qwen 2.5 Coder',     shortName: 'Qwen Coder',  provider: 'qwen',      color: '#4ade80' },
  { id: 'gpt-4o',            name: 'GPT-4o',             shortName: 'GPT-4o',      provider: 'openai',    color: '#60a5fa' },
]

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: 'Anthropic',
  qwen:      'Alibaba',
  openai:    'OpenAI',
}

export default function ModelSwitcher() {
  const { selectedModel, setSelectedModel } = useApp()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const current = MODELS.find(m => m.id === selectedModel) ?? MODELS[0]

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  return (
    <div className="p-3" style={{ borderBottom: '1px solid #1f1f22' }} ref={wrapRef}>
      <p className="section-label mb-2">Model</p>

      {/* Trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all"
        style={{
          background: open ? '#1c1c1f' : 'rgba(20,20,22,0.6)',
          border: `1px solid ${open ? '#2a2a2e' : '#1f1f22'}`,
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = '#1a1a1d' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'rgba(20,20,22,0.6)' }}
      >
        <ProviderDot color={current.color} />
        <div className="flex-1 min-w-0 text-left">
          <div className="text-cc-text text-xs font-semibold truncate">{current.shortName}</div>
          <div className="text-cc-subtle" style={{ fontSize: 10 }}>{PROVIDER_LABEL[current.provider]}</div>
        </div>
        <ChevronIcon open={open} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="mt-1.5 rounded-lg overflow-hidden fade-in"
          style={{ background: '#141416', border: '1px solid #2a2a2e', boxShadow: '0 8px 24px rgba(0,0,0,0.50)' }}
        >
          {['anthropic', 'qwen', 'openai'].map(provider => {
            const providerModels = MODELS.filter(m => m.provider === provider)
            return (
              <div key={provider}>
                <div
                  className="px-3 py-1.5 section-label"
                  style={{ borderBottom: '1px solid #1f1f22', display: 'block' }}
                >
                  {PROVIDER_LABEL[provider]}
                </div>
                {providerModels.map(model => (
                  <ModelOption
                    key={model.id}
                    model={model}
                    selected={selectedModel === model.id}
                    onSelect={(id: ModelId) => {
                      setSelectedModel(id)
                      setOpen(false)
                    }}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ModelOption({
  model, selected, onSelect,
}: {
  model: Model
  selected: boolean
  onSelect: (id: ModelId) => void
}) {
  return (
    <button
      onClick={() => onSelect(model.id)}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all"
      style={{ background: selected ? 'rgba(255,106,61,0.06)' : 'transparent' }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <ProviderDot color={model.color} size={7} />
      <div className="flex-1 min-w-0">
        <span
          className="text-xs truncate block"
          style={{ color: selected ? '#ff6a3d' : '#9a9a9f', fontWeight: selected ? 600 : 400 }}
        >
          {model.shortName}
        </span>
      </div>
      {selected && <CheckIcon />}
    </button>
  )
}

function ProviderDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        boxShadow: `0 0 6px ${color}60`,
      }}
    />
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{ flexShrink: 0, color: '#4a4a50', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
    >
      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2.5 5.5l2 2L8.5 3.5" stroke="#ff6a3d" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
