#!/usr/bin/env node
/* eslint-disable no-console */
// Ensures the project-root node_modules are installed so the Electron main
// process can spawn `tsx` from `<root>/node_modules/.bin/`. If they're missing
// we run `npm install` once at the root.
//
// Idempotent: skips installation when tsx is already present.

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const IS_WINDOWS = process.platform === 'win32'

function fileExists(p) {
  try { return fs.existsSync(p) } catch { return false }
}

function tsxInstalled() {
  const candidates = IS_WINDOWS
    ? ['tsx.cmd', 'tsx.exe', 'tsx']
    : ['tsx']
  return candidates.some((name) =>
    fileExists(path.join(ROOT, 'node_modules', '.bin', name)),
  )
}

if (tsxInstalled()) {
  console.log('[ensure-root-deps] root tsx present — skipping install')
  process.exit(0)
}

if (!fileExists(path.join(ROOT, 'package.json'))) {
  console.warn(`[ensure-root-deps] no package.json at ${ROOT} — skipping`)
  process.exit(0)
}

console.log(`[ensure-root-deps] installing root dependencies in ${ROOT} …`)
const npmCmd = IS_WINDOWS ? 'npm.cmd' : 'npm'
const result = spawnSync(npmCmd, ['install', '--no-audit', '--no-fund'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: IS_WINDOWS,
})

if (result.status !== 0) {
  console.error('[ensure-root-deps] root npm install failed.')
  process.exit(result.status ?? 1)
}

console.log('[ensure-root-deps] root dependencies installed.')
