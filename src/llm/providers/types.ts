export type AuthType = 'bearer' | 'api-key' | 'none'

export type AgentPurpose =
  | 'coordinator'
  | 'architect'
  | 'coder'
  | 'tester'
  | 'reviewer'
  | 'general'

export interface ProviderPricing {
  inputPer1kTokens: number
  outputPer1kTokens: number
}

export interface AIProvider {
  id: string
  name: string
  baseUrl: string
  authType: AuthType
  apiKeyEnvName: string | null
  supportedModels: string[]
  supportsStreaming: boolean
  supportsToolUse: boolean
  pricing?: Record<string, ProviderPricing>
}

export interface ModelProfile {
  providerId: string
  model: string
  maxTokens?: number
  temperature?: number
  purpose: AgentPurpose
}

export interface TokenUsage {
  id?: string
  providerId: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost: number | null
  taskId?: string
  agentName?: string
  timestamp: string
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?: string
}

export interface LLMToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface LLMTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface LLMRequest {
  messages: LLMMessage[]
  tools?: LLMTool[]
  tool_choice?: 'auto' | 'none'
  max_tokens?: number
  temperature?: number
  stream?: boolean
  providerId?: string
  model?: string
}

export interface LLMResponse {
  text: string
  providerId: string
  model: string
  toolCalls?: LLMToolCall[]
  finishReason?: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  raw?: unknown
}

export interface LLMStreamChunk {
  content?: string
  toolCalls?: Array<{
    index: number
    id?: string
    function?: { name?: string; arguments?: string }
  }>
  finishReason?: string | null
}
