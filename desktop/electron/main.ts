import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn, execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const isDev = process.env.NODE_ENV === 'development'
// dist-electron/main.js → desktop/ → project root
const ROOT = path.resolve(__dirname, '..', '..')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'dist', 'index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

function getTsx(): string {
  const local = path.join(ROOT, 'node_modules', '.bin', 'tsx')
  return fs.existsSync(local) ? local : 'npx'
}

function getCLI(): string {
  return path.join(ROOT, 'agent', 'cli.ts')
}

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;]*[mGKHF]/g, '')
    .replace(/\x1b\[\?[0-9]*[hl]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
}

function spawnCLI(
  args: string[],
  onData: (line: string) => void,
): Promise<number> {
  const tsx = getTsx()
  const cli = getCLI()
  const spawnArgs = tsx.endsWith('npx') ? ['tsx', cli, ...args] : [cli, ...args]

  return new Promise((resolve) => {
    const child = spawn(tsx, spawnArgs, { cwd: ROOT, env: { ...process.env } })
    child.stdout.on('data', (d: Buffer) => onData(stripAnsi(d.toString())))
    child.stderr.on('data', (d: Buffer) => onData(stripAnsi(d.toString())))
    child.on('close', resolve)
  })
}

// ── Agent: run full apply pipeline (streaming) ────────────────────────────────
ipcMain.handle('agent:run-task', async (event, task: string) => {
  const sessionId = `session-${Date.now()}`

  const code = await spawnCLI(['apply', task], (msg) => {
    event.sender.send('agent:progress', {
      type: 'log',
      message: msg,
      timestamp: new Date().toISOString(),
    })
  })

  event.sender.send('agent:complete', { success: code === 0, sessionId, exitCode: code })
  return { sessionId }
})

// ── Agent: scan project ───────────────────────────────────────────────────────
ipcMain.handle('agent:scan-project', async () => {
  let output = ''
  await spawnCLI(['scan'], (msg) => { output += msg })
  return { success: true, output }
})

// ── Agent: build context ──────────────────────────────────────────────────────
ipcMain.handle('agent:build-context', async (_, task: string) => {
  let output = ''
  await spawnCLI(['context', task], (msg) => { output += msg })
  return { success: true, output }
})

// ── Agent: preview diff ───────────────────────────────────────────────────────
ipcMain.handle('agent:preview-diff', async () => {
  try {
    const diff = execSync('git diff HEAD', { cwd: ROOT, encoding: 'utf-8', timeout: 10000 })
    const status = execSync('git status --short', { cwd: ROOT, encoding: 'utf-8', timeout: 5000 })
    let sessions = ''
    await spawnCLI(['edit-sessions', '--json'], (msg) => { sessions += msg })
    return { success: true, diff, status, sessions }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message, diff: '', status: '', sessions: '' }
  }
})

// ── Agent: apply patch ────────────────────────────────────────────────────────
ipcMain.handle('agent:apply-patch', async (event, sessionId: string) => {
  let output = ''
  const args = sessionId ? ['apply'] : ['apply']
  const code = await spawnCLI(args, (msg) => {
    output += msg
    event.sender.send('agent:progress', { type: 'log', message: msg, timestamp: new Date().toISOString() })
  })
  return { success: code === 0, output }
})

// ── Agent: rollback ───────────────────────────────────────────────────────────
ipcMain.handle('agent:rollback', async (event, sessionId: string) => {
  let output = ''
  const args = sessionId ? ['rollback', sessionId] : ['rollback']
  const code = await spawnCLI(args, (msg) => {
    output += msg
    event.sender.send('agent:progress', { type: 'log', message: msg, timestamp: new Date().toISOString() })
  })
  return { success: code === 0, output }
})

// ── Agent: run verification ───────────────────────────────────────────────────
ipcMain.handle('agent:verify', async (event) => {
  let output = ''
  const code = await spawnCLI(['verify'], (msg) => {
    output += msg
    event.sender.send('agent:progress', { type: 'log', message: msg, timestamp: new Date().toISOString() })
  })
  return { success: code === 0, output }
})

// ── Project: get file tree ────────────────────────────────────────────────────
interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-electron', '__pycache__', '.next'])

function readDir(dirPath: string, depth = 0): FileNode[] {
  if (depth > 6) return []
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const nodes: FileNode[] = []
    for (const e of entries) {
      if (depth === 0 && SKIP_DIRS.has(e.name)) continue
      if (e.name.startsWith('.') && e.name !== '.env' && e.name !== '.gitignore') continue
      const full = path.join(dirPath, e.name)
      const rel = path.relative(ROOT, full)
      if (e.isDirectory()) {
        nodes.push({ name: e.name, path: rel, type: 'directory', children: readDir(full, depth + 1) })
      } else {
        nodes.push({ name: e.name, path: rel, type: 'file' })
      }
    }
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  } catch {
    return []
  }
}

ipcMain.handle('project:get-files', async (_, dir?: string) => {
  const target = dir ? path.resolve(ROOT, dir) : ROOT
  if (!target.startsWith(ROOT)) return { success: false, error: 'Path escape rejected' }
  return { success: true, files: readDir(target) }
})

// ── Project: get file content ─────────────────────────────────────────────────
ipcMain.handle('project:get-file-content', async (_, filePath: string) => {
  const abs = path.resolve(ROOT, filePath)
  if (!abs.startsWith(ROOT)) return { success: false, error: 'Path escape rejected' }
  try {
    const content = fs.readFileSync(abs, 'utf-8')
    return { success: true, content }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ── Git: status ───────────────────────────────────────────────────────────────
ipcMain.handle('git:status', async () => {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim()
    const status = execSync('git status --short', { cwd: ROOT, encoding: 'utf-8' })
    const diff = execSync('git diff --stat HEAD', { cwd: ROOT, encoding: 'utf-8' })
    return { success: true, branch, status, diff }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message, branch: 'unknown', status: '', diff: '' }
  }
})

// ── Git: commit ───────────────────────────────────────────────────────────────
ipcMain.handle('git:commit', async (_, message: string) => {
  let output = ''
  if (message !== undefined) {
    // Write message to a temp file to avoid any shell injection risk
    const tmpMsg = path.join(ROOT, '.qwen-agent', `commit-msg-${Date.now()}.tmp`)
    try {
      fs.mkdirSync(path.dirname(tmpMsg), { recursive: true })
      fs.writeFileSync(tmpMsg, String(message), 'utf-8')
      execSync('git add -A', { cwd: ROOT })
      const result = execSync(`git commit -F ${JSON.stringify(tmpMsg)}`, {
        cwd: ROOT,
        encoding: 'utf-8',
      })
      return { success: true, output: result }
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message }
    } finally {
      if (fs.existsSync(tmpMsg)) fs.unlinkSync(tmpMsg)
    }
  }
  const code = await spawnCLI(['commit'], (msg) => { output += msg })
  return { success: code === 0, output }
})

// ── Memory: get ───────────────────────────────────────────────────────────────
ipcMain.handle('memory:get', async () => {
  const memPath = path.join(ROOT, '.agent', 'memory.json')
  try {
    if (fs.existsSync(memPath)) {
      const data = JSON.parse(fs.readFileSync(memPath, 'utf-8'))
      return { success: true, memory: data }
    }
    return { success: true, memory: { tasks: [], notes: [], decisions: [], projectSummary: '' } }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ── Config: get (masked) ──────────────────────────────────────────────────────
ipcMain.handle('config:get', async () => {
  const envPath = path.join(ROOT, '.env')
  const cfg: Record<string, string> = {}
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) cfg[m[1]] = m[2].replace(/^["']|["']$/g, '').split('#')[0].trim()
    }
  }
  const rawKey = cfg.QWEN_API_KEY || ''
  return {
    success: true,
    config: {
      apiKey: rawKey ? '••••••••' + rawKey.slice(-4) : '',
      baseUrl: cfg.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      model: cfg.QWEN_MODEL || 'qwen-plus',
      timeoutMs: parseInt(cfg.QWEN_TIMEOUT_MS || '60000'),
      maxRetries: parseInt(cfg.QWEN_MAX_RETRIES || '3'),
      maxTokens: parseInt(cfg.QWEN_MAX_TOKENS || '8192'),
    },
  }
})

// ── Config: update ────────────────────────────────────────────────────────────
ipcMain.handle('config:update', async (_, cfg: Record<string, string | number>) => {
  const envPath = path.join(ROOT, '.env')
  const existing: Record<string, string> = {}
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) existing[m[1]] = m[2]
    }
  }
  const apiKey = cfg.apiKey as string | undefined
  if (apiKey && !apiKey.includes('•')) existing.QWEN_API_KEY = apiKey
  if (cfg.baseUrl) existing.QWEN_BASE_URL = String(cfg.baseUrl)
  if (cfg.model) existing.QWEN_MODEL = String(cfg.model)
  if (cfg.timeoutMs) existing.QWEN_TIMEOUT_MS = String(cfg.timeoutMs)
  if (cfg.maxRetries) existing.QWEN_MAX_RETRIES = String(cfg.maxRetries)
  if (cfg.maxTokens) existing.QWEN_MAX_TOKENS = String(cfg.maxTokens)

  const content = Object.entries(existing).map(([k, v]) => `${k}=${v}`).join('\n')
  fs.writeFileSync(envPath, content + '\n', 'utf-8')
  return { success: true }
})

// ── AI Config: get (multi-provider) ──────────────────────────────────────────
ipcMain.handle('ai:get-config', async () => {
  try {
    let output = ''
    await spawnCLI(['ai', 'config', 'show', '--json-ipc'], (msg) => { output += msg })
    const marker = '__AI_CONFIG__:'
    const line = output.split('\n').find(l => l.startsWith(marker))
    if (line) {
      return { success: true, config: JSON.parse(line.slice(marker.length)) }
    }
    // Fallback: read env and config file directly
    const envPath = path.join(ROOT, '.env')
    const envVars: Record<string, string> = {}
    if (fs.existsSync(envPath)) {
      for (const line2 of fs.readFileSync(envPath, 'utf-8').split('\n')) {
        const m = line2.match(/^([A-Z_A-Z0-9_]+)=(.*)$/)
        if (m) envVars[m[1]] = m[2].replace(/^["']|["']$/g, '').split('#')[0].trim()
      }
    }
    const PROVIDERS = ['qwen', 'openai', 'anthropic', 'gemini', 'openrouter', 'deepseek', 'groq', 'ollama']
    const KEY_MAP: Record<string, string> = {
      qwen: 'QWEN_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', deepseek: 'DEEPSEEK_API_KEY',
      groq: 'GROQ_API_KEY',
    }
    const NAMES: Record<string, string> = {
      qwen: 'Qwen / DashScope', openai: 'OpenAI', anthropic: 'Anthropic',
      gemini: 'Google Gemini', openrouter: 'OpenRouter', deepseek: 'DeepSeek',
      groq: 'Groq', ollama: 'Ollama (local)',
    }
    function maskKey(k: string): string {
      if (!k) return '(not set)'
      if (k.length <= 8) return '****'
      return k.slice(0, 4) + '****' + k.slice(-4)
    }
    const providerStatuses = PROVIDERS.map(id => {
      const envKey = KEY_MAP[id]
      const key = envKey ? (envVars[envKey] ?? '') : ''
      const noKey = id === 'ollama'
      return {
        id,
        name: NAMES[id] ?? id,
        status: noKey ? 'no-key-required' : key ? 'connected' : 'missing-key',
        maskedKey: noKey ? 'n/a' : maskKey(key),
      }
    })
    const aiConfigPath = path.join(ROOT, '.qwen-agent', 'ai-config.json')
    let persisted: Record<string, unknown> = {}
    if (fs.existsSync(aiConfigPath)) {
      try { persisted = JSON.parse(fs.readFileSync(aiConfigPath, 'utf-8')) } catch { /* ignore */ }
    }
    return {
      success: true,
      config: {
        defaultProvider: (persisted.defaultProvider as string) ?? envVars.AI_DEFAULT_PROVIDER ?? 'qwen',
        defaultModel: (persisted.defaultModel as string) ?? envVars.QWEN_MODEL ?? 'qwen-plus',
        providerStatuses,
        agentProfiles: (persisted.agentProfiles as Record<string, unknown>) ?? {},
        maxTokens: parseInt(envVars.QWEN_MAX_TOKENS ?? '8192'),
        timeoutMs: parseInt(envVars.QWEN_TIMEOUT_MS ?? '60000'),
        maxRetries: parseInt(envVars.QWEN_MAX_RETRIES ?? '3'),
        stream: envVars.QWEN_STREAM !== 'false',
      },
    }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ── AI Config: set default ────────────────────────────────────────────────────
ipcMain.handle('ai:set-default', async (_, provider: string, model: string) => {
  let output = ''
  const code = await spawnCLI(
    ['ai', 'config', 'set-default', '--provider', provider, '--model', model],
    (msg) => { output += msg },
  )
  return { success: code === 0, output }
})

// ── AI Config: set provider key ───────────────────────────────────────────────
ipcMain.handle('ai:set-provider-key', async (event, provider: string, apiKey: string) => {
  // Write key directly to .env without spawning interactive CLI
  const envPath = path.join(ROOT, '.env')
  const KEY_MAP: Record<string, string> = {
    qwen: 'QWEN_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY',
    gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', deepseek: 'DEEPSEEK_API_KEY',
    groq: 'GROQ_API_KEY',
  }
  const envVar = KEY_MAP[provider]
  if (!envVar) return { success: false, error: `Unknown provider: ${provider}` }
  if (!apiKey || apiKey.includes('•')) return { success: false, error: 'Invalid key' }

  try {
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : ''
    const regex = new RegExp(`^${envVar}=.*`, 'm')
    if (regex.test(content)) {
      content = content.replace(regex, `${envVar}=${apiKey}`)
    } else {
      content = content.trimEnd() + `\n${envVar}=${apiKey}\n`
    }
    fs.writeFileSync(envPath, content, 'utf-8')
    // Ensure .gitignore covers .env
    const gi = path.join(ROOT, '.gitignore')
    if (fs.existsSync(gi) && !fs.readFileSync(gi, 'utf-8').includes('.env')) {
      fs.appendFileSync(gi, '\n.env\n')
    }
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ── AI Config: remove provider key ───────────────────────────────────────────
ipcMain.handle('ai:remove-provider-key', async (_, provider: string) => {
  let output = ''
  const code = await spawnCLI(['ai', 'key', 'remove', '--provider', provider], (msg) => { output += msg })
  return { success: code === 0, output }
})

// ── AI Config: set agent profile ──────────────────────────────────────────────
ipcMain.handle('ai:set-agent-profile', async (_, purpose: string, provider: string, model: string) => {
  let output = ''
  const code = await spawnCLI(
    ['ai', 'profile', 'set', '--agent', purpose, '--provider', provider, '--model', model],
    (msg) => { output += msg },
  )
  return { success: code === 0, output }
})

// ── AI: test provider ─────────────────────────────────────────────────────────
ipcMain.handle('ai:test-provider', async (_, provider: string, model: string) => {
  let output = ''
  const code = await spawnCLI(['ai', 'test', '--provider', provider, '--model', model], (msg) => { output += msg })
  return { success: code === 0, output }
})

// ── Usage: get summary ────────────────────────────────────────────────────────
ipcMain.handle('usage:get-summary', async () => {
  try {
    const usagePath = path.join(ROOT, '.qwen-agent', 'usage', 'token-usage.json')
    if (!fs.existsSync(usagePath)) {
      return { success: true, summary: { totalRecords: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, totalEstimatedCost: null, byProvider: {}, byModel: {} } }
    }
    const records = JSON.parse(fs.readFileSync(usagePath, 'utf-8')) as Array<{
      providerId: string; model: string; inputTokens: number; outputTokens: number; totalTokens: number; estimatedCost: number | null
    }>
    const byProvider: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCost: number | null; calls: number }> = {}
    const byModel: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCost: number | null; calls: number }> = {}
    let totalInput = 0, totalOutput = 0, totalCost = 0, hasCost = false
    for (const r of records) {
      totalInput += r.inputTokens; totalOutput += r.outputTokens
      if (r.estimatedCost !== null) { totalCost += r.estimatedCost; hasCost = true }
      const p = byProvider[r.providerId] ??= { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: null, calls: 0 }
      p.inputTokens += r.inputTokens; p.outputTokens += r.outputTokens; p.totalTokens += r.totalTokens
      if (r.estimatedCost !== null) p.estimatedCost = (p.estimatedCost ?? 0) + r.estimatedCost
      p.calls++
      const mk = `${r.providerId}/${r.model}`
      const m = byModel[mk] ??= { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: null, calls: 0 }
      m.inputTokens += r.inputTokens; m.outputTokens += r.outputTokens; m.totalTokens += r.totalTokens
      if (r.estimatedCost !== null) m.estimatedCost = (m.estimatedCost ?? 0) + r.estimatedCost
      m.calls++
    }
    return {
      success: true,
      summary: {
        totalRecords: records.length, totalInputTokens: totalInput, totalOutputTokens: totalOutput,
        totalTokens: totalInput + totalOutput, totalEstimatedCost: hasCost ? totalCost : null,
        byProvider, byModel,
      },
    }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ── Usage: clear ──────────────────────────────────────────────────────────────
ipcMain.handle('usage:clear', async () => {
  try {
    const usagePath = path.join(ROOT, '.qwen-agent', 'usage', 'token-usage.json')
    if (fs.existsSync(usagePath)) fs.writeFileSync(usagePath, '[]', 'utf-8')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})
