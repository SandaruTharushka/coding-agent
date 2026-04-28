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

  // ── Config (legacy Qwen) ───────────────────────────────────────────────────
  getQwenConfig: () =>
    ipcRenderer.invoke('config:get'),

  updateQwenConfig: (config: Record<string, unknown>) =>
    ipcRenderer.invoke('config:update', config),

  // ── AI Config (multi-provider) ─────────────────────────────────────────────
  getAIConfig: () =>
    ipcRenderer.invoke('ai:get-config'),

  setAIDefault: (provider: string, model: string) =>
    ipcRenderer.invoke('ai:set-default', provider, model),

  setProviderKey: (provider: string, apiKey: string) =>
    ipcRenderer.invoke('ai:set-provider-key', provider, apiKey),

  removeProviderKey: (provider: string) =>
    ipcRenderer.invoke('ai:remove-provider-key', provider),

  setAgentProfile: (purpose: string, provider: string, model: string) =>
    ipcRenderer.invoke('ai:set-agent-profile', purpose, provider, model),

  testProvider: (provider: string, model: string) =>
    ipcRenderer.invoke('ai:test-provider', provider, model),

  // ── Usage ──────────────────────────────────────────────────────────────────
  getUsageSummary: () =>
    ipcRenderer.invoke('usage:get-summary'),

  clearUsage: () =>
    ipcRenderer.invoke('usage:clear'),

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
