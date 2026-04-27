import type { ChangedFile } from './gitService.js'

export interface ChangeGroup {
  added: ChangedFile[]
  modified: ChangedFile[]
  deleted: ChangedFile[]
  renamed: ChangedFile[]
  untracked: ChangedFile[]
  other: ChangedFile[]
}

export interface ChangeSummary {
  totalFiles: number
  groups: ChangeGroup
  diffSummary: string
}

export function groupChangedFiles(files: ChangedFile[]): ChangeGroup {
  const groups: ChangeGroup = {
    added: [],
    modified: [],
    deleted: [],
    renamed: [],
    untracked: [],
    other: [],
  }
  for (const f of files) {
    switch (f.status) {
      case 'added':    groups.added.push(f);    break
      case 'modified': groups.modified.push(f); break
      case 'deleted':  groups.deleted.push(f);  break
      case 'renamed':  groups.renamed.push(f);  break
      case 'untracked': groups.untracked.push(f); break
      default: groups.other.push(f)
    }
  }
  return groups
}

// Only mask patterns that strongly indicate secret values in assignment context
const SECRET_PATTERNS: RegExp[] = [
  /\b(API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY|ACCESS_KEY|AUTH_TOKEN|BEARER_TOKEN)\s*=\s*['"]?([A-Za-z0-9+/._\-]{8,})['"]?/gi,
  /\bsk-[A-Za-z0-9]{20,}/g,         // OpenAI-style keys
  /\bghp_[A-Za-z0-9]{36,}/g,        // GitHub personal access tokens
  /\bxoxb-[A-Za-z0-9\-]{24,}/g,     // Slack bot tokens
  /\bAKIA[A-Z0-9]{16}/g,            // AWS access key IDs
]

export function maskSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, match => {
      const eqIdx = match.search(/=/)
      if (eqIdx !== -1) {
        return match.slice(0, eqIdx + 1) + '***MASKED***'
      }
      return '***MASKED***'
    })
  }
  return result
}

export function buildChangeSummary(files: ChangedFile[], diffSummary: string): ChangeSummary {
  return {
    totalFiles: files.length,
    groups: groupChangedFiles(files),
    diffSummary: maskSecrets(diffSummary),
  }
}
