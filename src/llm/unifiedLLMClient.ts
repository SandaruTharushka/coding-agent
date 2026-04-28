/**
 * Unified LLM client.
 *
 * Routes requests to the appropriate provider based on configuration.
 * OpenAI-compatible providers (qwen, openai, openrouter, deepseek, groq, gemini, ollama)
 * share the same fetch-based implementation.
 * Anthropic has a dedicated adapter.
 */

import { loadAIConfig, getProviderApiKey, getProviderBaseUrl } from '../config/aiConfig.js'
import { getProvider, PROVIDERS } from './providers/providerRegistry.js'
import type { LLMRequest, LLMResponse, LLMStreamChunk, LLMMessage, LLMTool, LLMToolCall } from './providers/types.js'

export type { LLMRequest, LLMResponse, LLMStreamChunk }

// ─── OpenAI-compatible providers ──────────────────────────────────────────────

const OPENAI_COMPAT_PROVIDERS = new Set([
  'qwen', 'openai', 'openrouter', 'deepseek', 'groq', 'gemini', 'ollama',
])

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

function ollamaBaseUrl(base: string): string {
  // Ollama uses /v1 for OpenAI compat, not /api
  const clean = base.replace(/\/$/, '')
  return clean.endsWith('/v1') ? clean : `${clean}/v1`
}

// ─── OpenAI-compatible call ────────────────────────────────────────────────────

async function callOpenAICompat(
  request: LLMRequest,
  providerId: string,
  model: string,
): Promise<LLMResponse> {
  const cfg = loadAIConfig()
  const provider = getProvider(providerId)
  if (!provider) throw new Error(`Unknown provider: ${providerId}`)

  const apiKey = getProviderApiKey(providerId)
  if (provider.authType !== 'none' && !apiKey) {
    throw new Error(
      `${provider.apiKeyEnvName} is not set. Run: qwen-agent ai key set --provider ${providerId}`,
    )
  }

  let baseUrl = getProviderBaseUrl(providerId)
  if (providerId === 'ollama') baseUrl = ollamaBaseUrl(baseUrl)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (provider.authType === 'bearer' && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  } else if (provider.authType === 'api-key' && apiKey) {
    headers['x-api-key'] = apiKey
  }
  if (providerId === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/qwen-coding-agent'
  }

  const body = JSON.stringify({
    model,
    messages: request.messages,
    ...(request.tools && request.tools.length > 0 ? { tools: request.tools, tool_choice: request.tool_choice ?? 'auto' } : {}),
    stream: false,
    max_tokens: request.max_tokens ?? cfg.maxTokens,
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
  })

  let lastError: Error | null = null
  const maxRetries = cfg.maxRetries

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(Math.pow(2, attempt) * 1000)

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        const err = new Error(`${provider.name} API error ${res.status}: ${errText}`)
        if (!isRetryableStatus(res.status)) throw err
        lastError = err
        continue
      }

      const json = await res.json() as {
        choices: Array<{
          message: { content: string | null; tool_calls?: LLMToolCall[] }
          finish_reason: string
        }>
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
        model?: string
      }

      const choice = json.choices[0]
      return {
        text: choice?.message.content ?? '',
        providerId,
        model: json.model ?? model,
        toolCalls: choice?.message.tool_calls,
        finishReason: choice?.finish_reason,
        usage: {
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
          totalTokens: json.usage?.total_tokens ?? 0,
        },
        raw: json,
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if ((lastError as NodeJS.ErrnoException).name === 'AbortError') {
        throw new Error(`${provider.name} API timed out after ${cfg.timeoutMs}ms`)
      }
      if (!isRetryableStatus(0)) throw lastError
    }
  }
  throw lastError ?? new Error(`${provider.name} API request failed after retries`)
}

// ─── OpenAI-compatible streaming ───────────────────────────────────────────────

export async function* streamOpenAICompat(
  request: LLMRequest,
  providerId: string,
  model: string,
): AsyncGenerator<LLMStreamChunk> {
  const cfg = loadAIConfig()
  const provider = getProvider(providerId)
  if (!provider) throw new Error(`Unknown provider: ${providerId}`)

  const apiKey = getProviderApiKey(providerId)
  if (provider.authType !== 'none' && !apiKey) {
    throw new Error(`${provider.apiKeyEnvName} is not set`)
  }

  let baseUrl = getProviderBaseUrl(providerId)
  if (providerId === 'ollama') baseUrl = ollamaBaseUrl(baseUrl)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (provider.authType === 'bearer' && apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  else if (provider.authType === 'api-key' && apiKey) headers['x-api-key'] = apiKey
  if (providerId === 'openrouter') headers['HTTP-Referer'] = 'https://github.com/qwen-coding-agent'

  const body = JSON.stringify({
    model,
    messages: request.messages,
    ...(request.tools && request.tools.length > 0 ? { tools: request.tools, tool_choice: request.tool_choice ?? 'auto' } : {}),
    stream: true,
    max_tokens: request.max_tokens ?? cfg.maxTokens,
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers, body, signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const e = err instanceof Error ? err : new Error(String(err))
    if (e.name === 'AbortError') throw new Error(`${provider.name} API timed out after ${cfg.timeoutMs}ms`)
    throw e
  }

  if (!res.ok) {
    clearTimeout(timer)
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`${provider.name} API error ${res.status}: ${errText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) { clearTimeout(timer); throw new Error('No response body') }

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
            const chunk = JSON.parse(trimmed.slice(6)) as {
              choices: Array<{
                delta: {
                  content?: string
                  tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
                }
                finish_reason?: string | null
              }>
            }
            const delta = chunk.choices[0]?.delta
            if (delta) {
              yield {
                content: delta.content,
                toolCalls: delta.tool_calls,
                finishReason: chunk.choices[0]?.finish_reason,
              }
            }
          } catch { /* malformed chunk */ }
        }
      }
    }
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
}

// ─── Anthropic adapter ─────────────────────────────────────────────────────────

interface AnthropicContent {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string
}

interface AnthropicRequest {
  model: string
  max_tokens: number
  messages: Array<{ role: string; content: string | AnthropicContent[] }>
  system?: string
  tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>
  stream?: boolean
}

function toAnthropicMessages(messages: LLMMessage[]): {
  system?: string
  messages: Array<{ role: string; content: string | AnthropicContent[] }>
} {
  let system: string | undefined
  const out: Array<{ role: string; content: string | AnthropicContent[] }> = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content
      continue
    }
    if (msg.role === 'tool') {
      out.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id ?? '',
          content: msg.content,
        }],
      })
      continue
    }
    out.push({ role: msg.role, content: msg.content })
  }

  return { system, messages: out }
}

async function callAnthropic(request: LLMRequest, model: string): Promise<LLMResponse> {
  const cfg = loadAIConfig()
  const apiKey = getProviderApiKey('anthropic')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set. Run: qwen-agent ai key set --provider anthropic')

  const baseUrl = getProviderBaseUrl('anthropic')
  const { system, messages } = toAnthropicMessages(request.messages)

  const anthropicTools = request.tools?.map((t: LLMTool) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }))

  const body: AnthropicRequest = {
    model,
    max_tokens: request.max_tokens ?? cfg.maxTokens,
    messages,
    ...(system ? { system } : {}),
    ...(anthropicTools && anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
    stream: false,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)

  let res: Response
  try {
    res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const e = err instanceof Error ? err : new Error(String(err))
    if (e.name === 'AbortError') throw new Error(`Anthropic API timed out after ${cfg.timeoutMs}ms`)
    throw e
  }
  clearTimeout(timer)

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Anthropic API error ${res.status}: ${errText}`)
  }

  const json = await res.json() as {
    content: AnthropicContent[]
    usage: { input_tokens: number; output_tokens: number }
    model: string
    stop_reason: string
  }

  const textContent = json.content
    .filter(c => c.type === 'text')
    .map(c => c.text ?? '')
    .join('')

  const toolUses = json.content.filter(c => c.type === 'tool_use')
  const toolCalls: LLMToolCall[] = toolUses.map(c => ({
    id: c.id ?? '',
    type: 'function' as const,
    function: { name: c.name ?? '', arguments: JSON.stringify(c.input ?? {}) },
  }))

  return {
    text: textContent,
    providerId: 'anthropic',
    model: json.model ?? model,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason: json.stop_reason,
    usage: {
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
      totalTokens: (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0),
    },
    raw: json,
  }
}

export async function* streamAnthropic(
  request: LLMRequest,
  model: string,
): AsyncGenerator<LLMStreamChunk> {
  const cfg = loadAIConfig()
  const apiKey = getProviderApiKey('anthropic')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const baseUrl = getProviderBaseUrl('anthropic')
  const { system, messages } = toAnthropicMessages(request.messages)
  const anthropicTools = request.tools?.map((t: LLMTool) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }))

  const body = {
    model,
    max_tokens: request.max_tokens ?? cfg.maxTokens,
    messages,
    ...(system ? { system } : {}),
    ...(anthropicTools && anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
    stream: true,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)

  let res: Response
  try {
    res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const e = err instanceof Error ? err : new Error(String(err))
    if (e.name === 'AbortError') throw new Error(`Anthropic API timed out after ${cfg.timeoutMs}ms`)
    throw e
  }

  if (!res.ok) {
    clearTimeout(timer)
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Anthropic API error ${res.status}: ${errText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) { clearTimeout(timer); throw new Error('No response body') }

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
        if (!trimmed || trimmed.startsWith('event:')) continue
        if (trimmed.startsWith('data: ')) {
          try {
            const event = JSON.parse(trimmed.slice(6)) as {
              type: string
              delta?: { type: string; text?: string; partial_json?: string }
              index?: number
              content_block?: { type: string; id?: string; name?: string }
            }
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              yield { content: event.delta.text }
            } else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
              yield {
                toolCalls: [{
                  index: event.index ?? 0,
                  function: { arguments: event.delta.partial_json },
                }],
              }
            } else if (event.type === 'message_stop') {
              yield { finishReason: 'stop' }
            }
          } catch { /* skip malformed */ }
        }
      }
    }
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface CallOptions {
  providerId?: string
  model?: string
  agentName?: string
  taskId?: string
  recordUsage?: boolean
}

export async function callLLM(
  request: LLMRequest,
  options: CallOptions = {},
): Promise<LLMResponse> {
  const cfg = loadAIConfig()
  const providerId = options.providerId ?? request.providerId ?? cfg.defaultProvider
  const model = options.model ?? request.model ?? cfg.defaultModel

  let response: LLMResponse

  if (providerId === 'anthropic') {
    response = await callAnthropic(request, model)
  } else if (OPENAI_COMPAT_PROVIDERS.has(providerId)) {
    response = await callOpenAICompat(request, providerId, model)
  } else {
    // Unknown provider — attempt OpenAI compat as fallback
    response = await callOpenAICompat(request, providerId, model)
  }

  // Record token usage asynchronously (non-blocking)
  if (options.recordUsage !== false) {
    const { recordUsage } = await import('../usage/tokenUsageStore.js')
    recordUsage({
      providerId: response.providerId,
      model: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      agentName: options.agentName,
      taskId: options.taskId,
    }).catch(() => { /* usage recording is best-effort */ })
  }

  return response
}

export async function* streamLLM(
  request: LLMRequest,
  options: CallOptions = {},
): AsyncGenerator<LLMStreamChunk> {
  const cfg = loadAIConfig()
  const providerId = options.providerId ?? request.providerId ?? cfg.defaultProvider
  const model = options.model ?? request.model ?? cfg.defaultModel

  if (providerId === 'anthropic') {
    yield* streamAnthropic(request, model)
  } else if (OPENAI_COMPAT_PROVIDERS.has(providerId)) {
    yield* streamOpenAICompat(request, providerId, model)
  } else {
    yield* streamOpenAICompat(request, providerId, model)
  }
}

// ─── Connection test ───────────────────────────────────────────────────────────

export async function testProviderConnection(
  providerId: string,
  model: string,
): Promise<{ success: boolean; error?: string; latencyMs?: number }> {
  const start = Date.now()
  try {
    await callLLM(
      {
        messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
        max_tokens: 10,
      },
      { providerId, model, recordUsage: false },
    )
    return { success: true, latencyMs: Date.now() - start }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    }
  }
}

// ─── Re-export provider info ───────────────────────────────────────────────────

export { PROVIDERS, getProvider }
