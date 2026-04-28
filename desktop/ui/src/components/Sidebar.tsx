import { Bot, Cog, FolderKanban, Plus, Settings2 } from 'lucide-react'

const modes = ['Architect Agent', 'Backend Agent', 'Frontend Agent', 'Tester Agent', 'Security Agent']

export default function Sidebar() {
  return (
    <aside className="w-72 flex-shrink-0 border-r border-[#2a2a32] bg-[#121216] p-4">
      <div className="mb-5 rounded-2xl border border-[#2a2a32] bg-[#18181d] p-4 shadow-[0_0_30px_rgba(0,170,255,0.12)]">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-[#00aaff]" />
          <h1 className="text-lg font-semibold text-[#f5f5f7]">Coding Agent</h1>
        </div>
        <p className="mt-1 text-xs text-[#9ca3af]">Multi-AI Developer Workspace</p>
      </div>

      <button className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00aaff] px-3 py-2 text-sm font-semibold text-black transition hover:brightness-110">
        <Plus className="h-4 w-4" /> New Session
      </button>

      <div className="mb-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-[#9ca3af]">Projects / Sessions</p>
        <div className="space-y-2">
          {['coding-agent / premium-ui-upgrade', 'api-layer / provider-routing', 'safety-loop / verification'].map((item) => (
            <button key={item} className="w-full truncate rounded-xl border border-[#2a2a32] bg-[#18181d] px-3 py-2 text-left text-xs text-[#f5f5f7] hover:border-[#00aaff]/40">{item}</button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-[#9ca3af]">Agent Modes</p>
        <div className="space-y-2">
          {modes.map((mode, i) => (
            <button key={mode} className={`w-full rounded-xl border px-3 py-2 text-left text-xs ${i === 0 ? 'border-[#00aaff]/50 bg-[#00aaff]/10 text-[#f5f5f7] shadow-[0_0_20px_rgba(0,170,255,0.15)]' : 'border-[#2a2a32] bg-[#18181d] text-[#9ca3af]'}`}>
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto space-y-2 pt-3">
        <button className="flex w-full items-center gap-2 rounded-xl border border-[#2a2a32] bg-[#18181d] px-3 py-2 text-sm text-[#9ca3af]"><Cog className="h-4 w-4" /> Settings</button>
        <button className="flex w-full items-center gap-2 rounded-xl border border-[#2a2a32] bg-[#18181d] px-3 py-2 text-sm text-[#9ca3af]"><Settings2 className="h-4 w-4" /> API Providers</button>
        <button className="flex w-full items-center gap-2 rounded-xl border border-[#2a2a32] bg-[#18181d] px-3 py-2 text-sm text-[#9ca3af]"><FolderKanban className="h-4 w-4" /> Workspace Settings</button>
      </div>
    </aside>
  )
}
