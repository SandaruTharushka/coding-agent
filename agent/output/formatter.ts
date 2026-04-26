import type { Plan } from '../types.js'

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

const c = (color: string, s: string) => `${color}${s}${C.reset}`

export const fmt = {
  cyan: (s: string) => c(C.cyan, s),
  green: (s: string) => c(C.green, s),
  yellow: (s: string) => c(C.yellow, s),
  red: (s: string) => c(C.red, s),
  bold: (s: string) => c(C.bold, s),
  dim: (s: string) => c(C.dim, s),
  blue: (s: string) => c(C.blue, s),
}

export function banner(title: string): void {
  const line = '─'.repeat(60)
  console.log(`\n${fmt.cyan(line)}`)
  console.log(fmt.bold(fmt.cyan(`  ${title}`)))
  console.log(`${fmt.cyan(line)}\n`)
}

export function section(title: string): void {
  console.log(`\n${fmt.bold(fmt.blue(`▶ ${title}`))}`)
}

export function success(msg: string): void {
  console.log(`${fmt.green('✓')} ${msg}`)
}

export function warn(msg: string): void {
  console.log(`${fmt.yellow('⚠')} ${msg}`)
}

export function error(msg: string): void {
  console.log(`${fmt.red('✗')} ${msg}`)
}

export function info(msg: string): void {
  console.log(`${fmt.cyan('ℹ')} ${msg}`)
}

export function log(msg: string): void {
  console.log(`  ${msg}`)
}

export function printDiff(diff: string): void {
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      process.stdout.write(fmt.green(line) + '\n')
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      process.stdout.write(fmt.red(line) + '\n')
    } else if (line.startsWith('@')) {
      process.stdout.write(fmt.cyan(line) + '\n')
    } else {
      process.stdout.write(line + '\n')
    }
  }
}

export function printPlan(plan: Plan): void {
  banner('EXECUTION PLAN')
  console.log(`${fmt.bold('Task:')} ${plan.task}`)
  console.log(`${fmt.bold('Created:')} ${plan.createdAt}`)

  section('Files to Change')
  if (plan.filesToChange.length === 0) {
    log(fmt.dim('(none identified yet)'))
  } else {
    for (const f of plan.filesToChange) {
      const actionColor =
        f.action === 'create' ? fmt.green : f.action === 'delete' ? fmt.red : fmt.yellow
      console.log(`  ${actionColor(`[${f.action}]`)} ${f.path}`)
      console.log(`    ${fmt.dim(f.reason)}`)
    }
  }

  section('Steps')
  plan.steps.forEach((s, i) => {
    console.log(`  ${fmt.cyan(`${i + 1}.`)} ${s}`)
  })
  console.log()
}
