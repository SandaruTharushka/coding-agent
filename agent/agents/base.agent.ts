import {
  qwenChatCompletion,
  qwenChatCompletionStream,
  type QwenMessage,
  type QwenTool,
  type QwenToolCall,
} from '../../services/api/qwen-provider.js'
import { readFile, writeFile, editFile, searchFile, listFiles } from '../tools/file.tools.js'
import { runCommand } from '../shell/executor.js'

export interface AgentOptions {
  systemPrompt: string
  tools?: QwenTool[]
  maxIterations?: number
  stream?: boolean
  silent?: boolean
}

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string> | string

const BASE_TOOLS: QwenTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read file contents. Always call before editing.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative or absolute path' },
          offset: { type: 'number', description: 'Start line (1-based)' },
          limit: { type: 'number', description: 'Max lines to read' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write full content to a file (creates if missing).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace an exact unique string in a file. Must read_file first.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string', description: 'Exact string to replace (must be unique)' },
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
      description: 'List files in a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (default: cwd)' },
          recursive: { type: 'boolean' },
          pattern: { type: 'string', description: 'Glob pattern, e.g. "*.ts"' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_file',
      description: 'Search for text in files using grep.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern' },
          path: { type: 'string', description: 'Directory to search (default: cwd)' },
          include: { type: 'string', description: 'File glob, e.g. "*.ts"' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command (npm, tsc, git, etc.). Output capped at 200 lines.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string' },
        },
        required: ['command'],
      },
    },
  },
]

async function execBaseTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'read_file':
      return readFile(
        args.path as string,
        args.offset as number | undefined,
        args.limit as number | undefined,
      )
    case 'write_file':
      return writeFile(args.path as string, args.content as string)
    case 'edit_file':
      return editFile(args.path as string, args.old_string as string, args.new_string as string)
    case 'list_files':
      return listFiles(
        args.path as string | undefined,
        args.recursive as boolean | undefined,
        args.pattern as string | undefined,
      )
    case 'search_file':
      return searchFile(
        args.pattern as string,
        args.path as string | undefined,
        args.include as string | undefined,
      )
    case 'run_command': {
      // In agent context, only SAFE-classified commands run automatically.
      // CAUTION/DANGEROUS commands require human approval which cannot be
      // granted interactively here — reject them so the LLM uses a safe alternative.
      const { validateCommand, RiskLevel } = await import('../../src/safety/shellSafety.js')
      const safety = validateCommand(args.command as string)
      if (safety.level === RiskLevel.BLOCKED) {
        return `BLOCKED: ${safety.reason}. This command is forbidden — choose a different approach.`
      }
      if (safety.level !== RiskLevel.SAFE) {
        return `REJECTED (${safety.level}): "${safety.command}" requires human approval and cannot run in automated agent context. ${safety.reason}. Only read-only / build / lint / test commands are permitted here.`
      }
      const r = await runCommand(args.command as string, {
        cwd: args.cwd as string | undefined,
        requireApproval: false,
        silent: true,
      })
      const combined = [r.stdout, r.stderr ? `STDERR: ${r.stderr}` : ''].filter(Boolean).join('\n')
      return combined.slice(0, 8000) || '(no output)'
    }
    default:
      return `Unknown tool: ${name}`
  }
}

function trimArgs(json: string): string {
  try {
    const s = JSON.stringify(JSON.parse(json))
    return s.length > 120 ? s.slice(0, 120) + '...' : s
  } catch {
    return json.slice(0, 120)
  }
}

export async function runAgent(
  messages: QwenMessage[],
  options: AgentOptions,
  customExecutor?: ToolExecutor,
): Promise<string> {
  const tools = [...BASE_TOOLS, ...(options.tools ?? [])]
  const allMessages: QwenMessage[] = [
    { role: 'system', content: options.systemPrompt },
    ...messages,
  ]

  const maxIter = options.maxIterations ?? 20
  const useStream = (options.stream ?? process.env.QWEN_STREAM !== 'false') && !options.silent
  let finalContent = ''

  for (let iter = 0; iter < maxIter; iter++) {
    let assistantContent = ''
    let toolCalls: QwenToolCall[] = []

    if (useStream) {
      process.stdout.write('\n\x1b[36mAgent:\x1b[0m ')
      try {
        const stream = qwenChatCompletionStream({
          messages: allMessages,
          tools,
          tool_choice: 'auto',
        })
        const pending = new Map<number, { id: string; name: string; args: string }>()
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
              if (!pending.has(idx))
                pending.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' })
              const p = pending.get(idx)!
              if (tc.id) p.id = tc.id
              if (tc.function?.name) p.name = tc.function.name
              if (tc.function?.arguments) p.args += tc.function.arguments
            }
          }
        }
        toolCalls = Array.from(pending.values()).map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.args },
        }))
      } catch {
        const resp = await qwenChatCompletion({ messages: allMessages, tools, tool_choice: 'auto' })
        const msg = resp.choices[0]?.message
        assistantContent = msg?.content ?? ''
        toolCalls = msg?.tool_calls ?? []
        if (assistantContent) process.stdout.write(assistantContent)
      }
    } else {
      const resp = await qwenChatCompletion({ messages: allMessages, tools, tool_choice: 'auto' })
      const msg = resp.choices[0]?.message
      assistantContent = msg?.content ?? ''
      toolCalls = msg?.tool_calls ?? []
    }

    if (toolCalls.length === 0) {
      finalContent = assistantContent
      if (!options.silent) process.stdout.write('\n')
      break
    }

    allMessages.push({ role: 'assistant', content: assistantContent || '' })
    if (!options.silent) console.log('\n')

    for (const call of toolCalls) {
      let args: Record<string, unknown>
      try {
        args = JSON.parse(call.function.arguments)
      } catch {
        args = {}
      }

      if (!options.silent) {
        console.log(`\x1b[33m[tool]\x1b[0m ${call.function.name}(${trimArgs(call.function.arguments)})`)
      }

      let result: string
      try {
        if (customExecutor) {
          const r = await customExecutor(call.function.name, args)
          result = r === '__UNHANDLED__' ? await execBaseTool(call.function.name, args) : r
        } else {
          result = await execBaseTool(call.function.name, args)
        }
      } catch (e) {
        result = `Error: ${e instanceof Error ? e.message : String(e)}`
      }

      const truncated =
        result.length > 8000 ? result.slice(0, 8000) + '\n...(truncated)' : result

      if (!options.silent) {
        console.log(
          `\x1b[32m[result]\x1b[0m ${truncated.slice(0, 300)}${truncated.length > 300 ? '...' : ''}`,
        )
      }

      allMessages.push({
        role: 'tool',
        content: truncated,
        tool_call_id: call.id,
        name: call.function.name,
      })
    }
  }

  return finalContent
}
