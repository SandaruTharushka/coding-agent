/**
 * Backward-compatible helpers — all values now come from the centralized config.
 * Prefer importing from src/config/qwenConfig.ts directly in new code.
 */
import { loadQwenConfig } from '../../src/config/qwenConfig.js'

export const QWEN_DEFAULT_MODEL = 'qwen-plus'
export const QWEN_DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'

export function getQwenModel(): string {
  return loadQwenConfig().model
}

export function getQwenBaseUrl(): string {
  return loadQwenConfig().baseUrl
}

export function getQwenApiKey(): string {
  const { apiKey } = loadQwenConfig()
  if (!apiKey) throw new Error('QWEN_API_KEY is not set. Run `agent config check` for details.')
  return apiKey
}
