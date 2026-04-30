export enum RiskLevel {
  SAFE = 'SAFE',
  CAUTION = 'CAUTION',
  DANGEROUS = 'DANGEROUS',
  BLOCKED = 'BLOCKED',
}

export interface SafetyResult {
  command: string
  level: RiskLevel
  allowed: boolean
  requiresApproval: boolean
  reason: string
}

// Hard-blocked patterns — never execute under any circumstance
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Destructive filesystem wipes
  {
    pattern: /\brm\s+-[a-z]*r[a-z]*f\s+\/(\s|$)/i,
    reason: 'Recursive force delete of filesystem root',
  },
  {
    pattern: /\brm\s+-[a-z]*f[a-z]*r\s+\/(\s|$)/i,
    reason: 'Recursive force delete of filesystem root',
  },
  {
    pattern: /\brm\s+-[a-z]*r[a-z]*f\s+\*/i,
    reason: 'Recursive force delete of all files in current directory',
  },
  {
    pattern: /\brm\s+-[a-z]*f[a-z]*r\s+\*/i,
    reason: 'Recursive force delete of all files in current directory',
  },
  // Windows destructive deletes
  {
    pattern: /\bdel\s+\/[sqf]*[sq][sqf]*\b/i,
    reason: 'Silent recursive Windows delete (/s /q)',
  },
  // Disk operations
  { pattern: /\bformat\s+[a-z]:/i, reason: 'Windows disk format — destroys all data on the drive' },
  { pattern: /\bmkfs\b/i, reason: 'Filesystem format operation' },
  { pattern: /\bdiskpart\b/i, reason: 'Windows disk partition utility' },
  { pattern: /\bdd\s+if=/i, reason: 'Raw disk write — can overwrite data irreversibly' },
  { pattern: />\s*\/dev\//i, reason: 'Redirect output directly to a device file' },
  // System lifecycle
  { pattern: /\bshutdown\b/i, reason: 'System shutdown' },
  { pattern: /\breboot\b/i, reason: 'System reboot' },
  // Git destructive
  {
    pattern: /\bgit\s+reset\s+--hard\b/i,
    reason: 'Irreversible discard of uncommitted changes and history rewrite',
  },
  {
    pattern: /\bgit\s+clean\s+[^-\s]*-[a-z]*f/i,
    reason: 'Force-removes all untracked files (unrecoverable)',
  },
  {
    pattern: /\bgit\s+push\s+--force\b/i,
    reason: 'Force push overwrites remote history',
  },
  // Remote code execution
  {
    pattern: /\bcurl\s+[^|]+\|\s*(ba)?sh\b/i,
    reason: 'Pipes remote script directly into shell (arbitrary code execution)',
  },
  {
    pattern: /\bwget\s+[^|]+\|\s*(ba)?sh\b/i,
    reason: 'Pipes remote script directly into shell (arbitrary code execution)',
  },
  // Privilege abuse
  { pattern: /\bsudo\s+rm\b/i, reason: 'Privileged file deletion' },
  {
    pattern: /\bchmod\s+-R\s+777\b/i,
    reason: 'Makes all files world-writable — severe security risk',
  },
  { pattern: /\bchown\s+-R\b/i, reason: 'Recursive ownership change' },
  // Windows registry
  { pattern: /\breg\s+delete\b/i, reason: 'Windows registry key deletion' },
  // PowerShell recursive force delete
  {
    pattern: /Remove-Item\s+.*-Recurse.*-Force/i,
    reason: 'PowerShell recursive force delete',
  },
  {
    pattern: /Remove-Item\s+.*-Force.*-Recurse/i,
    reason: 'PowerShell recursive force delete',
  },
  { pattern: /\bkill\s+-9\s+1\b/i, reason: 'Sends SIGKILL to PID 1 (init/systemd)' },
  { pattern: /\bkill\s+-(?:KILL|9)\s+(?:0|-1)\b/i, reason: 'SIGKILL to all processes' },
  { pattern: /\bpkill\s+-9\b/i, reason: 'SIGKILL to process group' },
  { pattern: /\btruncate\s+-s\s+0\b/i, reason: 'Empties files destructively' },
  { pattern: /\b>\s*\/dev\/(?!null\b)/i, reason: 'Redirect to device file (not /dev/null)' },
]

// System directory paths that must not be targeted
const SYSTEM_PATH_PATTERN =
  /(?:^|[\s"'`(])\/(?:etc|usr|bin|sbin|lib|lib64|boot|sys|proc|dev|home|root|var)(?:\/|[\s"'`)]|$)/i
const WINDOWS_SYSTEM_PATH_PATTERN =
  /(?:^|[\s"'`(])C:\\(?:Windows|Program\s+Files|System32)/i
// Home directory targeted for deletion
const HOME_DESTRUCTIVE_PATTERN =
  /\b(?:rm|rmdir|del|rd)\b.*(?:~\/\s*$|~\s*$|~\/\*|~\\\*)/i

// Path traversal out of project root
const PATH_TRAVERSAL_PATTERN = /\.\.[/\\]/

// Approval-required patterns — dangerous enough to pause and confirm
const APPROVAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\bnpm\s+install(?:\s|$)/i,
    reason: 'Installs npm packages — modifies node_modules and lockfile',
  },
  {
    pattern: /\bnpm\s+i\b/i,
    reason: 'Installs npm packages — modifies node_modules and lockfile',
  },
  {
    pattern: /\bpnpm\s+install\b/i,
    reason: 'Installs pnpm packages',
  },
  {
    pattern: /\byarn\s+install\b/i,
    reason: 'Installs yarn packages',
  },
  {
    pattern: /\byarn\s+add\b/i,
    reason: 'Adds yarn package — modifies package.json and lockfile',
  },
  {
    pattern: /\bpip\s+install\b/i,
    reason: 'Installs Python packages',
  },
  {
    pattern: /\bgit\s+push\b/i,
    reason: 'Pushes commits to remote repository',
  },
  {
    pattern: /\bgit\s+pull\b/i,
    reason: 'Pulls and fast-merges remote changes',
  },
  {
    pattern: /\bgit\s+checkout\b/i,
    reason: 'Switches branches or restores working tree files',
  },
  {
    pattern: /\bgit\s+merge\b/i,
    reason: 'Merges branches — may introduce conflicts',
  },
  {
    pattern: /\bgit\s+reset\b/i,
    reason: 'Resets git HEAD or index',
  },
  {
    pattern: /\brm\b/i,
    reason: 'Deletes files or directories',
  },
  {
    pattern: /\bdel\b/i,
    reason: 'Deletes files (Windows)',
  },
  {
    pattern: /\bmv\s+\S+\s+\S/i,
    reason: 'Moves or renames files',
  },
  {
    pattern: /\bnpm\s+publish\b/i,
    reason: 'Publishes package to the npm registry',
  },
  { pattern: /\bkill\b/i, reason: 'Sends signal to a process' },
  { pattern: /\bpkill\b/i, reason: 'Sends signal to processes by name' },
]

// Commands unconditionally allowed without approval
const SAFE_PATTERNS: RegExp[] = [
  /^\s*npm\s+run\s+(build|lint|test|typecheck|check|format|type-check)\b/i,
  /^\s*npm\s+test\b/i,
  /^\s*npx\s+tsc(\s|$)/i,
  /^\s*tsc(\s|$)/i,
  /^\s*git\s+(status|diff|log|show|branch|tag)\b/i,
  /^\s*git\s+stash\s+list\b/i,
  /^\s*git\s+remote\s+-v\b/i,
  /^\s*(dir|ls)(\s|$)/i,
  /^\s*(node|npm|npx|pnpm|yarn|tsc|tsx|python3?|pip)\s+--version\b/i,
  /^\s*echo\s+/i,
  /^\s*pwd\b/i,
  /^\s*which\s+\S/i,
  /^\s*where\s+\S/i,
  /^\s*find\s+\.(\s|$)/i,
  /^\s*grep\b/i,
]

/**
 * Returns true when a `cat`/`type` command targets a project-relative path
 * (not absolute, not home-relative, no `..` traversal).
 */
function isSafeCatCommand(cmd: string): boolean {
  const m = /^\s*(?:cat|type)\s+([^|;&`$]+)$/i.exec(cmd)
  if (!m) return false
  const arg = m[1].trim().replace(/^["']|["']$/g, '')
  if (arg.startsWith('/') || arg.startsWith('~')) return false
  if (PATH_TRAVERSAL_PATTERN.test(arg)) return false
  return true
}

/**
 * Returns true when the command must never execute regardless of approval.
 */
export function blockCommand(command: string): boolean {
  const cmd = command.trim()
  if (BLOCKED_PATTERNS.some(({ pattern }) => pattern.test(cmd))) return true
  if (SYSTEM_PATH_PATTERN.test(cmd)) return true
  if (WINDOWS_SYSTEM_PATH_PATTERN.test(cmd)) return true
  if (HOME_DESTRUCTIVE_PATTERN.test(cmd)) return true
  if (PATH_TRAVERSAL_PATTERN.test(cmd)) return true
  return false
}

/**
 * Returns true when the command is not blocked but needs explicit user approval.
 */
export function requiresApproval(command: string): boolean {
  const cmd = command.trim()
  if (blockCommand(cmd)) return false
  if (isSafeCatCommand(cmd)) return false
  if (SAFE_PATTERNS.some(p => p.test(cmd))) return false
  if (APPROVAL_PATTERNS.some(({ pattern }) => pattern.test(cmd))) return true
  // Unknown commands default to needing approval (conservative)
  return true
}

/**
 * Classify a command into a risk level.
 */
export function classifyCommand(command: string): RiskLevel {
  const cmd = command.trim()
  if (blockCommand(cmd)) return RiskLevel.BLOCKED
  if (isSafeCatCommand(cmd)) return RiskLevel.SAFE
  if (SAFE_PATTERNS.some(p => p.test(cmd))) return RiskLevel.SAFE
  if (APPROVAL_PATTERNS.some(({ pattern }) => pattern.test(cmd))) return RiskLevel.CAUTION
  // Unknown commands are CAUTION — not necessarily dangerous but unrecognised
  return RiskLevel.CAUTION
}

/**
 * Returns a human-readable explanation of why a command has its risk level.
 */
export function explainRisk(command: string): string {
  const cmd = command.trim()

  // Check hard-blocked patterns first
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(cmd)) return `BLOCKED — ${reason}`
  }
  if (SYSTEM_PATH_PATTERN.test(cmd) || WINDOWS_SYSTEM_PATH_PATTERN.test(cmd)) {
    return 'BLOCKED — Command targets a protected system directory (/etc, /usr, /bin, etc.)'
  }
  if (HOME_DESTRUCTIVE_PATTERN.test(cmd)) {
    return 'BLOCKED — Command attempts to delete the user home directory'
  }
  if (PATH_TRAVERSAL_PATTERN.test(cmd)) {
    return 'BLOCKED — Path traversal (../) detected; commands must stay within the project root'
  }

  // Check safe allowlist
  if (isSafeCatCommand(cmd) || SAFE_PATTERNS.some(p => p.test(cmd))) {
    return 'SAFE — Command is on the approved read-only / build allowlist'
  }

  // Check approval-required patterns
  for (const { pattern, reason } of APPROVAL_PATTERNS) {
    if (pattern.test(cmd)) return `APPROVAL_REQUIRED — ${reason}`
  }

  return 'CAUTION — Command is not on the safe allowlist; explicit approval required'
}

/**
 * Full validation result for a command.
 */
export function validateCommand(command: string): SafetyResult {
  const cmd = command.trim()
  const level = classifyCommand(cmd)
  const reason = explainRisk(cmd)

  switch (level) {
    case RiskLevel.BLOCKED:
      return { command: cmd, level, allowed: false, requiresApproval: false, reason }

    case RiskLevel.SAFE:
      return { command: cmd, level, allowed: true, requiresApproval: false, reason }

    case RiskLevel.DANGEROUS:
    case RiskLevel.CAUTION:
      return { command: cmd, level, allowed: false, requiresApproval: true, reason }
  }
}
