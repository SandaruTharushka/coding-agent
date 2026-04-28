import {
  getUsageSummary,
  getUsageByProvider,
  getUsageByModel,
  getUsageByTask,
  getAllUsage,
  clearUsage,
} from '../../src/usage/tokenUsageStore.js'
import { formatCost } from '../../src/usage/costEstimator.js'
import { banner, section, success, warn, fmt } from '../output/formatter.js'

// ─── usage summary ─────────────────────────────────────────────────────────────

export function usageSummaryCommand(opts: { json?: boolean }): void {
  const summary = getUsageSummary()

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  banner('TOKEN USAGE SUMMARY')

  if (summary.totalRecords === 0) {
    warn('No usage records found. Run some agent tasks to track usage.')
    return
  }

  section('Totals')
  console.log(`  ${fmt.cyan('Calls'.padEnd(20))} ${summary.totalRecords}`)
  console.log(`  ${fmt.cyan('Input tokens'.padEnd(20))} ${summary.totalInputTokens.toLocaleString()}`)
  console.log(`  ${fmt.cyan('Output tokens'.padEnd(20))} ${summary.totalOutputTokens.toLocaleString()}`)
  console.log(`  ${fmt.cyan('Total tokens'.padEnd(20))} ${summary.totalTokens.toLocaleString()}`)
  console.log(`  ${fmt.cyan('Estimated cost'.padEnd(20))} ${formatCost(summary.totalEstimatedCost)}`)

  section('By Provider')
  const w = 16
  console.log(
    '  ' +
    fmt.bold('Provider'.padEnd(w)) +
    fmt.bold('Calls'.padEnd(8)) +
    fmt.bold('In'.padEnd(12)) +
    fmt.bold('Out'.padEnd(12)) +
    fmt.bold('Total'.padEnd(14)) +
    fmt.bold('Cost'),
  )
  for (const [id, data] of Object.entries(summary.byProvider)) {
    console.log(
      '  ' +
      id.padEnd(w) +
      String(data.calls).padEnd(8) +
      data.inputTokens.toLocaleString().padEnd(12) +
      data.outputTokens.toLocaleString().padEnd(12) +
      data.totalTokens.toLocaleString().padEnd(14) +
      formatCost(data.estimatedCost),
    )
  }

  section('By Model')
  console.log(
    '  ' +
    fmt.bold('Model'.padEnd(32)) +
    fmt.bold('Calls'.padEnd(8)) +
    fmt.bold('Total tokens'.padEnd(16)) +
    fmt.bold('Cost'),
  )
  for (const [id, data] of Object.entries(summary.byModel)) {
    console.log(
      '  ' +
      id.padEnd(32) +
      String(data.calls).padEnd(8) +
      data.totalTokens.toLocaleString().padEnd(16) +
      formatCost(data.estimatedCost),
    )
  }
}

// ─── usage providers ──────────────────────────────────────────────────────────

export function usageProvidersCommand(opts: { provider?: string; json?: boolean }): void {
  if (opts.provider) {
    const records = getUsageByProvider(opts.provider)
    if (opts.json) { console.log(JSON.stringify(records, null, 2)); return }
    banner(`USAGE — ${opts.provider}`)
    if (records.length === 0) { warn('No usage records for this provider.'); return }
    printRecords(records)
  } else {
    usageSummaryCommand(opts)
  }
}

// ─── usage models ─────────────────────────────────────────────────────────────

export function usageModelsCommand(opts: { model?: string; json?: boolean }): void {
  if (opts.model) {
    const records = getUsageByModel(opts.model)
    if (opts.json) { console.log(JSON.stringify(records, null, 2)); return }
    banner(`USAGE — model: ${opts.model}`)
    if (records.length === 0) { warn('No usage records for this model.'); return }
    printRecords(records)
  } else {
    const summary = getUsageSummary()
    if (opts.json) { console.log(JSON.stringify(summary.byModel, null, 2)); return }
    banner('USAGE BY MODEL')
    for (const [id, data] of Object.entries(summary.byModel)) {
      console.log(`  ${fmt.bold(id)}`)
      console.log(`    Calls: ${data.calls}  Tokens: ${data.totalTokens.toLocaleString()}  Cost: ${formatCost(data.estimatedCost)}`)
    }
  }
}

// ─── usage tasks ──────────────────────────────────────────────────────────────

export function usageTasksCommand(opts: { task?: string; json?: boolean }): void {
  if (opts.task) {
    const records = getUsageByTask(opts.task)
    if (opts.json) { console.log(JSON.stringify(records, null, 2)); return }
    banner(`USAGE — task: ${opts.task}`)
    if (records.length === 0) { warn('No usage records for this task.'); return }
    printRecords(records)
  } else {
    const records = getAllUsage()
    if (opts.json) { console.log(JSON.stringify(records, null, 2)); return }
    banner('USAGE BY TASK')

    const byTask: Record<string, { calls: number; tokens: number; cost: number | null }> = {}
    for (const r of records) {
      const key = r.taskId ?? '(no task)'
      if (!byTask[key]) byTask[key] = { calls: 0, tokens: 0, cost: null }
      byTask[key].calls++
      byTask[key].tokens += r.totalTokens
      if (r.estimatedCost !== null) {
        byTask[key].cost = (byTask[key].cost ?? 0) + r.estimatedCost
      }
    }

    if (Object.keys(byTask).length === 0) { warn('No usage records found.'); return }
    for (const [id, data] of Object.entries(byTask)) {
      console.log(`  ${fmt.bold(id)}`)
      console.log(`    Calls: ${data.calls}  Tokens: ${data.tokens.toLocaleString()}  Cost: ${formatCost(data.cost)}`)
    }
  }
}

// ─── usage clear ──────────────────────────────────────────────────────────────

export function usageClearCommand(opts: { confirm?: boolean }): void {
  if (!opts.confirm) {
    warn('This will permanently delete all usage records.')
    warn('Re-run with --confirm to proceed: qwen-agent usage clear --confirm')
    return
  }
  clearUsage()
  success('Usage records cleared')
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function printRecords(records: ReturnType<typeof getAllUsage>): void {
  for (const r of records.slice(-20)) {
    console.log(
      `  ${fmt.dim(r.timestamp.slice(0, 19))} ` +
      `${fmt.cyan(r.providerId)}/${r.model} ` +
      `${fmt.dim(`in:${r.inputTokens} out:${r.outputTokens}`)} ` +
      `cost:${formatCost(r.estimatedCost)}` +
      (r.agentName ? ` agent:${r.agentName}` : ''),
    )
  }
  if (records.length > 20) {
    console.log(fmt.dim(`  … and ${records.length - 20} more records`))
  }
}
