import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { spawn, execSync, spawnSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const isDev = process.env.NODE_ENV === 'development'
const IS_WINDOWS = process.platform === 'win32'

// dist-electron/main.js → desktop/ → project root
const ROOT = path.resolve(__dirname, '..', '..')
const DESKTOP_DIR = path.resolve(__dirname, '..')

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

// Catch any unhandled error in the main process so Electron does NOT show its
// default uncaught-exception dialog. We forward a readable message to the
// renderer instead and keep the process alive.
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[main] uncaughtException:', err)
  try {
    BrowserWindow.getAllWindows().forEach((w) => {
      w.webContents.send('agent:progress', {
        type: 'error',
        message: `[main] uncaught exception: ${err?.message ?? String(err)}`,
        timestamp: new Date().toISOString(),
      })
    })
  } catch { /* noop */ }
})

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[main] unhandledRejection:', reason)
})

// ─── tsx / npx resolution ─────────────────────────────────────────────────────
// On Windows the tool installed by npm into node_modules/.bin is `tsx.cmd`
// (Linux/macOS use a shebang script named `tsx`). We probe a list of known
// locations and fall back to `npx` if nothing local is installed.

interface ResolvedRunner {
  /** Absolute path or bare command name (`npx`). */
  cmd: string
  /** Whether this command must be invoked through a shell (true for .cmd/.bat). */
  shell: boolean
  /** If true the command needs `tsx` prepended to args (npx fallback). */
  needsNpxPrefix: boolean
  /** Origin description for diagnostics. */
  origin: string
}

function fileExists(p: string): boolean {
  try { return fs.existsSync(p) } catch { return false }
}

function resolveTsx(): ResolvedRunner | null {
  const candidates: Array<{ p: string; shell: boolean; origin: string }> = []

  if (IS_WINDOWS) {
    candidates.push(
      { p: path.join(ROOT, 'node_modules', '.bin', 'tsx.cmd'), shell: true, origin: 'root/.bin/tsx.cmd' },
      { p: path.join(ROOT, 'node_modules', '.bin', 'tsx.exe'), shell: false, origin: 'root/.bin/tsx.exe' },
      { p: path.join(DESKTOP_DIR, 'node_modules', '.bin', 'tsx.cmd'), shell: true, origin: 'desktop/.bin/tsx.cmd' },
      { p: path.join(DESKTOP_DIR, 'node_modules', '.bin', 'tsx.exe'), shell: false, origin: 'desktop/.bin/tsx.exe' },
    )
  }
  candidates.push(
    { p: path.join(ROOT, 'node_modules', '.bin', 'tsx'), shell: false, origin: 'root/.bin/tsx' },
    { p: path.join(DESKTOP_DIR, 'node_modules', '.bin', 'tsx'), shell: false, origin: 'desktop/.bin/tsx' },
  )

  for (const c of candidates) {
    if (fileExists(c.p)) {
      return { cmd: c.p, shell: c.shell, needsNpxPrefix: false, origin: c.origin }
    }
  }

  // Fallback: rely on npx. We don't try to validate it on disk because
  // `npx` ships with Node and is on PATH for any user who can install Electron.
  const npxCmd = IS_WINDOWS ? 'npx.cmd' : 'npx'
  return { cmd: npxCmd, shell: IS_WINDOWS, needsNpxPrefix: true, origin: 'npx (PATH)' }
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

const SPAWN_FAILED_EXIT = -1

function spawnCLI(
  args: string[],
  onData: (line: string) => void,
): Promise<number> {
  const cli = getCLI()

  // Verify CLI script is present before launching anything.
  if (!fileExists(cli)) {
    const msg =
      `Error: agent CLI entry not found at ${cli}\n` +
      `Make sure you're running the desktop app from the project root.\n`
    onData(msg)
    return Promise.resolve(SPAWN_FAILED_EXIT)
  }

  const runner = resolveTsx()
  if (!runner) {
    onData('Error: could not resolve a tsx runner (no local install and no npx on PATH).\n')
    return Promise.resolve(SPAWN_FAILED_EXIT)
  }

  const spawnArgs = runner.needsNpxPrefix
    ? ['tsx', cli, ...args]
    : [cli, ...args]

  return new Promise((resolve) => {
    let settled = false
    const settle = (code: number) => {
      if (settled) return
      settled = true
      resolve(code)
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(runner.cmd, spawnArgs, {
        cwd: ROOT,
        env: { ...process.env },
        // .cmd / .bat files on Windows require a shell to be invoked.
        shell: runner.shell,
        windowsHide: true,
      })
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      onData(
        `Error: failed to spawn agent runner (${runner.origin}): ${e?.code ?? ''} ${e?.message ?? String(e)}\n` +
        `Hint: run \`npm install\` in the project root to install tsx.\n`,
      )
      settle(SPAWN_FAILED_EXIT)
      return
    }

    child.on('error', (err: NodeJS.ErrnoException) => {
      const code = err?.code ?? ''
      const hint =
        code === 'ENOENT'
          ? `Hint: \`${runner.cmd}\` was not found. Run \`npm install\` in the project root, or ensure Node/npx is on PATH.\n`
          : ''
      onData(`Error: agent process failed (${runner.origin}): ${code} ${err?.message ?? String(err)}\n${hint}`)
      settle(SPAWN_FAILED_EXIT)
    })

    child.stdout?.on('data', (d: Buffer) => {
      try { onData(stripAnsi(d.toString())) } catch { /* noop */ }
    })
    child.stderr?.on('data', (d: Buffer) => {
      try { onData(stripAnsi(d.toString())) } catch { /* noop */ }
    })

    child.on('close', (code) => settle(typeof code === 'number' ? code : SPAWN_FAILED_EXIT))
    child.on('exit', (code) => settle(typeof code === 'number' ? code : SPAWN_FAILED_EXIT))
  })
}

function runGit(args: string[], timeout = 10000): string {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim()
    const stdout = (result.stdout || '').trim()
    throw new Error(stderr || stdout || `git ${args.join(' ')} failed`)
  }

  return result.stdout || ''
}

// ─── Active-task guard: prevent duplicate concurrent runs ─────────────────────
let activeTaskCount = 0

async function runAgentExclusive<T>(fn: () => Promise<T>, busy: T): Promise<T> {
  if (activeTaskCount > 0) return busy
  activeTaskCount++
  try {
    return await fn()
  } finally {
    activeTaskCount = Math.max(0, activeTaskCount - 1)
  }
}

// ── Agent: run full apply pipeline (streaming) ────────────────────────────────
ipcMain.handle('agent:run-task', async (event, task: string) => {
  const sessionId = `session-${Date.now()}`

  if (activeTaskCount > 0) {
    event.sender.send('agent:progress', {
      type: 'error',
      message: 'Another task is already running. Wait for it to finish before starting a new one.',
      timestamp: new Date().toISOString(),
    })
    event.sender.send('agent:complete', { success: false, sessionId, exitCode: SPAWN_FAILED_EXIT })
    return { sessionId, busy: true }
  }

  activeTaskCount++
  let code = SPAWN_FAILED_EXIT
  try {
    code = await spawnCLI(['apply', task], (msg) => {
      event.sender.send('agent:progress', {
        type: /\berror\b/i.test(msg) ? 'error' : 'log',
        message: msg,
        timestamp: new Date().toISOString(),
      })
    })
  } catch (err) {
    event.sender.send('agent:progress', {
      type: 'error',
      message: `[main] agent task crashed: ${(err as Error)?.message ?? String(err)}`,
      timestamp: new Date().toISOString(),
    })
  } finally {
    activeTaskCount = Math.max(0, activeTaskCount - 1)
  }

  event.sender.send('agent:complete', { success: code === 0, sessionId, exitCode: code })
  return { sessionId }
})

// ── Agent: scan project ───────────────────────────────────────────────────────
ipcMain.handle('agent:scan-project', async () =>
  runAgentExclusive(async () => {
    let output = ''
    const code = await spawnCLI(['scan'], (msg) => { output += msg })
    return { success: code === 0, output }
  }, { success: false, output: 'Another agent task is already running.' }),
)

// ── Agent: build context ──────────────────────────────────────────────────────
ipcMain.handle('agent:build-context', async (_, task: string) =>
  runAgentExclusive(async () => {
    let output = ''
    const code = await spawnCLI(['context', task], (msg) => { output += msg })
    return { success: code === 0, output }
  }, { success: false, output: 'Another agent task is already running.' }),
)

// ── Agent: preview diff ───────────────────────────────────────────────────────
ipcMain.handle('agent:preview-diff', async () => {
  try {
    const diff = runGit(['diff', 'HEAD'], 10000)
    const status = runGit(['status', '--short'], 5000)
    let sessions = ''
    await spawnCLI(['edit-sessions', '--json'], (msg) => { sessions += msg })
    return { success: true, diff, status, sessions }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message, diff: '', status: '', sessions: '' }
  }
})

// ── Agent: apply patch ────────────────────────────────────────────────────────
ipcMain.handle('agent:apply-patch', async (event, sessionId: string) =>
  runAgentExclusive(async () => {
    let output = ''
    const args = sessionId ? ['apply'] : ['apply']
    const code = await spawnCLI(args, (msg) => {
      output += msg
      event.sender.send('agent:progress', { type: 'log', message: msg, timestamp: new Date().toISOString() })
    })
    return { success: code === 0, output }
  }, { success: false, output: 'Another agent task is already running.' }),
)

// ── Agent: rollback ───────────────────────────────────────────────────────────
ipcMain.handle('agent:rollback', async (event, sessionId: string) =>
  runAgentExclusive(async () => {
    let output = ''
    const args = sessionId ? ['rollback', sessionId] : ['rollback']
    const code = await spawnCLI(args, (msg) => {
      output += msg
      event.sender.send('agent:progress', { type: 'log', message: msg, timestamp: new Date().toISOString() })
    })
    return { success: code === 0, output }
  }, { success: false, output: 'Another agent task is already running.' }),
)

// ── Agent: run verification ───────────────────────────────────────────────────
ipcMain.handle('agent:verify', async (event) =>
  runAgentExclusive(async () => {
    let output = ''
    const code = await spawnCLI(['verify'], (msg) => {
      output += msg
      event.sender.send('agent:progress', { type: 'log', message: msg, timestamp: new Date().toISOString() })
    })
    return { success: code === 0, output }
  }, { success: false, output: 'Another agent task is already running.' }),
)

// ── Project: get file tree ────────────────────────────────────────────────────
interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

// Directories that explode the file tree or expose external content.
// Skipped at every depth, not just the root, to avoid scanning huge external
// folders accidentally pulled in by symlinks or nested git checkouts.
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-electron',
  'build',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
  '.turbo',
  '.parcel-cache',
  'coverage',
  '.pytest_cache',
])

function isPathInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function readDir(dirPath: string, depth = 0): FileNode[] {
  if (depth > 6) return []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes: FileNode[] = []
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    if (e.name.startsWith('.') && e.name !== '.env' && e.name !== '.gitignore' && e.name !== '.env.example') continue

    const full = path.join(dirPath, e.name)

    // Defensive: if a symlink escapes ROOT, drop it.
    try {
      const real = fs.realpathSync(full)
      if (real !== ROOT && !isPathInside(real, ROOT) && real !== full) continue
    } catch {
      continue
    }

    const rel = path.relative(ROOT, full)
    if (e.isDirectory()) {
      nodes.push({ name: e.name, path: rel, type: 'directory', children: readDir(full, depth + 1) })
    } else if (e.isFile()) {
      nodes.push({ name: e.name, path: rel, type: 'file' })
    }
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

ipcMain.handle('project:get-files', async (_, dir?: string) => {
  const target = dir ? path.resolve(ROOT, dir) : ROOT
  if (target !== ROOT && !isPathInside(target, ROOT)) {
    return { success: false, error: 'Path escape rejected' }
  }
  return { success: true, files: readDir(target) }
})

// ── Project: get file content ─────────────────────────────────────────────────
ipcMain.handle('project:get-file-content', async (_, filePath: string) => {
  const abs = path.resolve(ROOT, filePath)
  if (abs !== ROOT && !isPathInside(abs, ROOT)) {
    return { success: false, error: 'Path escape rejected' }
  }
  try {
    const stat = fs.statSync(abs)
    if (!stat.isFile()) return { success: false, error: 'Not a regular file' }
    if (stat.size > 5 * 1024 * 1024) return { success: false, error: 'File too large to preview (>5MB)' }
    const content = fs.readFileSync(abs, 'utf-8')
    return { success: true, content }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ── Git: status ───────────────────────────────────────────────────────────────
ipcMain.handle('git:status', async () => {
  try {
    // Verify we're inside a git working tree before running other git commands.
    const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: ROOT, encoding: 'utf-8', timeout: 3000,
    })
    if (inside.status !== 0 || (inside.stdout || '').trim() !== 'true') {
      return { success: false, error: 'Not a git repository', branch: 'none', status: '', diff: '' }
    }
    const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
    const status = runGit(['status', '--short'])
    const diff = runGit(['diff', '--stat', 'HEAD'])
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

// ── Diagnostics: runner info ──────────────────────────────────────────────────
ipcMain.handle('diagnostics:runner', async () => {
  const runner = resolveTsx()
  const cli = getCLI()
  return {
    success: true,
    runner: runner
      ? { cmd: runner.cmd, origin: runner.origin, shell: runner.shell, needsNpxPrefix: runner.needsNpxPrefix }
      : null,
    cliPath: cli,
    cliExists: fileExists(cli),
    rootHasNodeModules: fileExists(path.join(ROOT, 'node_modules')),
    desktopHasNodeModules: fileExists(path.join(DESKTOP_DIR, 'node_modules')),
  }
})

// Surface a friendly dialog if the renderer requests one (used by UI on startup
// when it detects that no runner is available).
ipcMain.handle('diagnostics:show-error', async (_, title: string, msg: string) => {
  try {
    await dialog.showMessageBox({ type: 'error', title, message: msg })
  } catch { /* noop */ }
  return { success: true }
})
