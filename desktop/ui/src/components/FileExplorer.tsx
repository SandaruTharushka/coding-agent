import { useState } from 'react'
import type { FileNode } from '../types'

interface Props {
  files: FileNode[]
  selectedPath: string | null
  onSelect: (path: string) => void
  loading?: boolean
}

const EXT_ICONS: Record<string, string> = {
  ts: '🔷', tsx: '⚛️', js: '🟡', jsx: '⚛️',
  json: '📋', md: '📝', css: '🎨', html: '🌐',
  py: '🐍', rs: '🦀', go: '🐹', sh: '🐚',
  env: '🔐', gitignore: '👁️',
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICONS[ext] ?? '📄'
}

function FileItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: FileNode
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 w-full text-left py-0.5 px-2 rounded hover:bg-cc-surface text-cc-muted text-xs"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <span className="text-cc-subtle w-3 text-center flex-shrink-0">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="text-cc-subtle flex-shrink-0">📂</span>
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {expanded && node.children?.map((child) => (
          <FileItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
    )
  }

  const isSelected = selectedPath === node.path
  return (
    <button
      onClick={() => onSelect(node.path)}
      className={[
        'flex items-center gap-1.5 w-full text-left py-0.5 rounded text-xs transition-colors',
        isSelected
          ? 'bg-cc-accent-bg text-cc-accent'
          : 'text-cc-subtle hover:bg-cc-surface hover:text-cc-muted',
      ].join(' ')}
      style={{ paddingLeft: `${8 + depth * 14 + 12}px`, paddingRight: '8px' }}
    >
      <span className="flex-shrink-0">{fileIcon(node.name)}</span>
      <span className="truncate">{node.name}</span>
    </button>
  )
}

export default function FileExplorer({ files, selectedPath, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-cc-muted text-sm">
        <span className="spin inline-block w-4 h-4 border border-cc-border2 border-t-cc-muted rounded-full mr-2" />
        Loading files…
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-cc-subtle text-sm">
        No files found
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full py-1">
      {files.map((node) => (
        <FileItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
