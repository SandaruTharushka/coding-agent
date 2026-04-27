import { info, success, error, warn, section, fmt } from '../output/formatter.js'
import {
  listTasks,
  listDecisions,
  listProjectNotes,
  searchMemory,
  addProjectNote,
  clearMemory,
} from '../../src/memory/memoryStore.js'
import type { TaskRecord } from '../../src/memory/types.js'

// ── tasks ─────────────────────────────────────────────────────────────────────

export function memoryTasksCommand(opts: { json?: boolean; limit?: string }): void {
  const limit = opts.limit ? parseInt(opts.limit, 10) : 20
  const tasks = listTasks(limit)

  if (opts.json) {
    console.log(JSON.stringify(tasks, null, 2))
    return
  }

  if (tasks.length === 0) {
    info('No tasks recorded yet.')
    return
  }

  section(`Task History (${tasks.length} record(s))`)
  for (const t of tasks) {
    console.log(`  ${statusFmt(t.status)} ${fmt.bold(t.title)}`)
    console.log(`    ${fmt.dim('Request:')} ${t.userRequest.slice(0, 80)}${t.userRequest.length > 80 ? '…' : ''}`)
    console.log(`    ${fmt.dim('Created:')} ${t.createdAt}`)
    if (t.changedFiles.length > 0) {
      const shown = t.changedFiles.slice(0, 5).join(', ')
      const extra = t.changedFiles.length > 5 ? ` +${t.changedFiles.length - 5} more` : ''
      console.log(`    ${fmt.dim('Files:')}   ${shown}${extra}`)
    }
    if (t.commitHash) {
      console.log(`    ${fmt.dim('Commit:')}  ${t.commitHash}`)
    }
    if (t.verificationSummary) {
      console.log(`    ${fmt.dim('Verify:')}  ${t.verificationSummary.slice(0, 100)}`)
    }
    console.log()
  }
}

// ── decisions ─────────────────────────────────────────────────────────────────

export function memoryDecisionsCommand(opts: { json?: boolean; limit?: string }): void {
  const limit = opts.limit ? parseInt(opts.limit, 10) : 20
  const decisions = listDecisions(limit)

  if (opts.json) {
    console.log(JSON.stringify(decisions, null, 2))
    return
  }

  if (decisions.length === 0) {
    info('No decisions recorded yet.')
    return
  }

  section(`Decision History (${decisions.length} record(s))`)
  for (const d of decisions) {
    console.log(`  ${fmt.cyan(`[${d.agent}]`)} ${fmt.bold(d.decision.slice(0, 80))}`)
    console.log(`    ${fmt.dim('Reason:')} ${d.reason.slice(0, 120)}`)
    console.log(`    ${fmt.dim('At:')}     ${d.createdAt}`)
    console.log()
  }
}

// ── notes ─────────────────────────────────────────────────────────────────────

export function memoryNotesCommand(opts: { json?: boolean }): void {
  const notes = listProjectNotes()

  if (opts.json) {
    console.log(JSON.stringify(notes, null, 2))
    return
  }

  if (notes.length === 0) {
    info('No project notes yet. Use: qwen-agent memory add-note "Title" "Content"')
    return
  }

  section(`Project Notes (${notes.length} note(s))`)
  for (const n of notes) {
    console.log(`  ${fmt.bold(n.title)}`)
    if (n.tags.length > 0) {
      console.log(`    ${fmt.dim('Tags:')}    ${n.tags.join(', ')}`)
    }
    console.log(`    ${fmt.dim('Updated:')} ${n.updatedAt}`)
    console.log(`    ${n.content}`)
    console.log()
  }
}

// ── search ────────────────────────────────────────────────────────────────────

export function memorySearchCommand(query: string, opts: { json?: boolean }): void {
  if (!query.trim()) {
    error('Search query cannot be empty.')
    return
  }

  const results = searchMemory(query)

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2))
    return
  }

  if (results.length === 0) {
    info(`No results found for: "${query}"`)
    return
  }

  section(`Search Results for "${query}" (${results.length} match(es))`)
  for (const r of results) {
    console.log(`  ${fmt.cyan(`[${r.type}]`)} ${r.preview}`)
  }
  console.log()
}

// ── add-note ──────────────────────────────────────────────────────────────────

export function memoryAddNoteCommand(
  title: string,
  content: string,
  opts: { tags?: string },
): void {
  if (!title.trim()) {
    error('Note title cannot be empty.')
    return
  }
  if (!content.trim()) {
    error('Note content cannot be empty.')
    return
  }

  const tags = opts.tags
    ? opts.tags.split(',').map(t => t.trim()).filter(Boolean)
    : []

  const note = addProjectNote({ title, content, tags })
  success(`Note saved: "${note.title}" (id: ${note.id.slice(0, 8)})`)
}

// ── clear ─────────────────────────────────────────────────────────────────────

export function memoryClearCommand(opts: { confirm?: boolean }): void {
  if (!opts.confirm) {
    warn('This will delete all memory records. Re-run with --confirm to proceed.')
    return
  }
  clearMemory()
  success('All memory records cleared.')
}

// ── helpers ───────────────────────────────────────────────────────────────────

function statusFmt(status: TaskRecord['status']): string {
  switch (status) {
    case 'planned':     return fmt.cyan('[planned]')
    case 'applied':     return fmt.yellow('[applied]')
    case 'verified':    return fmt.green('[verified]')
    case 'failed':      return fmt.red('[failed]')
    case 'rolled_back': return fmt.yellow('[rolled_back]')
    default:            return `[${status}]`
  }
}
