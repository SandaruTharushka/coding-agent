import { execSync } from 'child_process'
import * as readline from 'readline'

const BLOCKED: RegExp[] = [
  /\brm\s+-rf\s+\//i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bdel\s+\/[fqs]/i,
  /\bformat\s+[a-z]:/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+push\s+--force\b/i,
  /\bgit\s+clean\s+-fd\b/i,
  />\s*\/dev\//i,
  /\bcurl\s+.*\|\s*(bash|sh)\b/i,
]

const RISKY: RegExp[] = [
  /\brm\s+-r\b/i,
  /\bgit\s+reset\b/i,
  /\bnpm\s+publish\b/i,
  /\bgit\s+push\b/i,
]

export interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number
}

export function isBlocked(command: string): boolean {
  return BLOCKED.some(p => p.test(command))
}

export function isRisky(command: string): boolean {
  return RISKY.some(p => p.test(command))
}

async function promptApproval(command: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(
      `\x1b[33m⚠ Risky command detected:\n  ${command}\nApprove? [y/N] \x1b[0m`,
      answer => {
        rl.close()
        resolve(answer.trim().toLowerCase() === 'y')
      },
    )
  })
}

export async function runCommand(
  command: string,
  options: { cwd?: string; requireApproval?: boolean; silent?: boolean } = {},
): Promise<ShellResult> {
  if (isBlocked(command)) {
    return {
      stdout: '',
      stderr: `Blocked: command matches a dangerous pattern — "${command}"`,
      exitCode: 1,
    }
  }

  if (options.requireApproval !== false && isRisky(command)) {
    const approved = await promptApproval(command)
    if (!approved) {
      return { stdout: '', stderr: 'Command rejected by user', exitCode: 1 }
    }
  }

  try {
    const stdout = execSync(command, {
      cwd: options.cwd ?? process.cwd(),
      encoding: 'utf8',
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (!options.silent && stdout.trim()) {
      const lines = stdout.split('\n')
      const out =
        lines.length > 60
          ? lines.slice(0, 60).join('\n') + `\n...(${lines.length - 60} more lines)`
          : stdout
      process.stdout.write(out)
    }

    return { stdout, stderr: '', exitCode: 0 }
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number; message?: string }
    const stdout = err.stdout ?? ''
    const stderr = err.stderr ?? err.message ?? String(e)
    if (!options.silent) {
      if (stdout.trim()) process.stdout.write(stdout)
      if (stderr.trim()) process.stderr.write(stderr + '\n')
    }
    return { stdout, stderr, exitCode: err.status ?? 1 }
  }
}

export function runSync(command: string, cwd?: string): string {
  try {
    return execSync(command, {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf8',
      timeout: 30_000,
    })
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    throw new Error(err.stderr ?? err.message ?? String(e))
  }
}
