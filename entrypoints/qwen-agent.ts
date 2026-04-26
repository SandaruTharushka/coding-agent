/**
 * Qwen-powered local CLI coding assistant.
 *
 * Usage:
 *   QWEN_API_KEY=<key> node dist/entrypoints/qwen-agent.js [task]
 *
 * Slash commands: /init /status /model /config /compact /diff /commit /help
 *
 * Env vars:
 *   QWEN_API_KEY, QWEN_BASE_URL, QWEN_MODEL, QWEN_STREAM, QWEN_MAX_TOKENS
 */

import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { execSync, spawn } from 'child_process'
import {
  qwenChatCompletion,
  qwenChatCompletionStream,
  type QwenMessage,
  type QwenTool,
  type QwenToolCall,
} from '../services/api/qwen-provider.js'
import { getQwenModel } from '../utils/model/qwen-models.js'

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: QwenTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file at the given path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative file path' },
          offset: { type: 'number', description: 'Line number to start reading from (1-based)' },
          limit: { type: 'number', description: 'Maximum number of lines to read' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Write content to a file. ALWAYS call read_file first for existing files. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'File content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Replace an exact string in a file. ALWAYS read_file first to get the exact current content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old_string: { type: 'string', description: 'Exact string to replace' },
          new_string: { type: 'string', description: 'Replacement string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory (non-recursive by default).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (default: current dir)' },
          recursive: { type: 'boolean', description: 'Whether to list recursively' },
          pattern: { type: 'string', description: 'Glob pattern filter (e.g. "*.ts")' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_text',
      description: 'Search for text in files using grep.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search pattern (regex supported)' },
          path: { type: 'string', description: 'Directory or file to search in' },
          case_sensitive: { type: 'boolean', description: 'Case-sensitive search (default true)' },
          include: { type: 'string', description: 'File glob to include (e.g. "*.ts")' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Run a shell command. Use for npm, tsc, git, tests etc. Output is capped at 200 lines.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run' },
          cwd: { type: 'string', description: 'Working directory (default: current dir)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show git diff for the current working directory or a specific file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional file path to diff' },
          staged: { type: 'boolean', description: 'Show staged (--cached) diff' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Show the current git status.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
]

// ─── State ───────────────────────────────────────────────────────────────────

interface AgentState {
  messages: QwenMessage[]
  filesRead: Set<string>
  model: string
  cwd: string
  totalTokens: number
}

// ─── Tool executors ───────────────────────────────────────────────────────────

function toolReadFile(args: { path: string; offset?: number; limit?: number }): string {
  const absPath = path.resolve(args.path)
  if (!fs.existsSync(absPath)) return `Error: File not found: ${absPath}`
  const lines = fs.readFileSync(absPath, 'utf8').split('\n')
  const start = Math.max(0, (args.offset ?? 1) - 1)
  const end = args.limit ? start + args.limit : lines.length
  const slice = lines.slice(start, end)
  return slice.map((l, i) => `${start + i + 1}\t${l}`).join('\n')
}

function toolWriteFile(
  args: { path: string; content: string },
  state: AgentState,
): string {
  const absPath = path.resolve(args.path)
  if (fs.existsSync(absPath) && !state.filesRead.has(absPath)) {
    return `Safety: must read_file("${args.path}") before writing to it.`
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true })
  fs.writeFileSync(absPath, args.content, 'utf8')
  state.filesRead.add(absPath)
  return `Written ${fs.statSync(absPath).size} bytes to ${absPath}`
}

function toolEditFile(
  args: { path: string; old_string: string; new_string: string },
  state: AgentState,
): string {
  const absPath = path.resolve(args.path)
  if (!fs.existsSync(absPath)) return `Error: File not found: ${absPath}`
  if (!state.filesRead.has(absPath)) {
    return `Safety: must read_file("${args.path}") before editing it.`
  }
  const content = fs.readFileSync(absPath, 'utf8')
  if (!content.includes(args.old_string)) {
    return `Error: old_string not found in ${absPath}. Read the file again to get exact content.`
  }
  const count = (content.split(args.old_string).length - 1)
  if (count > 1) {
    return `Error: old_string found ${count} times — provide more context to make it unique.`
  }
  const updated = content.replace(args.old_string, args.new_string)
  fs.writeFileSync(absPath, updated, 'utf8')
  return `Edited ${absPath} (replaced 1 occurrence)`
}

function toolListFiles(args: {
  path?: string
  recursive?: boolean
  pattern?: string
}): string {
  const dir = path.resolve(args.path ?? '.')
  if (!fs.existsSync(dir)) return `Error: Directory not found: ${dir}`
  try {
    let cmd = `find "${dir}" -maxdepth ${args.recursive ? '10' : '1'}`
    if (args.pattern) cmd += ` -name "${args.pattern}"`
    cmd += ' | sort | head -200'
    return execSync(cmd, { encoding: 'utf8', timeout: 10_000 })
  } catch (e) {
    return `Error listing files: ${e instanceof Error ? e.message : String(e)}`
  }
}

function toolSearchText(args: {
  pattern: string
  path?: string
  case_sensitive?: boolean
  include?: string
}): string {
  const flags = args.case_sensitive === false ? '-ri' : '-r'
  const includeFlag = args.include ? `--include="${args.include}"` : ''
  const searchPath = args.path ? `"${path.resolve(args.path)}"` : '.'
  try {
    const cmd = `grep ${flags} ${includeFlag} --line-number -m 100 "${args.pattern.replace(/"/g, '\\"')}" ${searchPath} 2>/dev/null | head -100`
    const result = execSync(cmd, { encoding: 'utf8', timeout: 15_000 })
    return result || '(no matches)'
  } catch (e: unknown) {
    if (e instanceof Error && 'status' in e && (e as NodeJS.ErrnoException & { status: number }).status === 1) return '(no matches)'
    return `Error: ${e instanceof Error ? e.message : String(e)}`
  }
}

function toolRunCommand(args: { command: string; cwd?: string }): string {
  // Safety: block dangerous commands
  const blocked = /^\s*(rm\s+-rf\s+\/|dd\s+if=|mkfs|shutdown|reboot)/i
  if (blocked.test(args.command)) {
    return 'Error: Command blocked for safety reasons.'
  }
  try {
    const output = execSync(args.command, {
      cwd: args.cwd ?? process.cwd(),
      encoding: 'utf8',
      timeout: 60_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const lines = output.split('\n')
    if (lines.length > 200) {
      return lines.slice(0, 200).join('\n') + `\n... (${lines.length - 200} more lines truncated)`
    }
    return output || '(no output)'
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    const out = [err.stdout, err.stderr].filter(Boolean).join('\n')
    return out ? out.slice(0, 4000) : `Error: ${err.message ?? String(e)}`
  }
}

function toolGitDiff(args: { path?: string; staged?: boolean }): string {
  const staged = args.staged ? '--cached ' : ''
  const filePath = args.path ? `-- "${args.path}"` : ''
  try {
    const output = execSync(`git diff ${staged}${filePath}`, {
      encoding: 'utf8',
      timeout: 15_000,
    })
    return output || '(no diff)'
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`
  }
}

function toolGitStatus(): string {
  try {
    return execSync('git status', { encoding: 'utf8', timeout: 10_000 })
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`
  }
}

function executeToolCall(
  call: QwenToolCall,
  state: AgentState,
): string {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(call.function.arguments)
  } catch {
    return `Error: invalid JSON arguments for tool ${call.function.name}`
  }

  switch (call.function.name) {
    case 'read_file': {
      const result = toolReadFile(args as { path: string; offset?: number; limit?: number })
      state.filesRead.add(path.resolve((args as { path: string }).path))
      return result
    }
    case 'write_file':
      return toolWriteFile(args as { path: string; content: string }, state)
    case 'edit_file':
      return toolEditFile(args as { path: string; old_string: string; new_string: string }, state)
    case 'list_files':
      return toolListFiles(args as { path?: string; recursive?: boolean; pattern?: string })
    case 'search_text':
      return toolSearchText(args as { pattern: string; path?: string; case_sensitive?: boolean; include?: string })
    case 'run_command':
      return toolRunCommand(args as { command: string; cwd?: string })
    case 'git_diff':
      return toolGitDiff(args as { path?: string; staged?: boolean })
    case 'git_status':
      return toolGitStatus()
    default:
      return `Error: unknown tool "${call.function.name}"`
  }
}

// ─── Agent loop ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a local CLI coding assistant powered by Qwen. You help users with software engineering tasks.

Guidelines:
- Always read files before editing them (use read_file first)
- Run git_status before making file changes
- Never print .env file contents
- Never expose API keys
- Write changes directly to disk using write_file or edit_file
- After completing changes, show a short summary: files changed, what was done
- Keep chat responses concise (under 800 words). For long outputs, write to a file.
- For large tasks, break into phases and confirm with the user
- Run npm run build or tsc after TypeScript changes to verify correctness`

async function runAgentLoop(state: AgentState, userMessage: string): Promise<void> {
  state.messages.push({ role: 'user', content: userMessage })

  const useStream = process.env.QWEN_STREAM !== 'false'

  let iterations = 0
  const MAX_ITERATIONS = 20

  while (iterations < MAX_ITERATIONS) {
    iterations++

    let assistantContent = ''
    let toolCalls: QwenToolCall[] = []

    if (useStream) {
      // Streaming mode
      process.stdout.write('\n\x1b[36mAssistant:\x1b[0m ')
      try {
        const stream = qwenChatCompletionStream({
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...state.messages],
          tools: TOOLS,
          tool_choice: 'auto',
        })

        const pendingToolCalls: Map<number, { id: string; name: string; args: string }> = new Map()

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta
          if (!delta) continue

          if (delta.content) {
            process.stdout.write(delta.content)
            assistantContent += delta.content
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!pendingToolCalls.has(idx)) {
                pendingToolCalls.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' })
              }
              const pending = pendingToolCalls.get(idx)!
              if (tc.id) pending.id = tc.id
              if (tc.function?.name) pending.name = tc.function.name
              if (tc.function?.arguments) pending.args += tc.function.arguments
            }
          }
        }

        toolCalls = Array.from(pendingToolCalls.values()).map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.args },
        }))
      } catch (err) {
        console.error('\n\x1b[31mStream error, falling back to non-stream\x1b[0m')
        // Fall back to non-streaming
        const resp = await qwenChatCompletion({
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...state.messages],
          tools: TOOLS,
          tool_choice: 'auto',
        })
        const msg = resp.choices[0]?.message
        assistantContent = msg?.content ?? ''
        toolCalls = msg?.tool_calls ?? []
        if (assistantContent) process.stdout.write(assistantContent)
        state.totalTokens += resp.usage?.total_tokens ?? 0
      }
    } else {
      // Non-streaming mode
      const resp = await qwenChatCompletion({
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...state.messages],
        tools: TOOLS,
        tool_choice: 'auto',
      })
      const msg = resp.choices[0]?.message
      assistantContent = msg?.content ?? ''
      toolCalls = msg?.tool_calls ?? []
      state.totalTokens += resp.usage?.total_tokens ?? 0
      if (assistantContent) {
        process.stdout.write('\n\x1b[36mAssistant:\x1b[0m ' + assistantContent)
      }
    }

    // Record assistant turn
    if (toolCalls.length > 0) {
      state.messages.push({
        role: 'assistant',
        content: assistantContent || '',
        // tool_calls embedded in content for simplicity — we add tool results next
      } as QwenMessage)
    } else {
      state.messages.push({ role: 'assistant', content: assistantContent })
      process.stdout.write('\n')
      break
    }

    // Execute tool calls
    console.log('\n')
    for (const call of toolCalls) {
      console.log(`\x1b[33m[tool]\x1b[0m ${call.function.name}(${trimArgs(call.function.arguments)})`)
      const result = executeToolCall(call, state)
      const truncated = result.length > 8000 ? result.slice(0, 8000) + '\n...(truncated)' : result
      console.log(`\x1b[32m[result]\x1b[0m ${truncated.slice(0, 300)}${truncated.length > 300 ? '...' : ''}\n`)

      state.messages.push({
        role: 'tool',
        content: truncated,
        tool_call_id: call.id,
        name: call.function.name,
      })
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    console.log('\x1b[31m[agent] Reached max iterations.\x1b[0m')
  }
}

function trimArgs(argsJson: string): string {
  try {
    const obj = JSON.parse(argsJson)
    const str = JSON.stringify(obj)
    return str.length > 100 ? str.slice(0, 100) + '...' : str
  } catch {
    return argsJson.slice(0, 100)
  }
}

// ─── Slash commands ───────────────────────────────────────────────────────────

function handleSlashCommand(cmd: string, state: AgentState): boolean {
  const [command, ...rest] = cmd.trim().split(/\s+/)
  switch (command) {
    case '/help':
      console.log(`
\x1b[36mQwen Coding Agent — Slash Commands\x1b[0m
  /init          Initialize project (run git status, list files, read README)
  /status        Show git status and current model
  /model [name]  Show or set the model (also via QWEN_MODEL env)
  /config        Show current configuration
  /compact       Summarize and compact conversation history
  /diff          Show git diff of current changes
  /commit [msg]  Stage all and commit with message
  /help          Show this help
`)
      return true

    case '/status': {
      console.log(`Model: ${state.model}`)
      console.log(`Messages: ${state.messages.length}`)
      console.log(`Total tokens (approx): ${state.totalTokens}`)
      console.log(`CWD: ${state.cwd}`)
      try {
        console.log(execSync('git status --short', { encoding: 'utf8', timeout: 5000 }))
      } catch {
        console.log('(not a git repo)')
      }
      return true
    }

    case '/model':
      if (rest.length > 0) {
        process.env.QWEN_MODEL = rest[0]
        state.model = rest[0]
        console.log(`Model set to: ${state.model}`)
      } else {
        console.log(`Current model: ${state.model}`)
        console.log('Set with: /model <model-name> or QWEN_MODEL env var')
      }
      return true

    case '/config':
      console.log(`\x1b[36mConfiguration:\x1b[0m`)
      console.log(`  QWEN_MODEL:      ${process.env.QWEN_MODEL ?? '(not set, using default)'}`)
      console.log(`  QWEN_BASE_URL:   ${process.env.QWEN_BASE_URL ?? '(using default DashScope)'}`)
      console.log(`  QWEN_API_KEY:    ${process.env.QWEN_API_KEY ? '***set***' : '(NOT SET)'}`)
      console.log(`  QWEN_MAX_TOKENS: ${process.env.QWEN_MAX_TOKENS ?? '4096'}`)
      console.log(`  QWEN_STREAM:     ${process.env.QWEN_STREAM ?? 'true'}`)
      console.log(`  QWEN_TIMEOUT_MS: ${process.env.QWEN_TIMEOUT_MS ?? '120000'}`)
      return true

    case '/compact': {
      if (state.messages.length < 4) {
        console.log('Nothing to compact.')
        return true
      }
      // Keep system + last 4 messages, summarize the rest
      const older = state.messages.slice(0, -4)
      const summary = `[Compacted ${older.length} messages. Summary: user asked to perform coding tasks, assistant used tools to read/write files and run commands.]`
      state.messages = [
        { role: 'user', content: summary },
        { role: 'assistant', content: 'Understood. Continuing from compact context.' },
        ...state.messages.slice(-4),
      ]
      console.log(`Compacted to ${state.messages.length} messages.`)
      return true
    }

    case '/diff':
      try {
        const diff = execSync('git diff', { encoding: 'utf8', timeout: 10_000 })
        console.log(diff || '(no changes)')
      } catch (e) {
        console.log(`Error: ${e instanceof Error ? e.message : String(e)}`)
      }
      return true

    case '/commit': {
      const message = rest.join(' ') || `chore: agent changes (${new Date().toISOString()})`
      try {
        execSync('git add -A', { encoding: 'utf8' })
        const out = execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { encoding: 'utf8' })
        console.log(out)
      } catch (e) {
        console.log(`Commit failed: ${e instanceof Error ? e.message : String(e)}`)
      }
      return true
    }

    case '/init': {
      console.log('Initializing project context...')
      const initMessages: string[] = []
      try {
        initMessages.push('Git status:\n' + execSync('git status', { encoding: 'utf8', timeout: 5000 }))
      } catch { initMessages.push('(not a git repo)') }
      try {
        initMessages.push('Files:\n' + execSync('find . -maxdepth 2 -type f | grep -v node_modules | grep -v .git | sort | head -50', { encoding: 'utf8', timeout: 5000 }))
      } catch { /* ignore */ }
      if (fs.existsSync('README.md')) {
        const readme = fs.readFileSync('README.md', 'utf8').slice(0, 2000)
        initMessages.push('README:\n' + readme)
      }
      if (fs.existsSync('package.json')) {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        initMessages.push(`package.json: name=${pkg.name}, scripts=${JSON.stringify(Object.keys(pkg.scripts ?? {}))}`)
      }
      console.log(initMessages.join('\n\n'))
      return true
    }

    default:
      return false
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Validate API key early
  if (!process.env.QWEN_API_KEY) {
    console.error('\x1b[31mError: QWEN_API_KEY is not set.\x1b[0m')
    console.error('Export it: export QWEN_API_KEY=your-key')
    process.exit(1)
  }

  const state: AgentState = {
    messages: [],
    filesRead: new Set(),
    model: getQwenModel(),
    cwd: process.cwd(),
    totalTokens: 0,
  }

  // Run git status as safety check at startup
  try {
    const status = execSync('git status --short', { encoding: 'utf8', timeout: 5000 })
    if (status.trim()) {
      console.log('\x1b[33m[git]\x1b[0m Uncommitted changes detected:')
      console.log(status)
    }
  } catch {
    // not a git repo — that's fine
  }

  console.log(`\x1b[36mQwen Coding Agent\x1b[0m — model: ${state.model}`)
  console.log('Type /help for commands, Ctrl+C to exit.\n')

  // If a task was passed as CLI argument, run it immediately
  const taskArg = process.argv.slice(2).join(' ').trim()
  if (taskArg && !taskArg.startsWith('/')) {
    await runAgentLoop(state, taskArg)
    process.exit(0)
  }

  // Interactive REPL
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[35m> \x1b[0m',
  })

  rl.prompt()

  rl.on('line', async (line: string) => {
    const input = line.trim()
    if (!input) {
      rl.prompt()
      return
    }

    if (input === '/exit' || input === '/quit') {
      rl.close()
      return
    }

    if (input.startsWith('/')) {
      handleSlashCommand(input, state)
      rl.prompt()
      return
    }

    try {
      await runAgentLoop(state, input)
    } catch (err) {
      console.error('\x1b[31mAgent error:\x1b[0m', err instanceof Error ? err.message : String(err))
    }
    rl.prompt()
  })

  rl.on('close', () => {
    console.log('\nGoodbye.')
    process.exit(0)
  })
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
