import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { InstallItem } from './plan.js'

export interface ApplyResult {
  installed: number
  updated: number
  skipped: number
  conflicts: number
}

/**
 * Execute an install plan. Items with action 'conflict' or 'skip-uptodate'
 * are not written. Only 'install' and 'update' items are written.
 */
export const applyInstall = (items: InstallItem[]): ApplyResult => {
  const result: ApplyResult = { installed: 0, updated: 0, skipped: 0, conflicts: 0 }

  for (const item of items) {
    if (item.action === 'skip-uptodate') {
      result.skipped++
      continue
    }
    if (item.action === 'conflict') {
      result.conflicts++
      continue
    }

    const content = readFileSync(item.entry.sourcePath, 'utf8')
    mkdirSync(dirname(item.targetPath), { recursive: true })
    writeFileSync(item.targetPath, content, 'utf8')

    if (item.action === 'install') result.installed++
    else result.updated++
  }

  return result
}
