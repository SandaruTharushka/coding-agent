import { getLatestSession, listSessions } from '../../src/patch/editSession.js'
import { banner, info, warn, error, fmt } from '../output/formatter.js'
import { printDiff } from '../output/formatter.js'

export async function diffCommand(opts: { json?: boolean; sessionId?: string }): Promise<void> {
  const session = opts.sessionId
    ? listSessions().find(s => s.id === opts.sessionId) ?? null
    : getLatestSession()

  if (!session) {
    warn('No edit sessions found. Run `qwen-agent apply "<task>"` first.')
    return
  }

  if (session.diffs.length === 0) {
    warn(`Session ${session.id} has no recorded diffs.`)
    return
  }

  if (opts.json) {
    console.log(JSON.stringify(session, null, 2))
    return
  }

  banner(`DIFF — ${session.task}`)
  info(`Session : ${session.id}`)
  info(`Status  : ${session.status}`)
  info(`Created : ${session.createdAt}`)

  let totalAdded = 0
  let totalRemoved = 0

  for (const rec of session.diffs) {
    console.log(`\n${fmt.bold(fmt.blue(`── ${rec.filePath} ─────`))}`)
    console.log(
      `   ${fmt.green(`+${rec.addedLines}`)}  ${fmt.red(`-${rec.removedLines}`)}`,
    )
    if (rec.diff.trim()) {
      printDiff(rec.diff)
    } else {
      console.log(fmt.dim('   (no textual changes)'))
    }
    totalAdded += rec.addedLines
    totalRemoved += rec.removedLines
  }

  console.log()
  info(
    `Summary: ${session.diffs.length} file(s)  ${fmt.green(`+${totalAdded}`)}  ${fmt.red(`-${totalRemoved}`)}`,
  )
  info(`Backup  : .qwen-agent/backups/${session.id}/`)
  info(`Rollback: qwen-agent rollback ${session.id}`)
}
