import * as fs from 'fs'
import { runCommand } from '../shell/executor.js'
import { info, success, error, warn } from '../output/formatter.js'
import type { VerifyResult } from '../types.js'

const MAX_RETRIES = 3

function detectBuildCmd(): string | null {
  if (!fs.existsSync('package.json')) return null
  const { scripts = {} } = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
    scripts?: Record<string, string>
  }
  if (scripts.build) return 'npm run build'
  if (scripts.compile) return 'npm run compile'
  if (scripts.tsc) return 'npm run tsc'
  return null
}

function detectTestCmd(): string | null {
  if (!fs.existsSync('package.json')) return null
  const { scripts = {} } = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
    scripts?: Record<string, string>
  }
  if (scripts.test && !scripts.test.includes('no test')) return 'npm test'
  if (scripts['test:unit']) return 'npm run test:unit'
  return null
}

export async function runVerification(
  autoFix?: (errors: string) => Promise<boolean>,
): Promise<VerifyResult> {
  const buildCmd = detectBuildCmd()
  const testCmd = detectTestCmd()
  let attempts = 0
  const allErrors: string[] = []

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    attempts = attempt
    const errors: string[] = []

    info(`Verification attempt ${attempt}/${MAX_RETRIES}`)

    // Install deps if missing
    if (fs.existsSync('package.json') && !fs.existsSync('node_modules')) {
      info('node_modules missing — running npm install...')
      const r = await runCommand('npm install', { silent: false, requireApproval: false })
      if (r.exitCode !== 0) {
        errors.push(`npm install failed:\n${r.stderr}`)
      }
    }

    let buildOutput: string | undefined
    if (buildCmd && errors.length === 0) {
      info(`Build: ${buildCmd}`)
      const r = await runCommand(buildCmd, { silent: false, requireApproval: false })
      buildOutput = r.stdout + r.stderr
      if (r.exitCode !== 0) {
        errors.push(`Build failed:\n${r.stderr || r.stdout}`)
      } else {
        success('Build passed')
      }
    }

    let testOutput: string | undefined
    if (testCmd && errors.length === 0) {
      info(`Test: ${testCmd}`)
      const r = await runCommand(testCmd, { silent: false, requireApproval: false })
      testOutput = r.stdout + r.stderr
      if (r.exitCode !== 0) {
        errors.push(`Tests failed:\n${r.stdout}\n${r.stderr}`)
      } else {
        success('Tests passed')
      }
    }

    if (errors.length === 0) {
      return { success: true, buildOutput, testOutput, errors: [], attempts }
    }

    allErrors.push(...errors)

    if (attempt < MAX_RETRIES && autoFix) {
      warn(`Attempt ${attempt} failed. Sending errors to LLM for auto-fix...`)
      const fixed = await autoFix(errors.join('\n\n'))
      if (!fixed) {
        error('Auto-fix gave up')
        break
      }
    } else if (attempt === MAX_RETRIES || !autoFix) {
      break
    }
  }

  return { success: false, errors: allErrors, attempts }
}
