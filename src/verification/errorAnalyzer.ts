import type { CheckResult } from './verificationRunner.js'

export interface ParsedError {
  filePath: string
  line: number
  column: number
  errorCode: string
  message: string
  likelyCause: string
}

export interface ErrorAnalysis {
  errors: ParsedError[]
  summary: string
  totalCount: number
}

// TypeScript compiler formats:
//   src/foo.ts(10,5): error TS2322: ...
//   src/foo.ts:10:5 - error TS2322: ...
const TS_PAREN = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/
const TS_COLON = /^(.+?):(\d+):(\d+)\s+-\s+error\s+(TS\d+):\s+(.+)$/

// ESLint column line: "  10:5  error  message  rule-name"
const ESLINT_LINE = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/

// Vitest / Jest failure header
const TEST_FAIL_HEADER = /FAIL\s+(\S+\.(?:test|spec)\.[jt]sx?)/
// Stack frame
const STACK_FRAME = /at\s+\S+\s+\((.+?):(\d+):(\d+)\)/

const TS_CAUSE: Record<string, string> = {
  TS2322: 'Type mismatch — check variable types',
  TS2345: 'Argument type mismatch — check function parameters',
  TS2339: 'Property does not exist on type — check interface/object shape',
  TS2304: 'Identifier not found — check imports and declarations',
  TS7006: 'Implicit any — add type annotation',
  TS2307: 'Module not found — check import path or add declaration',
  TS2551: 'Property does not exist — possible typo or missing interface property',
  TS2741: 'Missing required property — check object literal completeness',
  TS2769: 'No overload matches — check argument types',
  TS2554: 'Argument count mismatch — check function signature',
}

function guessCause(code: string, message: string): string {
  if (TS_CAUSE[code]) return TS_CAUSE[code]
  if (code.startsWith('TS')) return `TypeScript error (${code})`
  if (message.includes('defined but never used')) return 'Remove unused binding or prefix with _'
  if (message.includes('Expected')) return 'Syntax or formatting issue'
  if (message.includes('import')) return 'Check import path or missing declaration'
  return 'Check surrounding code for context'
}

function parseTypeScriptErrors(lines: string[]): ParsedError[] {
  const errors: ParsedError[] = []
  for (const line of lines) {
    const m = TS_PAREN.exec(line) ?? TS_COLON.exec(line)
    if (!m) continue
    const [, filePath, lineStr, colStr, code, message] = m
    errors.push({
      filePath: filePath.trim(),
      line: parseInt(lineStr, 10),
      column: parseInt(colStr, 10),
      errorCode: code,
      message: message.trim(),
      likelyCause: guessCause(code, message),
    })
  }
  return errors
}

function parseEslintErrors(lines: string[]): ParsedError[] {
  const errors: ParsedError[] = []
  let currentFile = ''

  for (const line of lines) {
    // ESLint prints file path as a bare line with no leading spaces
    if (/^\S/.test(line) && /\.[jt]sx?$/.test(line.trim())) {
      currentFile = line.trim()
      continue
    }
    const m = ESLINT_LINE.exec(line)
    if (m && currentFile) {
      const [, lineStr, colStr, , message, rule] = m
      errors.push({
        filePath: currentFile,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        errorCode: rule,
        message: message.trim(),
        likelyCause: guessCause(rule, message),
      })
    }
  }
  return errors
}

function parseTestErrors(lines: string[]): ParsedError[] {
  const errors: ParsedError[] = []
  let currentFile = ''

  for (const line of lines) {
    const failMatch = TEST_FAIL_HEADER.exec(line)
    if (failMatch) {
      currentFile = failMatch[1]
      continue
    }
    const frameMatch = STACK_FRAME.exec(line)
    if (frameMatch && currentFile) {
      const [, filePath, lineStr, colStr] = frameMatch
      // Only capture frames inside project files, not node_modules
      if (!filePath.includes('node_modules')) {
        errors.push({
          filePath,
          line: parseInt(lineStr, 10),
          column: parseInt(colStr, 10),
          errorCode: 'TEST_FAIL',
          message: 'Test assertion failed',
          likelyCause: 'Check expected vs received values in test output above',
        })
      }
    }
  }
  return errors
}

function groupByFile(errors: ParsedError[]): Map<string, ParsedError[]> {
  const map = new Map<string, ParsedError[]>()
  for (const e of errors) {
    const existing = map.get(e.filePath) ?? []
    existing.push(e)
    map.set(e.filePath, existing)
  }
  return map
}

function buildSummary(errors: ParsedError[]): string {
  if (errors.length === 0) return 'No structured errors parsed.'
  const byFile = groupByFile(errors)
  const lines: string[] = [`${errors.length} error(s) found:\n`]
  for (const [filePath, fileErrors] of byFile) {
    lines.push(`  ${filePath}: ${fileErrors.length} error(s)`)
    for (const e of fileErrors.slice(0, 5)) {
      lines.push(`    Line ${e.line}:${e.column} [${e.errorCode}] ${e.message}`)
      lines.push(`    → ${e.likelyCause}`)
    }
    if (fileErrors.length > 5) lines.push(`    ... and ${fileErrors.length - 5} more`)
  }
  return lines.join('\n')
}

export function analyzeErrors(
  rawOutput: string,
  type: 'typescript' | 'eslint' | 'test',
): ErrorAnalysis {
  const lines = rawOutput.split('\n')
  const errors =
    type === 'typescript'
      ? parseTypeScriptErrors(lines)
      : type === 'eslint'
        ? parseEslintErrors(lines)
        : parseTestErrors(lines)

  return { errors, summary: buildSummary(errors), totalCount: errors.length }
}

export function summarizeForLLM(checks: CheckResult[]): string {
  const failed = checks.filter(c => !c.skipped && !c.success)
  if (failed.length === 0) return 'All checks passed.'

  return failed
    .map(check => {
      const raw = check.errorSummary ?? [check.stderr, check.stdout].filter(Boolean).join('\n').trim()
      const type: 'typescript' | 'eslint' | 'test' =
        check.name === 'build' ? 'typescript' : check.name === 'lint' ? 'eslint' : 'test'
      const analysis = analyzeErrors(raw, type)
      const structured = analysis.totalCount > 0 ? `\n${analysis.summary}` : ''
      return `=== ${check.name.toUpperCase()} ERRORS ===${structured}\n\nRaw output:\n${raw.slice(0, 1500)}`
    })
    .join('\n\n')
}
