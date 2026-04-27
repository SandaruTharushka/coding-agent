import { scanProject } from '../../src/context/projectScanner.js'
import { writeCache } from '../../src/context/cache.js'
import { writeContext } from '../memory/store.js'
import type { ProjectContext, FileEntry } from '../types.js'
import { banner, success, info, log, section } from '../output/formatter.js'

export async function scanCommand(opts: { depth?: string; refresh?: boolean }): Promise<void> {
  banner('PROJECT SCAN')

  const maxDepth = parseInt(opts.depth ?? '5', 10)
  info(`Scanning with max depth ${maxDepth}…`)

  const scan = await scanProject({ maxDepth })

  // Update .qwen-agent/ cache
  writeCache(scan.files)

  // Persist backward-compatible shape to .agent/context.json
  const legacyContext: ProjectContext = {
    root: scan.root,
    fileTree: scan.fileTree,
    files: scan.files.map(
      (f): FileEntry => ({
        path: f.path,
        relativePath: f.relativePath,
        size: f.size,
        extension: f.extension,
        modified: f.lastModified.toISOString(),
      }),
    ),
    summary: scan.summary,
    totalFiles: scan.totalFiles,
    languages: scan.languages,
    packageJson: scan.packageJson,
    hasGit: scan.hasGit,
    hasTsConfig: scan.hasTsConfig,
  }
  writeContext(legacyContext)

  success('Scan complete')
  section('Summary')
  log(`Files:      ${scan.totalFiles}`)
  log(`Languages:  ${scan.languages.join(', ') || 'unknown'}`)
  log(`Git:        ${scan.hasGit ? 'yes' : 'no'}`)
  log(`TypeScript: ${scan.hasTsConfig ? 'yes' : 'no'}`)

  if (scan.packageJson) {
    const pkg = scan.packageJson
    log(`Package:    ${String(pkg.name ?? '?')} v${String(pkg.version ?? '?')}`)
  }

  section('File Tree (top 60 lines)')
  const treeLines = scan.fileTree.split('\n')
  console.log(treeLines.slice(0, 60).join('\n'))
  if (treeLines.length > 60) log(`… (${treeLines.length - 60} more entries)`)

  console.log()
  success('Context saved → .agent/context.json  •  Cache → .qwen-agent/')
}
