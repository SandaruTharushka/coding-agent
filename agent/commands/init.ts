import * as fs from 'fs'
import { scanProject } from '../scanner/project.js'
import { writeContext, writeMemory, readMemory } from '../memory/store.js'
import { banner, success, info, warn, log } from '../output/formatter.js'

export async function initCommand(): Promise<void> {
  banner('AGENT INIT')

  if (!process.env.QWEN_API_KEY) {
    warn('QWEN_API_KEY is not set. Set it before running agent commands:')
    log('  export QWEN_API_KEY=your-key')
    log('  or add it to a .env file')
    console.log()
  }

  info('Scanning project...')
  const project = await scanProject()
  writeContext(project)

  const memory = readMemory()
  memory.projectRoot = project.root
  memory.projectSummary = project.summary
  writeMemory(memory)

  success('Project context saved to .agent/context.json')
  log(`  Files:     ${project.totalFiles}`)
  log(`  Languages: ${project.languages.join(', ') || 'unknown'}`)
  log(`  Git:       ${project.hasGit ? 'yes' : 'no'}`)
  log(`  Root:      ${project.root}`)

  // Create .env.example if none exists
  if (!fs.existsSync('.env') && !fs.existsSync('.env.example')) {
    fs.writeFileSync(
      '.env.example',
      'QWEN_API_KEY=\nQWEN_MODEL=qwen-plus\nQWEN_STREAM=true\n',
      'utf8',
    )
    info('Created .env.example')
  }

  // Update .gitignore
  const gi = '.gitignore'
  if (fs.existsSync(gi)) {
    const content = fs.readFileSync(gi, 'utf8')
    const additions: string[] = []
    if (!content.includes('.agent/backups')) additions.push('.agent/backups/')
    if (!content.includes('.env') && !content.includes('*.env')) additions.push('.env')
    if (additions.length > 0) {
      fs.appendFileSync(gi, '\n' + additions.join('\n') + '\n')
      info(`Updated .gitignore (added: ${additions.join(', ')})`)
    }
  }

  console.log()
  success('Ready. Next steps:')
  log('  agent scan              — refresh project context')
  log('  agent plan "<task>"     — generate an execution plan')
  log('  agent apply             — execute the plan')
  log('  agent test              — run build + tests')
  log('  agent commit "<msg>"    — commit changes')
}
