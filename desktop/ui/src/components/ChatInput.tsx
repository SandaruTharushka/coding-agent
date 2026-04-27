import { useState, useRef, KeyboardEvent } from 'react'

interface Props {
  onSend: (task: string) => void
  disabled?: boolean
  placeholder?: string
}

export default function ChatInput({ onSend, disabled, placeholder }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const task = value.trim()
    if (!task || disabled) return
    onSend(task)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  return (
    <div className="p-3 border-t border-slate-700/50 bg-slate-900/50">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          placeholder={placeholder ?? 'Describe a coding task… (Enter to send, Shift+Enter for newline)'}
          rows={1}
          className={[
            'flex-1 resize-none bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5',
            'text-sm text-slate-200 placeholder-slate-500',
            'focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30',
            'transition-colors leading-relaxed min-h-[42px] max-h-[160px]',
            disabled ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="btn-primary h-10 px-4 flex items-center gap-1.5 flex-shrink-0"
        >
          {disabled ? (
            <>
              <span className="spin inline-block w-3 h-3 border border-white/30 border-t-white rounded-full" />
              <span>Running</span>
            </>
          ) : (
            <>
              <span>Send</span>
              <span className="text-xs opacity-60">↵</span>
            </>
          )}
        </button>
      </div>
      <p className="text-xs text-slate-600 mt-1.5 px-1">
        Tasks run the full agent pipeline: Architect → Coder → Tester → Reviewer
      </p>
    </div>
  )
}
