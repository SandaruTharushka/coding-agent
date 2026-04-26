/**
 * Qwen OpenAI-compatible API provider.
 *
 * All configuration is obtained from the centralized config loader.
 * Do not read QWEN_* env vars directly in this file.
 */

import { loadQwenConfig } from '../../src/config/qwenConfig.js'

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

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

function friendlyHttpError(status: number, body: string): Error {
  if (status === 401 || status === 403) {
    return new Error(
      `Qwen API authentication failed (${status}). Check your QWEN_API_KEY.\nDetail: ${body}`,
    )
  }
  if (status === 429) {
    return new Error(`Qwen API rate limit exceeded (429). Will retry with backoff.\nDetail: ${body}`)
  }
  return new Error(`Qwen API error ${status}: ${body}`)
}

export async function qwenChatCompletion(
  options: QwenCompletionOptions,
): Promise<QwenResponse> {
  const cfg = loadQwenConfig()
  if (!cfg.apiKey) throw new Error('QWEN_API_KEY is not set. Run `agent config check` for details.')

  const body = JSON.stringify({
    model: cfg.model,
    messages: options.messages,
    ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
    ...(options.tool_choice ? { tool_choice: options.tool_choice } : {}),
    stream: false,
    max_tokens: options.max_tokens ?? cfg.maxTokens,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  })

  let lastError: Error | null = null
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(Math.pow(2, attempt) * 1000)
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body,
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        const err = friendlyHttpError(res.status, errText)
        // Auth failures are not retryable
        if (!isRetryableStatus(res.status)) throw err
        lastError = err
        continue
      }

      return (await res.json()) as QwenResponse
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (lastError.name === 'AbortError') {
        throw new Error(`Qwen API timed out after ${cfg.timeoutMs}ms`)
      }
      // Re-throw non-retryable errors immediately
      if (lastError.message.includes('authentication failed')) throw lastError
    }
  }
  throw lastError ?? new Error('Qwen API request failed after retries')
}

export async function* qwenChatCompletionStream(
  options: QwenCompletionOptions,
): AsyncGenerator<QwenStreamChunk> {
  const cfg = loadQwenConfig()
  if (!cfg.apiKey) throw new Error('QWEN_API_KEY is not set. Run `agent config check` for details.')

  const body = JSON.stringify({
    model: cfg.model,
    messages: options.messages,
    ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
    ...(options.tool_choice ? { tool_choice: options.tool_choice } : {}),
    stream: true,
    max_tokens: options.max_tokens ?? cfg.maxTokens,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)

  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const e = err instanceof Error ? err : new Error(String(err))
    if (e.name === 'AbortError') throw new Error(`Qwen API timed out after ${cfg.timeoutMs}ms`)
    throw e
  }

  if (!res.ok) {
    clearTimeout(timer)
    const errText = await res.text().catch(() => res.statusText)
    throw friendlyHttpError(res.status, errText)
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
