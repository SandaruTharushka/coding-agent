import { execSync } from 'child_process'
import { readPlan, readMemory } from '../memory/store.js'
import { banner, success, error, info, warn } from '../output/formatter.js'
import {
  qwenChatCompletion,
  type QwenMessage,
} from '../../services/api/qwen-provider.js'

async function generateCommitMessage(diff: string, task: string): Promise<string> {
  if (!process.env.QWEN_API_KEY) return `chore: ${task || 'agent changes'}`

  const messages: QwenMessage[] = [
    {
      role: 'user',
      content: `Write a concise git commit message (1 line, imperative mood, under 72 chars) for these changes:\n\nTask: ${task}\n\nDiff (truncated):\n${diff.slice(0, 3000)}\n\nRespond with ONLY the commit message, no quotes.`,
    },
  ]

  try {
    const resp = await qwenChatCompletion({ messages, temperature: 0.3 })
    const msg = resp.choices[0]?.message?.content?.trim() ?? ''
    return msg.length > 0 ? msg.replace(/^["']|["']$/g, '') : `chore: ${task || 'apply agent changes'}`
  } catch {
    return `chore: ${task || 'apply agent changes'}`
  }
}

export async function commitCommand(messageArg?: string): Promise<void> {
  banner('GIT COMMIT')

  // Check for git repo
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' })
  } catch {
    error('Not a git repository')
    process.exit(1)
  }

  // Show status
  const status = execSync('git status --short', { encoding: 'utf8' })
  if (!status.trim()) {
    warn('Nothing to commit (working tree clean)')
    return
  }

  info('Changed files:')
  console.log(status)

  // Stage all changes
  info('Staging changes...')
  execSync('git add -A', { stdio: 'inherit' })

  // Determine commit message
  let message = messageArg?.trim()

  if (!message) {
    info('Generating commit message...')
    const plan = readPlan()
    const task = plan?.task ?? readMemory().tasks.slice(-1)[0]?.task ?? ''

    let diff = ''
    try {
      diff = execSync('git diff --cached --stat', { encoding: 'utf8' })
    } catch { /* ignore */ }

    message = await generateCommitMessage(diff, task)
    info(`Generated message: "${message}"`)
  }

  // Commit
  try {
    const out = execSync(`git commit -m ${JSON.stringify(message)}`, { encoding: 'utf8' })
    console.log(out)
    success('Committed successfully')
  } catch (e) {
    const err = e as { stderr?: string; message?: string }
    error(`Commit failed: ${err.stderr ?? err.message ?? String(e)}`)
    process.exit(1)
  }
}
