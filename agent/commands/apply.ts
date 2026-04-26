import * as fs from 'fs'
import { readPlan } from '../memory/store.js'
import { coordinateApply } from '../agents/coordinator.agent.js'
import { generateDiff } from '../patch/patcher.js'
import { banner, section, printDiff, success, error, info, warn } from '../output/formatter.js'

export async function applyCommand(opts: { dryRun?: boolean }): Promise<void> {
  if (!process.env.QWEN_API_KEY) {
    console.error('\x1b[31m✗ QWEN_API_KEY is not set\x1b[0m')
    process.exit(1)
  }

  const plan = readPlan()
  if (!plan) {
    error('No plan found. Run `agent plan "<task>"` first.')
    process.exit(1)
  }

  if (plan.status === 'completed') {
    warn('This plan has already been applied.')
    warn('Run `agent plan "<task>"` to create a new plan.')
    return
  }

  if (opts.dryRun) {
    banner('DRY RUN — DIFF PREVIEW')
    for (const f of plan.filesToChange) {
      if (f.content) {
        section(`${f.action.toUpperCase()}: ${f.path}`)
        printDiff(generateDiff(f.path, f.content))
      } else if (f.action === 'delete' && fs.existsSync(f.path)) {
        section(`DELETE: ${f.path}`)
        info('(file will be removed)')
      }
    }
    return
  }

  const result = await coordinateApply(false)

  if (result.success) {
    success(`\nDone. ${result.appliedFiles.length} file(s) changed.`)
    if (result.appliedFiles.length > 0) {
      info('Changed files:')
      result.appliedFiles.forEach(f => console.log(`  • ${f}`))
    }
    console.log('\nRun `agent test` to verify, then `agent commit "<msg>"` to commit.')
  } else {
    error('Apply failed:')
    result.errors.forEach(e => console.log(`  • ${e}`))
    process.exit(1)
  }
}
