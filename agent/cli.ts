#!/usr/bin/env node
import { Command } from 'commander'
import { loadDotEnv } from '../src/config/qwenConfig.js'

// Load .env before any command runs (shell env always takes priority)
loadDotEnv('.env')

import { initCommand } from './commands/init.js'
import { scanCommand } from './commands/scan.js'
import { contextCommand } from './commands/context.js'
import { planCommand } from './commands/plan.js'
import { applyCommand, applyTaskCommand } from './commands/apply.js'
import { testCommand } from './commands/test.js'
import { commitCommand } from './commands/commit.js'
import { reviewCommand } from './commands/review.js'
import { diffCommand } from './commands/diff.js'
import { rollbackCommand } from './commands/rollback.js'
import { editSessionsCommand } from './commands/editSessions.js'
import {
  configShowCommand,
  configCheckCommand,
  configSetKeyCommand,
} from './commands/config.js'
import {
  aiProvidersCommand,
  aiConfigShowCommand,
  aiConfigSetDefaultCommand,
  aiKeySetCommand,
  aiKeyRemoveCommand,
  aiModelsCommand,
  aiTestCommand,
  aiProfileSetCommand,
} from './commands/ai.js'
import {
  usageSummaryCommand,
  usageProvidersCommand,
  usageModelsCommand,
  usageTasksCommand,
  usageClearCommand,
} from './commands/usage.js'
import { shellRunCommand, shellExplainCommand } from './commands/shell.js'
import { verifyCommand } from './commands/verify.js'
import {
  gitStatusCommand,
  gitDiffCommand,
  gitSummaryCommand,
  gitCommitCommand,
  gitPushCommand,
} from './commands/gitWorkflow.js'
import {
  memoryTasksCommand,
  memoryDecisionsCommand,
  memoryNotesCommand,
  memorySearchCommand,
  memoryAddNoteCommand,
  memoryClearCommand,
} from './commands/memory.js'

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
  .description('Scan project files and update context in .agent/context.json')
  .option('-d, --depth <depth>', 'Max directory scan depth', '8')
  .option('--refresh', 'Force refresh even if cache is current')
  .action(async (opts: { depth?: string; refresh?: boolean }) => { await scanCommand(opts) })

program
  .command('context')
  .description('Show context selected for a task (scores, token budget, ranked files)')
  .argument('<task>', 'Task description to select context for')
  .option('--json', 'Output as JSON including full context text')
  .option('--refresh', 'Force re-scan even if cache is current')
  .option('--max-files <n>', 'Maximum files to include in context (default: 30)')
  .option('--max-tokens <n>', 'Token budget (default: 40000)')
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
  .option('--verify', 'Run build/lint verification after apply completes')
  .action(async (task: string | undefined, opts: { model?: string; dryRun?: boolean; verify?: boolean }) => {
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

program
  .command('diff')
  .description('Show diff preview of the latest (or specified) edit session')
  .option('--session <id>', 'Session ID to inspect')
  .option('--json', 'Output full session as JSON')
  .action(async (opts: { session?: string; json?: boolean }) => {
    await diffCommand({ json: opts.json, sessionId: opts.session })
  })

program
  .command('rollback')
  .description('Roll back the latest applied session, or a specific session by ID')
  .argument('[session-id]', 'Session ID to roll back (defaults to latest applied)')
  .action(async (sessionId?: string) => { await rollbackCommand(sessionId) })

program
  .command('edit-sessions')
  .description('List all edit sessions with status, changed files and backup locations')
  .option('--json', 'Output as JSON')
  .option('--limit <n>', 'Maximum sessions to display (default: 20)')
  .action((opts: { json?: boolean; limit?: string }) => { editSessionsCommand(opts) })

// ─── Git command group ────────────────────────────────────────────────────────

const gitCmd = program
  .command('git')
  .description('Git workflow helpers (status, diff, summary, commit, push)')

gitCmd
  .command('status')
  .description('Show current branch and changed files')
  .action(async () => { await gitStatusCommand() })

gitCmd
  .command('diff')
  .description('Show a safe, masked diff summary of staged and unstaged changes')
  .action(async () => { await gitDiffCommand() })

gitCmd
  .command('summary')
  .description('Show changed files grouped by status (added/modified/deleted/renamed/untracked)')
  .action(async () => { await gitSummaryCommand() })

gitCmd
  .command('commit')
  .description('Stage all changes and commit (generates message via LLM if -m is omitted)')
  .option('-m, --message <msg>', 'Commit message (skips LLM generation)')
  .action(async (opts: { message?: string }) => { await gitCommitCommand(opts.message) })

gitCmd
  .command('push')
  .description('Push current branch to remote (requires explicit approval)')
  .option('-r, --remote <remote>', 'Remote name', 'origin')
  .option('-b, --branch <branch>', 'Branch to push (defaults to current branch)')
  .action(async (opts: { remote?: string; branch?: string }) => {
    await gitPushCommand(opts.remote, opts.branch)
  })

// ─── Push alias ───────────────────────────────────────────────────────────────

program
  .command('push')
  .description('Alias for `git push` — push current branch to remote (requires approval)')
  .option('-r, --remote <remote>', 'Remote name', 'origin')
  .option('-b, --branch <branch>', 'Branch to push (defaults to current branch)')
  .action(async (opts: { remote?: string; branch?: string }) => {
    await gitPushCommand(opts.remote, opts.branch)
  })

// ─── Verify command ───────────────────────────────────────────────────────────

program
  .command('verify')
  .description('Run build/lint/test checks and report structured results')
  .option('--build', 'Run only the build check')
  .option('--lint', 'Run only the lint check')
  .option('--test', 'Run only the test check')
  .option('--retry', 'Re-run failed checks up to 3× before reporting failure')
  .action(async (opts: { build?: boolean; lint?: boolean; test?: boolean; retry?: boolean }) => {
    await verifyCommand(opts)
  })

// ─── Shell safety command ─────────────────────────────────────────────────────

program
  .command('shell')
  .description('Run a shell command through the safety layer, or explain its risk level')
  .argument('<command>', 'Shell command to run or explain')
  .option('--explain', 'Show risk level and reason without executing')
  .action(async (command: string, opts: { explain?: boolean }) => {
    if (opts.explain) {
      await shellExplainCommand(command)
    } else {
      await shellRunCommand(command)
    }
  })

// ─── AI provider command group ────────────────────────────────────────────────

const aiCmd = program
  .command('ai')
  .description('Manage AI providers, API keys, models and agent profiles')

aiCmd
  .command('providers')
  .description('List all AI providers and their connection status')
  .action(() => { aiProvidersCommand() })

const aiConfigCmd = aiCmd
  .command('config')
  .description('AI configuration management')

aiConfigCmd
  .command('show')
  .description('Display full AI configuration (keys masked)')
  .action(() => { aiConfigShowCommand() })

aiConfigCmd
  .command('set-default')
  .description('Set the default AI provider and model')
  .option('--provider <id>', 'Provider ID (qwen|openai|anthropic|gemini|openrouter|deepseek|groq|ollama)')
  .option('--model <model>', 'Model name')
  .action((opts: { provider?: string; model?: string }) => { aiConfigSetDefaultCommand(opts) })

const aiKeyCmd = aiCmd
  .command('key')
  .description('Manage provider API keys')

aiKeyCmd
  .command('set')
  .description('Set API key for a provider (saved to .env)')
  .option('--provider <id>', 'Provider ID', 'qwen')
  .action(async (opts: { provider?: string }) => { await aiKeySetCommand(opts) })

aiKeyCmd
  .command('remove')
  .description('Remove API key for a provider from .env')
  .option('--provider <id>', 'Provider ID', 'qwen')
  .action((opts: { provider?: string }) => { aiKeyRemoveCommand(opts) })

aiCmd
  .command('models')
  .description('List known models for a provider')
  .option('--provider <id>', 'Provider ID', 'qwen')
  .action((opts: { provider?: string }) => { aiModelsCommand(opts) })

aiCmd
  .command('test')
  .description('Test connection to a provider by making a minimal API call')
  .option('--provider <id>', 'Provider ID')
  .option('--model <model>', 'Model name')
  .action(async (opts: { provider?: string; model?: string }) => { await aiTestCommand(opts) })

aiCmd
  .command('profile')
  .description('Agent model profile management')
  .command('set')
  .description('Set provider/model for a specific agent role')
  .option('--agent <name>', 'Agent name (coordinator|architect|coder|tester|reviewer)')
  .option('--provider <id>', 'Provider ID')
  .option('--model <model>', 'Model name')
  .action((opts: { agent?: string; provider?: string; model?: string }) => {
    aiProfileSetCommand(opts)
  })

// ─── Usage command group ──────────────────────────────────────────────────────

const usageCmd = program
  .command('usage')
  .description('View token usage and cost estimates')

usageCmd
  .command('summary')
  .description('Show overall usage summary across all providers and models')
  .option('--json', 'Output as JSON')
  .action((opts: { json?: boolean }) => { usageSummaryCommand(opts) })

usageCmd
  .command('providers')
  .description('Show usage grouped by provider')
  .option('--provider <id>', 'Filter by provider ID')
  .option('--json', 'Output as JSON')
  .action((opts: { provider?: string; json?: boolean }) => { usageProvidersCommand(opts) })

usageCmd
  .command('models')
  .description('Show usage grouped by model')
  .option('--model <model>', 'Filter by model name')
  .option('--json', 'Output as JSON')
  .action((opts: { model?: string; json?: boolean }) => { usageModelsCommand(opts) })

usageCmd
  .command('tasks')
  .description('Show usage grouped by task ID')
  .option('--task <id>', 'Filter by task ID')
  .option('--json', 'Output as JSON')
  .action((opts: { task?: string; json?: boolean }) => { usageTasksCommand(opts) })

usageCmd
  .command('clear')
  .description('Delete all usage records (irreversible)')
  .option('--confirm', 'Required to actually clear')
  .action((opts: { confirm?: boolean }) => { usageClearCommand(opts) })

// ─── Config command group ─────────────────────────────────────────────────────

const configCmd = program
  .command('config')
  .description('Manage configuration (legacy — use `ai` commands for multi-provider)')

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

// ─── Memory command group ─────────────────────────────────────────────────────

const memoryCmd = program
  .command('memory')
  .description('View and manage task history, decisions, and project notes')

memoryCmd
  .command('tasks')
  .description('List recent task records')
  .option('--json', 'Output as JSON')
  .option('--limit <n>', 'Maximum records to show (default: 20)')
  .action((opts: { json?: boolean; limit?: string }) => { memoryTasksCommand(opts) })

memoryCmd
  .command('decisions')
  .description('List recent agent decisions')
  .option('--json', 'Output as JSON')
  .option('--limit <n>', 'Maximum records to show (default: 20)')
  .action((opts: { json?: boolean; limit?: string }) => { memoryDecisionsCommand(opts) })

memoryCmd
  .command('notes')
  .description('List all project notes')
  .option('--json', 'Output as JSON')
  .action((opts: { json?: boolean }) => { memoryNotesCommand(opts) })

memoryCmd
  .command('search')
  .description('Search across all memory records')
  .argument('<query>', 'Search text')
  .option('--json', 'Output as JSON')
  .action((query: string, opts: { json?: boolean }) => { memorySearchCommand(query, opts) })

memoryCmd
  .command('add-note')
  .description('Save a project note')
  .argument('<title>', 'Note title')
  .argument('<content>', 'Note content')
  .option('--tags <tags>', 'Comma-separated tags')
  .action((title: string, content: string, opts: { tags?: string }) => {
    memoryAddNoteCommand(title, content, opts)
  })

memoryCmd
  .command('clear')
  .description('Delete all memory records (irreversible)')
  .option('--confirm', 'Required to actually clear')
  .action((opts: { confirm?: boolean }) => { memoryClearCommand(opts) })

// ─── Entry ────────────────────────────────────────────────────────────────────

if (process.argv.length <= 2) {
  program.help()
}

program.parseAsync(process.argv).catch(err => {
  console.error('\x1b[31mFatal error:\x1b[0m', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
