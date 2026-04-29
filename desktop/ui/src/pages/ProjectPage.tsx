import { useState, useEffect } from 'react'
import FileExplorer from '../components/FileExplorer'
import type { FileNode } from '../types'

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', css: 'css', html: 'html',
  py: 'python', rs: 'rust', go: 'go', sh: 'shell',
}

function getLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'text'
}

function FilePreview({ path, content, loading }: { path: string; content: string; loading: boolean }) {
  const lines = content.split('\n')

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-4 py-2 border-b border-cc-border flex items-center gap-3 bg-cc-sidebar/50">
        <span className="text-xs text-cc-muted mono truncate">{path}</span>
        <div className="flex-1" />
        <span className="badge badge-gray">{getLang(path)}</span>
        <span className="text-xs text-cc-subtle">{lines.length} lines</span>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-cc-muted text-sm">
            <span className="spin inline-block w-4 h-4 border border-cc-border2 border-t-cc-muted rounded-full mr-2" />
            Loading…
          </div>
        ) : (
          <pre className="text-xs mono p-4 leading-relaxed text-cc-muted">
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="select-none text-cc-subtle w-10 flex-shrink-0 text-right pr-4">
                  {i + 1}
                </span>
                <span className="flex-1">{line}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  )
}

export default function ProjectPage() {
  const [files, setFiles] = useState<FileNode[]>([])
  const [filesLoading, setFilesLoading] = useState(true)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [contentLoading, setContentLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadFiles()
  }, [])

  async function loadFiles() {
    setFilesLoading(true)
    try {
      const result = await window.electronAPI.getProjectFiles()
      if (result.success && result.files) {
        setFiles(result.files)
      } else {
        setError(result.error ?? 'Failed to load files')
      }
    } finally {
      setFilesLoading(false)
    }
  }

  async function handleSelect(path: string) {
    setSelectedPath(path)
    setContentLoading(true)
    setFileContent('')
    try {
      const result = await window.electronAPI.getFileContent(path)
      if (result.success && result.content !== undefined) {
        setFileContent(result.content)
      } else {
        setFileContent(`Error: ${result.error ?? 'Failed to read file'}`)
      }
    } finally {
      setContentLoading(false)
    }
  }

  async function handleScan() {
    setScanning(true)
    try {
      await window.electronAPI.scanProject()
      await loadFiles()
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* File tree sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-cc-border flex flex-col">
        <div className="flex-shrink-0 px-3 py-2.5 border-b border-cc-border flex items-center gap-2">
          <span className="text-xs font-semibold text-cc-muted uppercase tracking-wider flex-1">
            Files
          </span>
          <button
            onClick={loadFiles}
            title="Refresh file tree"
            className="btn-ghost text-xs px-1.5 py-1"
          >
            ↺
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            title="Scan project and update context"
            className="btn-ghost text-xs px-1.5 py-1"
          >
            {scanning ? '…' : '⟳ Scan'}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {error ? (
            <div className="p-3 text-xs text-red-400">{error}</div>
          ) : (
            <FileExplorer
              files={files}
              selectedPath={selectedPath}
              onSelect={handleSelect}
              loading={filesLoading}
            />
          )}
        </div>
      </div>

      {/* File content area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {selectedPath ? (
          <FilePreview
            path={selectedPath}
            content={fileContent}
            loading={contentLoading}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-cc-subtle">
            <div className="text-center">
              <p className="text-3xl mb-3">📁</p>
              <p className="text-sm">Select a file to preview</p>
              <p className="text-xs mt-1 text-cc-subtle/70">Files are read-only — edits go through the agent</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
