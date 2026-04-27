import * as fs from 'fs'
import * as path from 'path'
import { scanProjectFiles } from '../../src/context/projectScanner.js'
import { buildIndex } from '../../src/context/fileIndex.js'
import { writeCache } from '../../src/context/cache.js'
import { writeContext } from '../memory/store.js'
import { banner, success, info, section, log } from '../output/formatter.js'
import type { ProjectContext } from '../types.js'

interface ScanCommandOpts {
  depth?: string
  refresh?: boolean
}

export async function scanCommand(opts: ScanCommandOpts): Promise<void> {
  banner('PROJECT SCAN')

  const maxDepth = parseInt(opts.depth ?? '8', 10)
  info(`Scanning with max depth ${maxDepth}...`)

  const scan = await scanProjectFiles({ maxDepth })
  info(`Found ${scan.totalFiles} files — building index...`)

  const index = buildIndex(scan)
  writeCache(scan, index)

  // Write legacy .agent/context.json for backward compatibility
  let packageJson: Record<string, unknown> | undefined
  const pkgPath = path.join(scan.root, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try { packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) } catch { /* ignore */ }
  }

  const legacyContext: ProjectContext = {
    root: scan.root,
    fileTree: scan.fileTree,
    files: scan.records.map(r => ({
      path: r.path,
      relativePath: r.relativePath,
      size: r.size,
      extension: r.extension,
      modified: r.lastModified.toISOString(),
    })),
    summary: [
      `Project: ${(packageJson?.name as string | undefined) ?? path.basename(scan.root)}`,
      `Root: ${scan.root}`,
      `Files: ${scan.totalFiles}`,
      `Languages: ${scan.languages.join(', ') || 'unknown'}`,
    ].join('\n'),
    totalFiles: scan.totalFiles,
    languages: scan.languages,
    packageJson,
    hasGit: fs.existsSync(path.join(scan.root, '.git')),
    hasTsConfig: scan.records.some(r => r.relativePath.includes('tsconfig')),
  }
  writeContext(legacyContext)

  success('Scan complete')

  section('Summary')
  log(`Files scanned:  ${scan.totalFiles}`)
  log(`Index entries:  ${index.records.size}`)
  log(`Languages:      ${scan.languages.join(', ') || 'unknown'}`)
  log(`TypeScript:     ${scan.records.some(r => r.extension === '.ts') ? 'yes' : 'no'}`)

  section('File Tree (top 60 lines)')
  const treeLines = scan.fileTree.split('\n')
  const preview = treeLines.slice(0, 60)
  console.log(preview.join('\n'))
  if (treeLines.length > 60) {
    log(`... (${treeLines.length - 60} more entries)`)
  }

  console.log()
  success('Cache saved to .qwen-agent/context-cache.json')
  success('Context saved to .agent/context.json')
}
