import { runAgent } from './base.agent.js'
import type { QwenMessage } from '../../services/api/qwen-provider.js'
import type { Plan } from '../types.js'

const SYSTEM_PROMPT = `You are a senior software engineer implementing a plan precisely.

Rules:
- Always call read_file before editing an existing file
- Use write_file to create new files with complete content
- Use edit_file only for targeted changes (old_string must be unique)
- Never hardcode secrets, API keys, or credentials
- After every write/edit, verify with read_file
- Handle edge cases; don't break existing functionality
- SHELL SAFETY: Only use run_command for read-only checks (e.g. tsc --noEmit, git status).
  Never issue destructive shell commands (rm, git reset, chmod, etc.) — use file tools instead.
- Run run_command only to check for compile errors when done`

export async function runCoderAgent(plan: Plan, context: string): Promise<string> {
  const planText = [
    `Task: ${plan.task}`,
    '',
    'Files to change:',
    plan.filesToChange.map(f => `  [${f.action}] ${f.path} — ${f.reason}`).join('\n'),
    '',
    'Steps:',
    plan.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n'),
  ].join('\n')

  const messages: QwenMessage[] = [
    {
      role: 'user',
      content: `${context}\n\n---\nPlan:\n${planText}\n\nImplement the plan using the file tools. Verify your work when done.`,
    },
  ]

  return runAgent(messages, {
    systemPrompt: SYSTEM_PROMPT,
    maxIterations: 30,
    silent: false,
  })
}
