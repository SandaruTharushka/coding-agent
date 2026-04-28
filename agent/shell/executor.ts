import { execSync } from 'child_process'
import * as readline from 'readline'
import {
  validateCommand,
  blockCommand,
  requiresApproval as safetyRequiresApproval,
  RiskLevel,
  type SafetyResult,
} from '../../src/safety/shellSafety.js'

export type { SafetyResult }
export { validateCommand, blockCommand, RiskLevel }

export interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** @deprecated Use blockCommand() from shellSafety instead */
export function isBlocked(command: string): boolean {
  return blockCommand(command)
}

/** @deprecated Use requiresApproval() from shellSafety instead */
export function isRisky(command: string): boolean {
  return safetyRequiresApproval(command)
}

async function promptApproval(result: SafetyResult): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const prompt = [
    '\x1b[33m',
    '⚠  Command requires approval',
    `   Command    : ${result.command}`,
    `   Risk Level : ${result.level}`,
    `   Reason     : ${result.reason}`,
    'Approve? [y/N] \x1b[0m',
  ].join('\n')

  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'y')
    })
  })
}

export async function runCommand(
  command: string,
  options: { cwd?: string; requireApproval?: boolean; silent?: boolean } = {},
): Promise<ShellResult> {
  const safety = validateCommand(command)

  if (safety.level === RiskLevel.BLOCKED) {
    const msg = `Blocked: ${safety.reason} — "${safety.command}"`
    if (!options.silent) process.stderr.write('\x1b[31m✖  ' + msg + '\x1b[0m\n')
    return { stdout: '', stderr: msg, exitCode: 1 }
  }

  if (options.requireApproval !== false && safety.requiresApproval) {
    const approved = await promptApproval(safety)
    if (!approved) {
      const msg = 'Command rejected by user'
      if (!options.silent) process.stderr.write('\x1b[33m✖  ' + msg + '\x1b[0m\n')
      return { stdout: '', stderr: msg, exitCode: 1 }
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
  if (blockCommand(command)) {
    throw new Error(`Blocked command rejected by runSync: "${command}"`)
  }
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
