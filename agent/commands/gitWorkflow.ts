import * as readline from 'readline'
import {
  isGitRepo,
  getCurrentBranch,
  getStatus,
  getChangedFiles,
  getDiffSummary,
  getFullDiff,
  stageFiles,
  commit,
  push,
  hasUncommittedChanges,
  getLastCommitHash,
} from '../../src/git/gitService.js'
import { groupChangedFiles, buildChangeSummary, maskSecrets } from '../../src/git/changeSummary.js'
import { generateCommitMessage } from '../../src/git/commitMessageGenerator.js'
import { readPlan, readMemory } from '../memory/store.js'
import { banner, section, success, error, info, warn, fmt, printDiff } from '../output/formatter.js'

// ─── Shared utilities ────────────────────────────────────────────────────────

function requireGitRepo(): void {
  if (!isGitRepo()) {
    error('Not a git repository. Run `git init` to initialise one.')
    process.exit(1)
  }
}

async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(`${fmt.yellow('?')} ${question} ${fmt.dim('[y/N]')} `, answer => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'y')
    })
  })
}

function printBranchLine(): void {
  const branch = getCurrentBranch()
  console.log(`${fmt.bold('Branch:')} ${fmt.cyan(branch)}`)
}

function printChangedFilesTable(cwd?: string): void {
  const files = getChangedFiles(cwd)
  if (files.length === 0) {
    info('Working tree is clean — nothing to show.')
    return
  }

  const groups = groupChangedFiles(files)
  const rows: Array<[string, string]> = []

  const addGroup = (label: string, color: (s: string) => string, group: typeof groups.added) => {
    for (const f of group) {
      const tag = label.padEnd(10)
      const displayPath = f.oldPath ? `${f.oldPath} → ${f.path}` : f.path
      rows.push([color(tag), displayPath])
    }
  }

  addGroup('added',     fmt.green,  groups.added)
  addGroup('modified',  fmt.yellow, groups.modified)
  addGroup('deleted',   fmt.red,    groups.deleted)
  addGroup('renamed',   fmt.cyan,   groups.renamed)
  addGroup('untracked', fmt.dim,    groups.untracked)
  addGroup('other',     fmt.dim,    groups.other)

  for (const [tag, path] of rows) {
    console.log(`  ${tag} ${path}`)
  }
  console.log()
  console.log(`  ${fmt.bold(`${files.length} file(s) changed`)}`)
}

// ─── git status ───────────────────────────────────────────────────────────────

export async function gitStatusCommand(): Promise<void> {
  requireGitRepo()
  banner('GIT STATUS')
  printBranchLine()
  console.log()

  const status = getStatus()
  if (!status.trim()) {
    success('Working tree is clean — nothing to commit.')
    return
  }

  section('Changed files')
  printChangedFilesTable()
}

// ─── git diff ────────────────────────────────────────────────────────────────

export async function gitDiffCommand(): Promise<void> {
  requireGitRepo()
  banner('GIT DIFF')
  printBranchLine()
  console.log()

  const diffSummary = getDiffSummary()
  if (!diffSummary.trim()) {
    info('No staged or unstaged changes to diff.')
    return
  }

  section('Diff summary (secrets masked)')
  console.log(maskSecrets(diffSummary))
  console.log()

  const fullDiff = getFullDiff()
  if (fullDiff.trim()) {
    section('Full diff')
    printDiff(maskSecrets(fullDiff))
  }
}

// ─── git summary ─────────────────────────────────────────────────────────────

export async function gitSummaryCommand(): Promise<void> {
  requireGitRepo()
  banner('GIT SUMMARY')
  printBranchLine()
  console.log()

  const files = getChangedFiles()
  if (files.length === 0) {
    success('Working tree is clean — nothing to summarise.')
    return
  }

  const diffSummary = getDiffSummary()
  const summary = buildChangeSummary(files, diffSummary)
  const { groups } = summary

  const printGroup = (
    label: string,
    items: typeof groups.added,
    color: (s: string) => string,
  ) => {
    if (items.length === 0) return
    section(`${label} (${items.length})`)
    for (const f of items) {
      const display = f.oldPath ? `${fmt.dim(f.oldPath)} → ${f.path}` : f.path
      console.log(`  ${color('•')} ${display}`)
    }
  }

  printGroup('Added',     groups.added,     fmt.green)
  printGroup('Modified',  groups.modified,  fmt.yellow)
  printGroup('Deleted',   groups.deleted,   fmt.red)
  printGroup('Renamed',   groups.renamed,   fmt.cyan)
  printGroup('Untracked', groups.untracked, fmt.dim)

  console.log()
  console.log(`  ${fmt.bold('Total:')} ${summary.totalFiles} file(s)`)

  if (summary.diffSummary.trim()) {
    section('Diff summary')
    console.log(summary.diffSummary)
  }
}

// ─── git commit ───────────────────────────────────────────────────────────────

export async function gitCommitCommand(messageArg?: string): Promise<void> {
  requireGitRepo()
  banner('GIT COMMIT')
  printBranchLine()
  console.log()

  if (!hasUncommittedChanges()) {
    warn('Nothing to commit (working tree clean).')
    return
  }

  section('Changed files')
  printChangedFilesTable()

  // Safety: recommend running verify first
  console.log()
  info('Tip: run `qwen-agent verify` before committing to catch build/lint issues.')
  console.log()

  // Determine commit message
  let message = messageArg?.trim()

  if (!message) {
    info('Generating commit message via LLM...')
    const files = getChangedFiles()
    const diffSummary = getDiffSummary()
    const plan = readPlan()
    const task = plan?.task ?? readMemory().tasks.slice(-1)[0]?.task ?? ''

    const result = await generateCommitMessage(files, diffSummary, task)
    message = result.subject
    if (result.body) message += `\n\n${result.body}`

    const genLabel = result.generated ? fmt.green('(LLM)') : fmt.dim('(fallback)')
    console.log()
    console.log(`${fmt.bold('Commit message')} ${genLabel}:`)
    console.log(`  ${fmt.cyan(result.subject)}`)
    if (result.body) {
      for (const line of result.body.split('\n')) {
        console.log(`  ${fmt.dim(line)}`)
      }
    }
    console.log()

    const approved = await promptYesNo('Use this commit message?')
    if (!approved) {
      warn('Commit cancelled. Re-run with -m "your message" to use a custom message.')
      process.exit(0)
    }
  }

  // Stage all changes
  info('Staging all changes...')
  const stageResult = stageFiles([])
  if (!stageResult.success) {
    error(`Staging failed: ${stageResult.stderr}`)
    process.exit(1)
  }

  // Commit
  const commitResult = commit(message)
  if (!commitResult.success) {
    error(`Commit failed: ${commitResult.stderr}`)
    process.exit(1)
  }

  const hash = getLastCommitHash()
  success(`Committed ${fmt.cyan(hash)} — ${message.split('\n')[0]}`)
  console.log()
  info('To push: run `qwen-agent git push`')
}

// ─── git push ────────────────────────────────────────────────────────────────

export async function gitPushCommand(
  remote = 'origin',
  branchArg?: string,
): Promise<void> {
  requireGitRepo()
  banner('GIT PUSH')

  const branch = branchArg ?? getCurrentBranch()
  console.log(`${fmt.bold('Branch:')} ${fmt.cyan(branch)}`)
  console.log(`${fmt.bold('Remote:')} ${fmt.cyan(remote)}`)
  console.log()

  // Safety: never force-push
  if (hasUncommittedChanges()) {
    warn('You have uncommitted changes.')
    info('Commit them first with `qwen-agent git commit` before pushing.')
    process.exit(1)
  }

  const hash = getLastCommitHash()
  if (hash) {
    info(`Last commit: ${fmt.cyan(hash)}`)
    console.log()
  }

  // Require explicit approval before pushing
  const approved = await promptYesNo(
    `Push branch ${fmt.cyan(branch)} to ${fmt.cyan(remote)}?`,
  )
  if (!approved) {
    warn('Push cancelled.')
    process.exit(0)
  }

  info(`Pushing ${branch} to ${remote}...`)
  const result = push(remote, branch)

  if (!result.success) {
    error(`Push failed:\n${result.stderr}`)
    process.exit(1)
  }

  if (result.stdout.trim()) console.log(result.stdout)
  if (result.stderr.trim()) console.log(result.stderr) // git push writes progress to stderr
  success(`Pushed ${fmt.cyan(branch)} to ${fmt.cyan(remote)}`)
}

// ─── Convenience export for coordinator ──────────────────────────────────────

export { printChangedFilesTable, promptYesNo }
