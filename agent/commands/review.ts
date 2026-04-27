import { CoordinatorAgent } from '../../src/agents/coordinator.agent.js'
import { banner, success, error, warn, info, section } from '../output/formatter.js'
import type { ReviewResult } from '../../src/agents/types.js'

export async function reviewCommand(): Promise<void> {
  if (!process.env.QWEN_API_KEY) {
    console.error('\x1b[31m✗ QWEN_API_KEY is not set\x1b[0m')
    process.exit(1)
  }

  banner('CODE REVIEW')

  const coordinator = new CoordinatorAgent()
  const result = await coordinator.review()

  console.log()
  const data = result.data as ReviewResult | undefined

  if (result.success) {
    success('Review approved')
    if (data?.suggestions && data.suggestions.length > 0) {
      section('Suggestions (non-blocking)')
      data.suggestions.forEach(s => info(`  • ${s}`))
    }
  } else {
    error('Review rejected')
    result.errors?.forEach(e => warn(`  • ${e}`))
    process.exit(1)
  }
}
