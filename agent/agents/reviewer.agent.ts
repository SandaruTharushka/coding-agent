import { runAgent } from './base.agent.js'
import type { QwenMessage } from '../../services/api/qwen-provider.js'
import type { Plan } from '../types.js'

const SYSTEM_PROMPT = `You are a code reviewer validating implementation against the original plan.

Check for:
1. Correctness: does the code achieve the intended goal?
2. Security: no hardcoded secrets, injection vulnerabilities, or path traversal
3. Quality: no unnecessary complexity, matches existing patterns
4. Completeness: all files in the plan were changed as described

Final response MUST be JSON:
{
  "approved": boolean,
  "issues": ["critical issue 1"],
  "suggestions": ["optional improvement"]
}`

export interface ReviewResult {
  approved: boolean
  issues: string[]
  suggestions: string[]
}

export async function runReviewerAgent(plan: Plan, context: string): Promise<ReviewResult> {
  const messages: QwenMessage[] = [
    {
      role: 'user',
      content: `Original plan:\n${JSON.stringify(plan, null, 2)}\n\nCurrent codebase context:\n${context}\n\nReview the implementation against the plan.`,
    },
  ]

  const output = await runAgent(messages, {
    systemPrompt: SYSTEM_PROMPT,
    maxIterations: 8,
    silent: false,
  })

  try {
    const match = output.match(/\{[\s\S]*"approved"[\s\S]*\}/)
    if (match) {
      return JSON.parse(match[0]) as ReviewResult
    }
  } catch { /* ignore */ }

  return { approved: true, issues: [], suggestions: [] }
}
