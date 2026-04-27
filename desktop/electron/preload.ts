import { contextBridge, ipcRenderer } from 'electron'

// Expose a safe, typed API to the renderer process.
// No raw Node.js APIs are exposed — all calls go through ipcMain handlers.
contextBridge.exposeInMainWorld('electronAPI', {
  // ── Agent ──────────────────────────────────────────────────────────────────
  runAgentTask: (task: string) =>
    ipcRenderer.invoke('agent:run-task', task),

  scanProject: () =>
    ipcRenderer.invoke('agent:scan-project'),

  buildContext: (task: string) =>
    ipcRenderer.invoke('agent:build-context', task),

  previewDiff: () =>
    ipcRenderer.invoke('agent:preview-diff'),

  applyPatch: (sessionId: string) =>
    ipcRenderer.invoke('agent:apply-patch', sessionId),

  rollback: (sessionId: string) =>
    ipcRenderer.invoke('agent:rollback', sessionId),

  runVerification: () =>
    ipcRenderer.invoke('agent:verify'),

  // ── Project ────────────────────────────────────────────────────────────────
  getProjectFiles: (dir?: string) =>
    ipcRenderer.invoke('project:get-files', dir),

  getFileContent: (filePath: string) =>
    ipcRenderer.invoke('project:get-file-content', filePath),

  // ── Git ────────────────────────────────────────────────────────────────────
  getGitStatus: () =>
    ipcRenderer.invoke('git:status'),

  commitChanges: (message: string) =>
    ipcRenderer.invoke('git:commit', message),

  // ── Memory ─────────────────────────────────────────────────────────────────
  getMemory: () =>
    ipcRenderer.invoke('memory:get'),

  // ── Config ─────────────────────────────────────────────────────────────────
  getQwenConfig: () =>
    ipcRenderer.invoke('config:get'),

  updateQwenConfig: (config: Record<string, unknown>) =>
    ipcRenderer.invoke('config:update', config),

  // ── Streaming event listeners ──────────────────────────────────────────────
  onAgentProgress: (cb: (data: unknown) => void) => {
    ipcRenderer.on('agent:progress', (_event, data) => cb(data))
  },

  onAgentComplete: (cb: (data: unknown) => void) => {
    ipcRenderer.on('agent:complete', (_event, data) => cb(data))
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
