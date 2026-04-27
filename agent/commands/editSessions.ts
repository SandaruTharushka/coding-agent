import { listSessions } from '../../src/patch/editSession.js'
import { banner, info, warn, fmt } from '../output/formatter.js'

const STATUS_COLORS: Record<string, (s: string) => string> = {
  applied:     fmt.green,
  previewed:   fmt.cyan,
  planned:     fmt.blue,
  rolled_back: fmt.yellow,
  failed:      fmt.red,
}

function colorStatus(status: string): string {
  const fn = STATUS_COLORS[status] ?? ((s: string) => s)
  return fn(status)
}

export function editSessionsCommand(opts: { json?: boolean; limit?: string }): void {
  const sessions = listSessions()

  if (opts.json) {
    console.log(JSON.stringify(sessions, null, 2))
    return
  }

  if (sessions.length === 0) {
    warn('No edit sessions found. Run `qwen-agent apply "<task>"` to create one.')
    return
  }

  const limit = opts.limit ? parseInt(opts.limit, 10) : 20
  const shown = sessions.slice(0, limit)

  banner('EDIT SESSIONS')
  info(`Showing ${shown.length} of ${sessions.length} session(s)`)
  console.log()

  for (const s of shown) {
    const date = new Date(s.createdAt).toLocaleString()
    console.log(
      `  ${fmt.bold(s.id.slice(0, 8))}…  ${colorStatus(s.status).padEnd(12)}  ${date}`,
    )
    console.log(`    ${fmt.dim('task:')} ${s.task}`)
    if (s.changedFiles.length > 0) {
      console.log(`    ${fmt.dim('files:')} ${s.changedFiles.join(', ')}`)
    }
    if (s.backups.length > 0) {
      console.log(`    ${fmt.dim('backup:')} .qwen-agent/backups/${s.id}/`)
    }
    console.log()
  }

  info('To roll back a session: qwen-agent rollback <session-id>')
  info('To view a diff:         qwen-agent diff --session <session-id>')
}
