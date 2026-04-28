import { Paperclip, Play, Zap } from 'lucide-react'

interface ChatPanelProps {
  value: string
  onChange: (value: string) => void
  onRun: () => void
}

export default function ChatPanel({ value, onChange, onRun }: ChatPanelProps) {
  return (
    <div className="rounded-2xl border border-[#2a2a32] bg-[#18181d] p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-[#9ca3af]">
        <span>Command / Chat</span>
        <span className="flex items-center gap-1 text-[#22c55e]"><Zap className="h-3.5 w-3.5" /> Provider online</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-28 w-full resize-none rounded-xl border border-[#2a2a32] bg-[#101014] px-3 py-2 text-sm text-[#f5f5f7] outline-none focus:border-[#00aaff]"
        placeholder="Describe your implementation task, run command, or request a refactor..."
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className="rounded-lg border border-[#2a2a32] bg-[#101014] px-2 py-1.5 text-xs text-[#f5f5f7]">
          <option>OpenAI · gpt-5-codex</option>
          <option>Anthropic · sonnet</option>
          <option>Gemini · 2.5 Pro</option>
          <option>Qwen · qwen-max</option>
          <option>OpenRouter · auto</option>
          <option>Ollama · qwen2.5-coder</option>
        </select>
        <button className="inline-flex items-center gap-1 rounded-lg border border-[#2a2a32] bg-[#101014] px-3 py-1.5 text-xs text-[#9ca3af]"><Paperclip className="h-3.5 w-3.5" />Attach file</button>
        <button onClick={onRun} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-[#00aaff] px-4 py-1.5 text-xs font-semibold text-black"><Play className="h-3.5 w-3.5" />Run</button>
      </div>
    </div>
  )
}
