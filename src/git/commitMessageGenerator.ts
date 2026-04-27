import { qwenChatCompletion, type QwenMessage } from '../../services/api/qwen-provider.js'
import type { ChangedFile } from './gitService.js'

export interface CommitMessageResult {
  subject: string
  body?: string
  generated: boolean
}

function buildFallbackMessage(files: ChangedFile[]): string {
  if (files.length === 0) return 'chore: update project files'
  const statuses = new Set(files.map(f => f.status))
  if (statuses.has('added') && files.length === 1) {
    return `feat: add ${files[0].path}`
  }
  if (statuses.size === 1 && statuses.has('deleted')) {
    return 'chore: remove unused files'
  }
  if (statuses.size === 1 && statuses.has('modified')) {
    return files.length === 1
      ? `fix: update ${files[0].path}`
      : 'fix: update project files'
  }
  return 'chore: update project files'
}

export async function generateCommitMessage(
  changedFiles: ChangedFile[],
  diffSummary: string,
  task?: string,
): Promise<CommitMessageResult> {
  if (!process.env.QWEN_API_KEY) {
    return { subject: buildFallbackMessage(changedFiles), generated: false }
  }

  const fileList = changedFiles
    .map(f => `  ${f.status.toUpperCase()}: ${f.path}`)
    .join('\n')

  const prompt = [
    'Generate a concise conventional git commit message for these changes.',
    'Output ONLY the commit message — subject line first (imperative mood, under 72 chars),',
    'then optionally a blank line followed by a brief body (2-3 lines max).',
    '',
    task ? `Task context: ${task}` : '',
    '',
    'Changed files:',
    fileList,
    '',
    'Diff summary:',
    diffSummary.slice(0, 2000),
    '',
    'Format examples (conventional commits):',
    '  feat: add git workflow CLI commands',
    '  fix: harden shell command safety validator',
    '  chore: update project dependencies',
    '  refactor: extract git service from commit command',
    '',
    'Respond with ONLY the commit message, nothing else.',
  ]
    .filter(l => l !== undefined)
    .join('\n')

  const messages: QwenMessage[] = [{ role: 'user', content: prompt }]

  try {
    const resp = await qwenChatCompletion({ messages, temperature: 0.2 })
    const raw = resp.choices[0]?.message?.content?.trim() ?? ''
    if (!raw) return { subject: buildFallbackMessage(changedFiles), generated: false }

    const cleaned = raw.replace(/^["'`]|["'`]$/g, '')
    const lines = cleaned.split('\n')
    const subject = lines[0].trim()
    const body = lines.slice(2).join('\n').trim() || undefined

    return {
      subject: subject || buildFallbackMessage(changedFiles),
      body,
      generated: true,
    }
  } catch {
    return { subject: buildFallbackMessage(changedFiles), generated: false }
  }
}
