import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import {
  loadQwenConfig,
  validateQwenConfig,
  configToDisplayRows,
  maskApiKey,
} from '../../src/config/qwenConfig.js'
import { banner, section, success, error, warn, info, fmt } from '../output/formatter.js'
import { KNOWN_MODELS } from '../../src/llm/modelRouter.js'

// ─── show ─────────────────────────────────────────────────────────────────────

export function configShowCommand(): void {
  banner('QWEN CONFIGURATION')
  const cfg = loadQwenConfig()
  const rows = configToDisplayRows(cfg)

  const keyWidth = Math.max(...rows.map(([k]) => k.length))
  for (const [key, val] of rows) {
    console.log(`  ${fmt.cyan(key.padEnd(keyWidth))}  ${val}`)
  }

  console.log()
  const { valid, errors, warnings } = validateQwenConfig(cfg)
  if (valid) {
    success('Configuration is valid')
  } else {
    errors.forEach(e => error(e))
  }
  warnings.forEach(w => warn(w))
}

// ─── check ────────────────────────────────────────────────────────────────────

export function configCheckCommand(): void {
  banner('CONFIG CHECK')
  const cfg = loadQwenConfig()
  const { valid, errors, warnings } = validateQwenConfig(cfg)

  section('Required values')
  const requiredChecks: Array<[string, boolean, string]> = [
    ['QWEN_API_KEY', !!cfg.apiKey, cfg.apiKey ? `set (${maskApiKey(cfg.apiKey)})` : 'NOT SET'],
    ['QWEN_BASE_URL', !!cfg.baseUrl, cfg.baseUrl],
    ['QWEN_MODEL', !!cfg.model, cfg.model],
  ]
  for (const [key, ok, display] of requiredChecks) {
    if (ok) {
      console.log(`  ${fmt.green('✓')} ${key}: ${display}`)
    } else {
      console.log(`  ${fmt.red('✗')} ${key}: ${display}`)
    }
  }

  section('Optional values')
  console.log(`  ${fmt.dim('QWEN_TIMEOUT_MS')}  ${cfg.timeoutMs}ms`)
  console.log(`  ${fmt.dim('QWEN_MAX_RETRIES')} ${cfg.maxRetries}`)
  console.log(`  ${fmt.dim('QWEN_MAX_TOKENS')}  ${cfg.maxTokens}`)
  console.log(`  ${fmt.dim('QWEN_STREAM')}      ${cfg.stream}`)

  console.log()
  if (errors.length > 0) {
    errors.forEach(e => error(e))
    console.log()
    info('Fix by running: agent config set-key')
    info('Or set environment variables manually: export QWEN_API_KEY=your-key')
    process.exit(1)
  }

  warnings.forEach(w => warn(w))

  success('All required config is present')

  section('Known models')
  for (const m of KNOWN_MODELS) {
    const marker = m.id === cfg.model ? fmt.green('*') : ' '
    console.log(`  ${marker} ${fmt.bold(m.id.padEnd(12))} ${fmt.dim(m.description)}`)
  }
}

// ─── set-key ─────────────────────────────────────────────────────────────────

export async function configSetKeyCommand(keyArg?: string): Promise<void> {
  banner('SET API KEY')

  let apiKey = keyArg?.trim()

  if (!apiKey) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    apiKey = await new Promise<string>(resolve => {
      rl.question('Enter your Qwen API key: ', answer => {
        rl.close()
        resolve(answer.trim())
      })
    })
  }

  if (!apiKey) {
    error('No API key provided')
    process.exit(1)
  }

  const envFile = path.resolve('.env')

  if (fs.existsSync(envFile)) {
    let content = fs.readFileSync(envFile, 'utf8')
    if (content.includes('QWEN_API_KEY=')) {
      // Replace existing key
      content = content.replace(/^QWEN_API_KEY=.*/m, `QWEN_API_KEY=${apiKey}`)
    } else {
      content = content.trimEnd() + `\nQWEN_API_KEY=${apiKey}\n`
    }
    fs.writeFileSync(envFile, content, 'utf8')
    success(`.env updated — key: ${maskApiKey(apiKey)}`)
  } else {
    // Create minimal .env
    const examplePath = path.resolve('.env.example')
    const base = fs.existsSync(examplePath)
      ? fs.readFileSync(examplePath, 'utf8').replace(/^QWEN_API_KEY=.*/m, `QWEN_API_KEY=${apiKey}`)
      : `QWEN_API_KEY=${apiKey}\n`
    fs.writeFileSync(envFile, base, 'utf8')
    success(`.env created — key: ${maskApiKey(apiKey)}`)
  }

  // Ensure .gitignore covers .env
  const gi = '.gitignore'
  if (fs.existsSync(gi)) {
    const giContent = fs.readFileSync(gi, 'utf8')
    if (!giContent.includes('.env')) {
      fs.appendFileSync(gi, '\n.env\n')
      info('Added .env to .gitignore')
    }
  }

  info('Reload your shell or re-run the agent to pick up the new key.')
}
