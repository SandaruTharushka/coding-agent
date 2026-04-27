interface Props {
  diff: string
  title?: string
}

export default function DiffViewer({ diff, title }: Props) {
  if (!diff || !diff.trim()) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-sm italic">
        No diff to show
      </div>
    )
  }

  const lines = diff.split('\n')

  return (
    <div className="overflow-auto h-full">
      {title && (
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700/50 px-3 py-1.5 text-xs font-medium text-slate-400">
          {title}
        </div>
      )}
      <pre className="text-xs mono p-3 leading-relaxed">
        {lines.map((line, i) => {
          if (line.startsWith('+++') || line.startsWith('---')) {
            return (
              <div key={i} className="text-slate-400 font-semibold">
                {line}
              </div>
            )
          }
          if (line.startsWith('@@')) {
            return (
              <div key={i} className="text-blue-400 bg-blue-950/30 px-1 -mx-1">
                {line}
              </div>
            )
          }
          if (line.startsWith('+')) {
            return (
              <div key={i} className="diff-add px-1 -mx-1">
                {line}
              </div>
            )
          }
          if (line.startsWith('-')) {
            return (
              <div key={i} className="diff-remove px-1 -mx-1">
                {line}
              </div>
            )
          }
          return (
            <div key={i} className="diff-context">
              {line}
            </div>
          )
        })}
      </pre>
    </div>
  )
}
