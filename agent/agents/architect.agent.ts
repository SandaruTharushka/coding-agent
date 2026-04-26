import { runAgent } from './base.agent.js'
import type { QwenMessage } from '../../services/api/qwen-provider.js'
import type { Plan } from '../types.js'

const SYSTEM_PROMPT = `You are a senior software architect. Analyze the codebase and produce a precise execution plan for the given task.

Your FINAL response MUST be valid JSON only — no surrounding text:
{
  "filesToChange": [
    { "path": "relative/path/to/file.ts", "action": "create|modify|delete", "reason": "concise reason" }
  ],
  "steps": [
    "Step 1: ...",
    "Step 2: ..."
  ]
}

Rules:
- Use the tools to read and explore the codebase before responding
- Only include files that genuinely need to change
- Use relative paths from the project root
- Steps must be ordered and actionable
- Never include node_modules, dist, .agent, or generated files`

export async function runArchitectAgent(task: string, context: string): Promise<Plan> {
  const messages: QwenMessage[] = [
    {
      role: 'user',
      content: `${context}\n\n---\nTask: ${task}\n\nExplore the codebase with the tools, then output your plan as JSON.`,
    },
  ]

  const raw = await runAgent(messages, {
    systemPrompt: SYSTEM_PROMPT,
    maxIterations: 12,
    silent: false,
  })

  let planData: { filesToChange: Plan['filesToChange']; steps: string[] }
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('no JSON block found')
    planData = JSON.parse(match[0])
  } catch {
    planData = { filesToChange: [], steps: [`Implement: ${task}`] }
  }

  return {
    task,
    createdAt: new Date().toISOString(),
    filesToChange: Array.isArray(planData.filesToChange) ? planData.filesToChange : [],
    steps: Array.isArray(planData.steps) ? planData.steps : [],
    status: 'pending',
  }
}
