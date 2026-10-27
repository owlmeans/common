import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { InstallItem, ApplyResult } from './types.js'

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

/** The embedded file an item copies: its part's, or the skill's own `SKILL.md`. */
const sourceOf = (item: InstallItem): string | undefined =>
  item.part == null
    ? item.entry.sourcePath
    : item.entry.parts?.find(part => part.name === item.part)?.sourcePath

/** Remove a pruned part, and its `parts/` directory once nothing is left in it. */
const prune = (path: string): void => {
  rmSync(path, { force: true })
  const partsDir = dirname(path)
  try {
    if (readdirSync(partsDir).length === 0) rmSync(partsDir, { recursive: true, force: true })
  } catch { /* already gone */ }
}

/**
 * Execute an install plan. Items with action 'conflict' or 'skip-uptodate'
 * are not written; 'install' and 'update' items are written and 'prune' items removed.
 * Each skill is linked once, however many of its files the plan touched.
 */
export const applyInstall = (items: InstallItem[], targetDir?: string): ApplyResult => {
  const result: ApplyResult = { installed: 0, updated: 0, skipped: 0, conflicts: 0, linked: 0, pruned: 0 }
  const written = new Set<string>()

  for (const item of items) {
    if (item.action === 'skip-uptodate') {
      result.skipped++
      written.add(item.entry.name)
      continue
    }
    if (item.action === 'conflict') {
      result.conflicts++
      continue
    }
    if (item.action === 'prune') {
      prune(item.targetPath)
      result.pruned++
      continue
    }

    const source = sourceOf(item)
    if (source == null) continue
    const content = readFileSync(source, 'utf8')
    mkdirSync(dirname(item.targetPath), { recursive: true })
    writeFileSync(item.targetPath, content, 'utf8')
    written.add(item.entry.name)

    if (item.action === 'install') result.installed++
    else result.updated++
  }

  if (targetDir != null && written.size > 0) {
    result.linked = linkForClaude(targetDir, [...written])
  }

  return result
}
