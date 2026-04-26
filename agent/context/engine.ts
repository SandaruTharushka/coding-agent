import * as fs from 'fs'
import * as path from 'path'
import type { FileEntry, ProjectContext } from '../types.js'

const MAX_CONTEXT_TOKENS = 40_000
const CHARS_PER_TOKEN = 4

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export interface ContextSelection {
  files: Array<{ path: string; content: string; tokens: number }>
  totalTokens: number
  truncated: boolean
}

function scoreFile(file: FileEntry, task: string): number {
  let score = 0
  const rel = file.relativePath.toLowerCase()
  const words = task.toLowerCase().split(/\W+/).filter(w => w.length > 3)

  // Recency
  const ageMs = Date.now() - new Date(file.modified).getTime()
  if (ageMs < 3_600_000) score += 20
  else if (ageMs < 86_400_000) score += 10

  // Task keyword match in path
  for (const word of words) {
    if (rel.includes(word)) score += 15
  }

  // Important config / entry files
  if (rel.includes('package.json') || rel.includes('tsconfig')) score += 12
  if (rel.includes('index') || rel.includes('main') || rel.includes('cli')) score += 8
  if (rel.includes('readme')) score += 5

  // Prefer smaller files
  if (file.size < 5_000) score += 5
  else if (file.size < 20_000) score += 2

  // Source code over generated/config
  if (['.ts', '.js', '.py', '.go', '.rs'].includes(file.extension)) score += 5

  return score
}

export function buildContext(
  project: ProjectContext,
  task: string,
  maxTokens = MAX_CONTEXT_TOKENS,
): ContextSelection {
  const sorted = [...project.files].sort((a, b) => scoreFile(b, task) - scoreFile(a, task))

  let totalTokens = estimateTokens(project.fileTree) + estimateTokens(project.summary)
  const selected: ContextSelection['files'] = []

  for (const file of sorted) {
    let content: string
    try {
      content = fs.readFileSync(file.path, 'utf8')
    } catch {
      continue
    }

    const fileTokens = estimateTokens(content)
    if (totalTokens + fileTokens > maxTokens) {
      const remaining = maxTokens - totalTokens
      if (remaining > 500) {
        content = content.slice(0, remaining * CHARS_PER_TOKEN) + '\n...(truncated)'
        selected.push({ path: file.relativePath, content, tokens: remaining })
        totalTokens += remaining
      }
      return { files: selected, totalTokens, truncated: true }
    }

    selected.push({ path: file.relativePath, content, tokens: fileTokens })
    totalTokens += fileTokens
  }

  return { files: selected, totalTokens, truncated: false }
}

export function formatContextForLLM(selection: ContextSelection, project: ProjectContext): string {
  const parts: string[] = [
    `## Project Structure\n\`\`\`\n${project.fileTree}\n\`\`\``,
    `## Project Summary\n${project.summary}`,
  ]
  for (const file of selection.files) {
    const ext = path.extname(file.path).slice(1) || 'text'
    parts.push(`## File: ${file.path}\n\`\`\`${ext}\n${file.content}\n\`\`\``)
  }
  return parts.join('\n\n')
}
