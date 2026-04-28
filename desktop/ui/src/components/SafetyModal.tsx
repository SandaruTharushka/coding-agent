import { AlertTriangle, ShieldCheck } from 'lucide-react'

interface SafetyModalProps {
  open: boolean
  command: string
  onApprove: () => void
  onCancel: () => void
}

export default function SafetyModal({ open, command, onApprove, onCancel }: SafetyModalProps) {
  if (!open) return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-[#2a2a32] bg-[#18181d] p-6 shadow-[0_0_60px_rgba(139,92,246,0.2)]">
        <div className="mb-4 flex items-center gap-3 text-[#f5f5f7]">
          <AlertTriangle className="h-5 w-5 text-[#f59e0b]" />
          <h3 className="text-lg font-semibold">Dangerous Command Approval</h3>
        </div>
        <p className="mb-3 text-sm text-[#9ca3af]">Review this command before execution.</p>
        <pre className="mb-4 overflow-x-auto rounded-xl border border-[#2a2a32] bg-[#0b0b0d] p-3 text-xs text-[#f5f5f7]">{command}</pre>
        <div className="mb-5 rounded-xl border border-[#2a2a32] bg-[#101014] p-3 text-xs text-[#9ca3af]">
          <div className="mb-2 flex items-center gap-2 text-[#22c55e]"><ShieldCheck className="h-4 w-4" /> Backup created</div>
          <div>Diff preview is available before applying edits.</div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-[#2a2a32] px-4 py-2 text-sm text-[#9ca3af] hover:text-[#f5f5f7]">Cancel</button>
          <button onClick={onApprove} className="rounded-lg bg-[#ef4444] px-4 py-2 text-sm font-medium text-white">Approve & Run</button>
        </div>
      </div>
    </div>
  )
}
