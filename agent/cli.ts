#!/usr/bin/env node
import { Command } from 'commander'
import { loadDotEnv } from '../src/config/qwenConfig.js'

// Load .env before any command runs (shell env always takes priority)
loadDotEnv('.env')

import { initCommand } from './commands/init.js'
import { scanCommand } from './commands/scan.js'
import { planCommand } from './commands/plan.js'
import { applyCommand, applyTaskCommand } from './commands/apply.js'
import { testCommand } from './commands/test.js'
import { commitCommand } from './commands/commit.js'
import { reviewCommand } from './commands/review.js'
import { contextCommand } from './commands/context.js'
import {
  configShowCommand,
  configCheckCommand,
  configSetKeyCommand,
} from './commands/config.js'

const program = new Command()

program
  .name('qwen-agent')
  .description('Multi-agent CLI coding assistant powered by Qwen LLM')
  .version('1.0.0')

// ─── Core commands ────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize project: scan structure, create .agent/ directory')
  .action(async () => { await initCommand() })

program
  .command('scan')
  .description('Scan project files, update .agent/context.json and .qwen-agent/ cache')
  .option('-d, --depth <depth>', 'Max directory scan depth', '5')
  .option('--refresh', 'Force cache refresh')
  .action(async (opts: { depth?: string; refresh?: boolean }) => { await scanCommand(opts) })

program
  .command('context')
  .description('Show ranked relevant files and estimated token budget for a task')
  .argument('<task>', 'Task description to select context for')
  .option('--json', 'Output as JSON')
  .option('--refresh', 'Force cache refresh before selecting')
  .option('--max-files <n>', 'Maximum files to rank', '30')
  .option('--max-tokens <n>', 'Token budget', '40000')
  .action(async (
    task: string,
    opts: { json?: boolean; refresh?: boolean; maxFiles?: string; maxTokens?: string },
  ) => { await contextCommand(task, opts) })

program
  .command('plan')
  .description('Use the architect agent to plan a coding task')
  .argument('<task>', 'Describe the task (e.g. "add input validation to login form")')
  .option('-m, --model <model>', 'Qwen model override (e.g. qwen-plus, qwen-max)')
  .action(async (task: string, opts: { model?: string }) => { await planCommand(task, opts) })

program
  .command('apply')
  .description('Execute the current plan (or plan + apply a new task in one step)')
  .argument('[task]', 'Optional task — if provided, creates a plan then applies it immediately')
  .option('-m, --model <model>', 'Qwen model override (e.g. qwen-plus, qwen-max)')
  .option('--dry-run', 'Preview plan without making changes')
  .action(async (task: string | undefined, opts: { model?: string; dryRun?: boolean }) => {
    if (task) {
      await applyTaskCommand(task, opts)
    } else {
      await applyCommand(opts)
    }
  })

program
  .command('test')
  .description('Run build and test suite via the tester agent')
  .option('--fix', 'Auto-fix errors with LLM (handled by coordinator retry loop)')
  .action(async (opts: { fix?: boolean }) => { await testCommand(opts) })

program
  .command('review')
  .description('Run the reviewer agent against the current plan and implementation')
  .action(async () => { await reviewCommand() })

program
  .command('commit')
  .description('Stage all changes and commit (auto-generates message if omitted)')
  .argument('[message]', 'Commit message')
  .action(async (message?: string) => { await commitCommand(message) })

// ─── Config command group ─────────────────────────────────────────────────────

const configCmd = program
  .command('config')
  .description('Manage Qwen configuration')

configCmd
  .command('show')
  .description('Display current configuration (API key masked)')
  .action(() => { configShowCommand() })

configCmd
  .command('check')
  .description('Validate required configuration and report issues')
  .action(() => { configCheckCommand() })

configCmd
  .command('set-key')
  .description('Save Qwen API key to .env file')
  .argument('[key]', 'API key (prompted if omitted)')
  .action(async (key?: string) => { await configSetKeyCommand(key) })

// ─── Entry ────────────────────────────────────────────────────────────────────

if (process.argv.length <= 2) {
  program.help()
}

program.parseAsync(process.argv).catch(err => {
  console.error('\x1b[31mFatal error:\x1b[0m', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
