import { validateCommand, RiskLevel } from '../../src/safety/shellSafety.js'
import { runCommand } from '../shell/executor.js'

const LEVEL_COLOR: Record<RiskLevel, string> = {
  [RiskLevel.SAFE]: '\x1b[32m',      // green
  [RiskLevel.CAUTION]: '\x1b[33m',   // yellow
  [RiskLevel.DANGEROUS]: '\x1b[35m', // magenta
  [RiskLevel.BLOCKED]: '\x1b[31m',   // red
}
const RESET = '\x1b[0m'

function printSafetyReport(command: string): void {
  const result = validateCommand(command)
  const color = LEVEL_COLOR[result.level]

  console.log()
  console.log(`  Command    : ${result.command}`)
  console.log(`  Risk Level : ${color}${result.level}${RESET}`)
  console.log(`  Status     : ${result.allowed ? 'ALLOWED' : result.requiresApproval ? 'APPROVAL_REQUIRED' : 'BLOCKED'}`)
  console.log(`  Reason     : ${result.reason}`)
  console.log()
}

export async function shellExplainCommand(command: string): Promise<void> {
  printSafetyReport(command)
}

export async function shellRunCommand(
  command: string,
  opts: { explain?: boolean } = {},
): Promise<void> {
  if (opts.explain) {
    printSafetyReport(command)
    return
  }

  const result = validateCommand(command)
  const color = LEVEL_COLOR[result.level]

  console.log(`\n${color}[${result.level}]${RESET} ${result.command}`)

  if (result.level === RiskLevel.BLOCKED) {
    console.error(`\x1b[31m✖  Blocked: ${result.reason}${RESET}`)
    process.exitCode = 1
    return
  }

  const { exitCode } = await runCommand(command, { requireApproval: true })
  if (exitCode !== 0) process.exitCode = exitCode
}
