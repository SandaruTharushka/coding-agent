export const QWEN_DEFAULT_MODEL = 'qwen-plus'
export const QWEN_DEFAULT_BASE_URL =
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'

export function getQwenModel(): string {
  return process.env.QWEN_MODEL ?? QWEN_DEFAULT_MODEL
}

export function getQwenBaseUrl(): string {
  return process.env.QWEN_BASE_URL ?? QWEN_DEFAULT_BASE_URL
}

export function getQwenApiKey(): string {
  const key = process.env.QWEN_API_KEY
  if (!key) throw new Error('QWEN_API_KEY environment variable is not set')
  return key
}
