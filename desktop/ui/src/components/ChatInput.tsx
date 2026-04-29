import { useState, useRef, KeyboardEvent } from 'react'

interface Props {
  onSend: (task: string) => void
  disabled?: boolean
  placeholder?: string
}

export default function ChatInput({ onSend, disabled, placeholder }: Props) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
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
    <div className="px-4 py-3" style={{ borderTop: '1px solid #1a1a1d', background: 'rgba(11,11,12,0.6)' }}>
      <div
        className="chat-input-wrap"
        style={focused && !disabled ? {
          borderColor: 'rgba(255,106,61,0.45)',
          boxShadow: '0 0 0 2px rgba(255,106,61,0.12), 0 0 28px rgba(255,106,61,0.08)',
        } : {}}
      >
        <div className="flex items-end gap-2 px-4 py-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={disabled}
            placeholder={placeholder ?? 'Describe a coding task… (Enter to send, Shift+Enter for newline)'}
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: disabled ? 'rgba(230,230,230,0.35)' : '#e6e6e6',
              fontSize: 14,
              lineHeight: '1.5',
              minHeight: 22,
              maxHeight: 160,
              fontFamily: 'inherit',
              cursor: disabled ? 'not-allowed' : 'text',
            }}
          />

          {/* Icon toolbar */}
          <div className="flex items-center gap-1.5 flex-shrink-0 pb-0.5">
            {!disabled && (
              <>
                <IconBtn title="Attach file"><AttachIcon /></IconBtn>
                <IconBtn title="Tools"><ToolsIcon /></IconBtn>
              </>
            )}
            <button
              onClick={handleSend}
              disabled={disabled || !value.trim()}
              title="Send (Enter)"
              style={{
                width: 32, height: 32,
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.15s, box-shadow 0.15s',
                background:  (!disabled && value.trim()) ? '#ff6a3d' : '#1c1c1f',
                color:       (!disabled && value.trim()) ? '#fff'     : '#4a4a50',
                boxShadow:   (!disabled && value.trim()) ? '0 0 14px rgba(255,106,61,0.30)' : 'none',
                cursor:      disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {disabled ? <SpinnerIcon /> : <SendIcon />}
            </button>
          </div>
        </div>

        {/* Status line */}
        <div className="flex items-center gap-2 px-4 pb-2.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 opacity-60 flex-shrink-0" />
            <span className="text-cc-subtle" style={{ fontSize: 11 }}>api key not saved</span>
          </div>
          {disabled && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ fontSize: 11, color: '#ff7849', background: 'rgba(255,106,61,0.08)' }}
            >
              <span className="spin-slow inline-block w-2.5 h-2.5 border border-orange-400/30 border-t-orange-400 rounded-full" />
              Agent running…
            </span>
          )}
          {!disabled && (
            <span className="text-cc-subtle ml-auto" style={{ fontSize: 11 }}>
              Enter to send · Shift+Enter for newline
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function IconBtn({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <button
      title={title}
      className="w-7 h-7 rounded-lg flex items-center justify-center text-cc-subtle hover:text-cc-muted transition-colors"
    >
      {children}
    </button>
  )
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M12.5 7L1.5 2l2.5 5-2.5 5 11-5Z" fill="currentColor"/>
    </svg>
  )
}
function SpinnerIcon() {
  return (
    <svg className="spin" width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="6.5" r="5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>
      <path d="M6.5 1.5a5 5 0 015 5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
function AttachIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11.5 6.5L6 12a3.5 3.5 0 01-4.95-4.95l5.5-5.5a2 2 0 012.83 2.83L4.38 9.38a.5.5 0 01-.71-.71l4.25-4.24"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function ToolsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 1.5a3.5 3.5 0 00-3.38 4.38L2.5 9l2 2 3.12-3.12A3.5 3.5 0 109 1.5z"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9" cy="5" r="1" fill="currentColor"/>
    </svg>
  )
}
