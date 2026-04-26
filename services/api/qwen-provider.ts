/**
 * Qwen OpenAI-compatible provider for Claude Code.
 *
 * Env vars:
 *   QWEN_API_KEY    — required
 *   QWEN_BASE_URL   — optional, defaults to DashScope international endpoint
 *   QWEN_MODEL      — optional, defaults to qwen-plus
 *   QWEN_STREAM     — set to "false" to disable streaming
 *   QWEN_MAX_TOKENS — optional, max output tokens (default 4096)
 *   QWEN_TIMEOUT_MS — optional, request timeout ms (default 120000)
 */

import { getQwenApiKey, getQwenBaseUrl, getQwenModel } from '../../utils/model/qwen-models.js'

export interface QwenMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | QwenToolCallContent[]
  tool_call_id?: string
  name?: string
}

export interface QwenToolCallContent {
  type: 'text'
  text: string
}

export interface QwenTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface QwenToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface QwenChoice {
  index: number
  message: {
    role: string
    content: string | null
    tool_calls?: QwenToolCall[]
  }
  finish_reason: string
}

export interface QwenResponse {
  id: string
  object: string
  created: number
  model: string
  choices: QwenChoice[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface QwenStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string
      tool_calls?: Array<{
        index: number
        id?: string
        type?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason: string | null
  }>
}

export interface QwenCompletionOptions {
  messages: QwenMessage[]
  tools?: QwenTool[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  stream?: boolean
  max_tokens?: number
  temperature?: number
}

const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_TIMEOUT_MS = 120_000
const MAX_RETRIES = 3

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function qwenChatCompletion(
  options: QwenCompletionOptions,
): Promise<QwenResponse> {
  const apiKey = getQwenApiKey()
  const baseUrl = getQwenBaseUrl()
  const model = getQwenModel()
  const timeoutMs = parseInt(process.env.QWEN_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10)
  const maxTokens = parseInt(process.env.QWEN_MAX_TOKENS ?? String(DEFAULT_MAX_TOKENS), 10)

  const body = JSON.stringify({
    model,
    messages: options.messages,
    ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
    ...(options.tool_choice ? { tool_choice: options.tool_choice } : {}),
    stream: false,
    max_tokens: options.max_tokens ?? maxTokens,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  })

  let lastError: Error | null = null
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(Math.pow(2, attempt) * 1000)
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        throw new Error(`Qwen API error ${res.status}: ${errText}`)
      }

      return (await res.json()) as QwenResponse
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (lastError.name === 'AbortError') {
        throw new Error(`Qwen API timed out after ${timeoutMs}ms`)
      }
    }
  }
  throw lastError ?? new Error('Qwen API request failed after retries')
}

export async function* qwenChatCompletionStream(
  options: QwenCompletionOptions,
): AsyncGenerator<QwenStreamChunk> {
  const apiKey = getQwenApiKey()
  const baseUrl = getQwenBaseUrl()
  const model = getQwenModel()
  const timeoutMs = parseInt(process.env.QWEN_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10)
  const maxTokens = parseInt(process.env.QWEN_MAX_TOKENS ?? String(DEFAULT_MAX_TOKENS), 10)

  const body = JSON.stringify({
    model,
    messages: options.messages,
    ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
    ...(options.tool_choice ? { tool_choice: options.tool_choice } : {}),
    stream: true,
    max_tokens: options.max_tokens ?? maxTokens,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const e = err instanceof Error ? err : new Error(String(err))
    if (e.name === 'AbortError') throw new Error(`Qwen API timed out after ${timeoutMs}ms`)
    throw e
  }

  if (!res.ok) {
    clearTimeout(timer)
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Qwen API error ${res.status}: ${errText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) {
    clearTimeout(timer)
    throw new Error('No response body from Qwen API')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (trimmed.startsWith('data: ')) {
          try {
            yield JSON.parse(trimmed.slice(6)) as QwenStreamChunk
          } catch {
            // malformed chunk — skip
          }
        }
      }
    }
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
}
