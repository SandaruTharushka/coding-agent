import { runVerification } from '../verify/loop.js'
import { runCoderAgent } from '../agents/coder.agent.js'
import { readPlan } from '../memory/store.js'
import { scanProject } from '../scanner/project.js'
import { buildContext, formatContextForLLM } from '../context/engine.js'
import { banner, success, error, warn, info } from '../output/formatter.js'

export async function testCommand(opts: { fix?: boolean }): Promise<void> {
  banner('VERIFICATION LOOP')

  let autoFix: ((errors: string) => Promise<boolean>) | undefined

  if (opts.fix) {
    if (!process.env.QWEN_API_KEY) {
      warn('QWEN_API_KEY not set — auto-fix disabled')
    } else {
      const plan = readPlan()
      autoFix = async (errorText: string): Promise<boolean> => {
        info('Sending errors to LLM for auto-fix...')
        try {
          const project = await scanProject()
          const ctx = buildContext(project, errorText)
          const ctxText = formatContextForLLM(ctx, project)
          const fixPlan = plan ?? {
            task: 'fix build/test errors',
            createdAt: new Date().toISOString(),
            filesToChange: [],
            steps: [`Fix the following errors:\n${errorText}`],
            status: 'pending' as const,
          }
          await runCoderAgent(fixPlan, `${ctxText}\n\nErrors to fix:\n${errorText}`)
          return true
        } catch {
          return false
        }
      }
    }
  }

  const result = await runVerification(autoFix)

  console.log()
  if (result.success) {
    success(`Verification passed after ${result.attempts} attempt(s)`)
  } else {
    error(`Verification failed after ${result.attempts} attempt(s)`)
    result.errors.forEach(e => {
      console.log(`\n  \x1b[31m${e.slice(0, 800)}\x1b[0m`)
    })
    process.exit(1)
  }
}
