import { rollbackSession } from '../../src/patch/rollbackManager.js'
import { banner, info, success, warn, error, fmt } from '../output/formatter.js'

export async function rollbackCommand(sessionId?: string): Promise<void> {
  banner(`ROLLBACK${sessionId ? ` — ${sessionId}` : ' (latest)'}`)

  const result = await rollbackSession(sessionId)

  if (!result.success && result.restoredFiles.length === 0 && result.deletedFiles.length === 0) {
    error(result.errors[0] ?? 'Rollback failed')
    process.exit(1)
  }

  info(`Session : ${result.sessionId}`)
  if (result.task) info(`Task    : ${result.task}`)

  if (result.restoredFiles.length > 0) {
    console.log(`\n${fmt.bold('Restored files:')}`)
    result.restoredFiles.forEach(f => console.log(`  ${fmt.green('↩')} ${f}`))
  }

  if (result.deletedFiles.length > 0) {
    console.log(`\n${fmt.bold('Deleted (were newly created):')}`),
    result.deletedFiles.forEach(f => console.log(`  ${fmt.red('✗')} ${f}`))
  }

  if (result.hashMismatches.length > 0) {
    console.log()
    result.hashMismatches.forEach(f =>
      warn(`Hash mismatch after restore (file may have changed): ${f}`),
    )
  }

  if (result.errors.length > 0) {
    console.log()
    result.errors.forEach(e => error(e))
  }

  console.log()
  if (result.success) {
    success(
      `Rollback complete — ${result.restoredFiles.length} restored, ${result.deletedFiles.length} deleted`,
    )
  } else {
    warn(
      `Rollback finished with errors — ${result.restoredFiles.length} restored, ${result.deletedFiles.length} deleted`,
    )
    process.exit(1)
  }
}
