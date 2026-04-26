import { scanProject } from '../scanner/project.js'
import { writeContext } from '../memory/store.js'
import { banner, success, info, log, section } from '../output/formatter.js'

export async function scanCommand(opts: { depth?: string }): Promise<void> {
  banner('PROJECT SCAN')

  const maxDepth = parseInt(opts.depth ?? '5', 10)
  info(`Scanning with max depth ${maxDepth}...`)

  const project = await scanProject(maxDepth)
  writeContext(project)

  success('Scan complete')
  section('Summary')
  log(`Files:     ${project.totalFiles}`)
  log(`Languages: ${project.languages.join(', ') || 'unknown'}`)
  log(`Git:       ${project.hasGit ? 'yes' : 'no'}`)
  log(`TypeScript: ${project.hasTsConfig ? 'yes' : 'no'}`)

  if (project.packageJson) {
    const pkg = project.packageJson
    log(`Package:   ${String(pkg.name ?? '?')} v${String(pkg.version ?? '?')}`)
  }

  section('File Tree (top 60 lines)')
  const treeLines = project.fileTree.split('\n')
  const preview = treeLines.slice(0, 60)
  console.log(preview.join('\n'))
  if (treeLines.length > 60) {
    log(`... (${treeLines.length - 60} more entries)`)
  }

  console.log()
  success(`Context saved to .agent/context.json`)
}
