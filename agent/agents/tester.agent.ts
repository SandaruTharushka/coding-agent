import { runAgent } from './base.agent.js'
import type { QwenMessage } from '../../services/api/qwen-provider.js'

const SYSTEM_PROMPT = `You are a QA engineer verifying that code changes are correct.

Process:
1. Run the build command (e.g. npm run build / tsc) and check for errors
2. Run tests (e.g. npm test) if available
3. If failures occur, analyze and try to fix them
4. Report results

SHELL SAFETY: Only run build, test, and lint commands (npm run build, npm test, npm run lint,
tsc --noEmit). All other shell commands must go through the Shell Safety system. Never run
destructive commands (rm, git reset, chmod, etc.).

Final response MUST be JSON:
{
  "success": boolean,
  "errors": ["error 1", ...],
  "fixed": boolean
}`

export interface TesterResult {
  success: boolean
  errors: string[]
  fixed: boolean
  output: string
}

export async function runTesterAgent(changedFiles: string[], context: string): Promise<TesterResult> {
  const messages: QwenMessage[] = [
    {
      role: 'user',
      content: `Changed files:\n${changedFiles.join('\n')}\n\nContext:\n${context}\n\nVerify the changes compile and pass tests.`,
    },
  ]

  const output = await runAgent(messages, {
    systemPrompt: SYSTEM_PROMPT,
    maxIterations: 15,
    silent: false,
  })

  try {
    const match = output.match(/\{[\s\S]*"success"[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as { success: boolean; errors?: string[]; fixed?: boolean }
      return {
        success: parsed.success,
        errors: parsed.errors ?? [],
        fixed: parsed.fixed ?? false,
        output,
      }
    }
  } catch { /* ignore */ }

  const lower = output.toLowerCase()
  const success = !lower.includes('error') && !lower.includes('fail') && !lower.includes('failed')
  return { success, errors: [], fixed: false, output }
}
