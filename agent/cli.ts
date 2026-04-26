#!/usr/bin/env node
import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { scanCommand } from './commands/scan.js'
import { planCommand } from './commands/plan.js'
import { applyCommand } from './commands/apply.js'
import { testCommand } from './commands/test.js'
import { commitCommand } from './commands/commit.js'

// Load .env if present
import * as fs from 'fs'
if (fs.existsSync('.env')) {
  const lines = fs.readFileSync('.env', 'utf8').split('\n')
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

const program = new Command()

program
  .name('agent')
  .description('Production-grade CLI coding agent powered by Qwen LLM')
  .version('1.0.0')

program
  .command('init')
  .description('Initialize project: scan structure, create .agent/ directory')
  .action(async () => {
    await initCommand()
  })

program
  .command('scan')
  .description('Scan project files and update context in .agent/context.json')
  .option('-d, --depth <depth>', 'Max directory scan depth', '5')
  .action(async (opts: { depth?: string }) => {
    await scanCommand(opts)
  })

program
  .command('plan')
  .description('Use the architect agent to plan a coding task')
  .argument('<task>', 'Describe the task (e.g. "add input validation to login form")')
  .option('-m, --model <model>', 'Qwen model override (e.g. qwen-plus, qwen-max)')
  .action(async (task: string, opts: { model?: string }) => {
    await planCommand(task, opts)
  })

program
  .command('apply')
  .description('Execute the current plan with the coder agent')
  .option('--dry-run', 'Preview diffs without making changes')
  .action(async (opts: { dryRun?: boolean }) => {
    await applyCommand(opts)
  })

program
  .command('test')
  .description('Run build and test suite, optionally auto-fix errors via LLM')
  .option('--fix', 'Auto-fix errors with LLM (up to 3 retries)')
  .action(async (opts: { fix?: boolean }) => {
    await testCommand(opts)
  })

program
  .command('commit')
  .description('Stage all changes and commit (auto-generates message if omitted)')
  .argument('[message]', 'Commit message')
  .action(async (message?: string) => {
    await commitCommand(message)
  })

// Default: show help if no command given
if (process.argv.length <= 2) {
  program.help()
}

program.parseAsync(process.argv).catch(err => {
  console.error('\x1b[31mFatal error:\x1b[0m', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
