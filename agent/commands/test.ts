import { CoordinatorAgent } from '../../src/agents/coordinator.agent.js'
import { banner, success, error } from '../output/formatter.js'
import type { VerificationResult } from '../../src/agents/types.js'

export async function testCommand(_opts: { fix?: boolean }): Promise<void> {
  banner('VERIFICATION LOOP')

  const coordinator = new CoordinatorAgent()
  const result = await coordinator.test()

  console.log()
  if (result.success) {
    const data = result.data as VerificationResult | undefined
    const attempts = data?.attempts ?? 1
    success(`Verification passed after ${attempts} attempt(s)`)
  } else {
    error(`Verification failed`)
    result.errors?.forEach(e => {
      console.log(`\n  \x1b[31m${e.slice(0, 800)}\x1b[0m`)
    })
    process.exit(1)
  }
}
