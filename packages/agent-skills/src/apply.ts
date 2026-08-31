import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { InstallItem } from './plan.js'

export interface ApplyResult {
  installed: number
  updated: number
  skipped: number
  conflicts: number
  linked: number
}

/**
 * Claude Code discovers skills only under `.claude/skills/`, so every installed skill
 * gets a per-skill symlink into the canonical `.agents/skills/` store. Copilot and
 * Codex read `.agents/skills/` directly and need nothing here.
 *
 * Only projects that already carry a `.claude/` directory are bridged — a
 * Copilot/Codex-only project stays free of Claude Code scaffolding. Real files are
 * never replaced, and failures (Windows without symlink rights) are non-fatal.
 */
const linkForClaude = (targetDir: string, names: string[]): number => {
  if (!existsSync(join(targetDir, '.claude'))) return 0
  const skillsDir = join(targetDir, '.claude', 'skills')
  mkdirSync(skillsDir, { recursive: true })

  let linked = 0
  for (const name of names) {
    const link = join(skillsDir, name)
    try {
      if (existsSync(link) || lstatSync(link, { throwIfNoEntry: false }) != null) {
        if (!lstatSync(link).isSymbolicLink()) continue
        rmSync(link)
      }
      symlinkSync(join('..', '..', '.agents', 'skills', name), link)
      linked++
    } catch { /* non-fatal: the repo's link-skills.sh can retry */ }
  }
  return linked
}

/**
 * Execute an install plan. Items with action 'conflict' or 'skip-uptodate'
 * are not written. Only 'install' and 'update' items are written.
 */
export const applyInstall = (items: InstallItem[], targetDir?: string): ApplyResult => {
  const result: ApplyResult = { installed: 0, updated: 0, skipped: 0, conflicts: 0, linked: 0 }
  const written: string[] = []

  for (const item of items) {
    if (item.action === 'skip-uptodate') {
      result.skipped++
      written.push(item.entry.name)
      continue
    }
    if (item.action === 'conflict') {
      result.conflicts++
      continue
    }

    const content = readFileSync(item.entry.sourcePath, 'utf8')
    mkdirSync(dirname(item.targetPath), { recursive: true })
    writeFileSync(item.targetPath, content, 'utf8')
    written.push(item.entry.name)

    if (item.action === 'install') result.installed++
    else result.updated++
  }

  if (targetDir != null && written.length > 0) {
    result.linked = linkForClaude(targetDir, written)
  }

  return result
}
