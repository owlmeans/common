import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DiscoveredEntry } from './discover.js'

export type InstallAction =
  | 'install'       // target missing → write
  | 'skip-uptodate' // bytes identical → no-op
  | 'update'        // managed (banner present) and differs → overwrite
  | 'conflict'      // local edit (no banner) and differs → skip or prompt

export interface InstallItem {
  entry: DiscoveredEntry
  targetPath: string
  action: InstallAction
}

/** The banner text injected by sync-agent-meta into every generated file. */
export const AUTO_GENERATED_BANNER = '<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->'

/**
 * Skills install into `.agents/skills/<name>/SKILL.md` — the canonical store of the
 * Agent Skills standard, discovered natively by Copilot and Codex. Claude Code reads
 * them through the per-skill symlinks in `.claude/skills/` that {@link applyInstall}
 * maintains.
 */
const targetPath = (targetDir: string, entry: DiscoveredEntry): string =>
  join(targetDir, '.agents', 'skills', entry.name, 'SKILL.md')

export interface PlanOptions {
  /** Treat conflicts as 'overwrite' (--force). */
  force?: boolean
}

export const planInstall = (
  entries: DiscoveredEntry[],
  targetDir: string,
  opts: PlanOptions = {},
): InstallItem[] => {
  return entries.map(entry => {
    const path = targetPath(targetDir, entry)

    if (!existsSync(path)) {
      return { entry, targetPath: path, action: 'install' }
    }

    let existing: string
    try {
      existing = readFileSync(path, 'utf8')
    } catch {
      return { entry, targetPath: path, action: 'install' }
    }

    const source = readFileSync(entry.sourcePath, 'utf8')

    if (existing === source) {
      return { entry, targetPath: path, action: 'skip-uptodate' }
    }

    const isManaged = existing.includes(AUTO_GENERATED_BANNER)
    if (isManaged) {
      return { entry, targetPath: path, action: 'update' }
    }

    // Local edit: skip by default, overwrite if --force
    return {
      entry,
      targetPath: path,
      action: opts.force ? 'update' : 'conflict',
    }
  })
}
