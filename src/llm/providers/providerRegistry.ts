import type { AIProvider } from './types.js'

export const PROVIDERS: Record<string, AIProvider> = {
  qwen: {
    id: 'qwen',
    name: 'Qwen / DashScope',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    authType: 'bearer',
    apiKeyEnvName: 'QWEN_API_KEY',
    supportedModels: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'],
    supportsStreaming: true,
    supportsToolUse: true,
    pricing: {
      'qwen-plus': { inputPer1kTokens: 0.0004, outputPer1kTokens: 0.0012 },
      'qwen-max': { inputPer1kTokens: 0.0016, outputPer1kTokens: 0.006 },
      'qwen-turbo': { inputPer1kTokens: 0.0002, outputPer1kTokens: 0.0006 },
      'qwen-long': { inputPer1kTokens: 0.0001, outputPer1kTokens: 0.0004 },
    },
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    authType: 'bearer',
    apiKeyEnvName: 'OPENAI_API_KEY',
    supportedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    supportsStreaming: true,
    supportsToolUse: true,
    pricing: {
      'gpt-4o': { inputPer1kTokens: 0.005, outputPer1kTokens: 0.015 },
      'gpt-4o-mini': { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006 },
      'gpt-4.1': { inputPer1kTokens: 0.002, outputPer1kTokens: 0.008 },
      'gpt-4.1-mini': { inputPer1kTokens: 0.0004, outputPer1kTokens: 0.0016 },
      'gpt-4-turbo': { inputPer1kTokens: 0.01, outputPer1kTokens: 0.03 },
      'gpt-3.5-turbo': { inputPer1kTokens: 0.0005, outputPer1kTokens: 0.0015 },
    },
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    authType: 'api-key',
    apiKeyEnvName: 'ANTHROPIC_API_KEY',
    supportedModels: [
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
    ],
    supportsStreaming: true,
    supportsToolUse: true,
    pricing: {
      'claude-opus-4-7': { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075 },
      'claude-sonnet-4-6': { inputPer1kTokens: 0.003, outputPer1kTokens: 0.015 },
      'claude-haiku-4-5-20251001': { inputPer1kTokens: 0.00025, outputPer1kTokens: 0.00125 },
    },
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    // Gemini OpenAI-compatible endpoint
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    authType: 'bearer',
    apiKeyEnvName: 'GEMINI_API_KEY',
    supportedModels: [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ],
    supportsStreaming: true,
    supportsToolUse: true,
    pricing: {
      'gemini-2.0-flash': { inputPer1kTokens: 0.000075, outputPer1kTokens: 0.0003 },
      'gemini-2.0-flash-lite': { inputPer1kTokens: 0.0000375, outputPer1kTokens: 0.00015 },
      'gemini-1.5-pro': { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.005 },
      'gemini-1.5-flash': { inputPer1kTokens: 0.000075, outputPer1kTokens: 0.0003 },
    },
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    authType: 'bearer',
    apiKeyEnvName: 'OPENROUTER_API_KEY',
    supportedModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    authType: 'bearer',
    apiKeyEnvName: 'DEEPSEEK_API_KEY',
    supportedModels: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    supportsStreaming: true,
    supportsToolUse: true,
    pricing: {
      'deepseek-chat': { inputPer1kTokens: 0.00027, outputPer1kTokens: 0.0011 },
      'deepseek-coder': { inputPer1kTokens: 0.00027, outputPer1kTokens: 0.0011 },
      'deepseek-reasoner': { inputPer1kTokens: 0.00055, outputPer1kTokens: 0.00219 },
    },
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    authType: 'bearer',
    apiKeyEnvName: 'GROQ_API_KEY',
    supportedModels: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
    ],
    supportsStreaming: true,
    supportsToolUse: true,
    pricing: {
      'llama-3.3-70b-versatile': { inputPer1kTokens: 0.00059, outputPer1kTokens: 0.00079 },
      'llama-3.1-8b-instant': { inputPer1kTokens: 0.00005, outputPer1kTokens: 0.00008 },
      'mixtral-8x7b-32768': { inputPer1kTokens: 0.00024, outputPer1kTokens: 0.00024 },
    },
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (local)',
    baseUrl: 'http://localhost:11434',
    authType: 'none',
    apiKeyEnvName: null,
    supportedModels: [],
    supportsStreaming: true,
    supportsToolUse: true,
  },
}

export function getProvider(id: string): AIProvider | undefined {
  return PROVIDERS[id]
}

export function listProviders(): AIProvider[] {
  return Object.values(PROVIDERS)
}

export function getProviderIds(): string[] {
  return Object.keys(PROVIDERS)
}
