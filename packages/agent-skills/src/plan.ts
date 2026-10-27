import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DiscoveredEntry, InstallAction, InstallItem, PlanOptions } from './types.js'
import type { StalePart } from './types.local.js'
import { AUTO_GENERATED_BANNER } from './consts.js'
import { PARTS_DIR } from './consts.local.js'

/**
 * Skills install into `.agents/skills/<name>/SKILL.md` — the canonical store of the
 * Agent Skills standard, discovered natively by Copilot and Codex. Claude Code reads
 * them through the per-skill symlinks in `.claude/skills/` that {@link applyInstall}
 * maintains. A split skill's parts land beside it in `.agents/skills/<name>/parts/`.
 */
const skillDir = (targetDir: string, entry: DiscoveredEntry): string =>
  join(targetDir, '.agents', 'skills', entry.name)

/** A file the installer wrote carries the generated banner; anything else is somebody's edit. */
const isManaged = (content: string): boolean => content.includes(AUTO_GENERATED_BANNER)

/**
 * One file's action: missing → install, identical → skip, bannered → update, and a local
 * edit → conflict (or update under `--force`). A part follows exactly the rule its skill does.
 */
const decide = (path: string, sourcePath: string, force: boolean): InstallAction => {
  if (!existsSync(path)) return 'install'

  let existing: string
  try {
    existing = readFileSync(path, 'utf8')
  } catch {
    return 'install'
  }

  if (existing === readFileSync(sourcePath, 'utf8')) return 'skip-uptodate'
  if (isManaged(existing)) return 'update'

  // Local edit: skip by default, overwrite if --force
  return force ? 'update' : 'conflict'
}

/**
 * Generated parts on disk that the skill no longer lists. Only a bannered file is a candidate:
 * a part somebody wrote by hand is theirs, whatever its name.
 */
const staleParts = (dir: string, listed: Set<string>): StalePart[] => {
  const partsDir = join(dir, PARTS_DIR)
  if (!existsSync(partsDir)) return []

  const stale: StalePart[] = []
  for (const file of readdirSync(partsDir).filter(file => file.endsWith('.md')).sort()) {
    const name = file.slice(0, -'.md'.length)
    if (listed.has(name)) continue
    const path = join(partsDir, file)
    try {
      if (isManaged(readFileSync(path, 'utf8'))) stale.push({ name, path })
    } catch { /* unreadable: not ours to remove */ }
  }
  return stale
}

export const planInstall = (
  entries: DiscoveredEntry[],
  targetDir: string,
  opts: PlanOptions = {},
): InstallItem[] => {
  const force = opts.force === true
  const items: InstallItem[] = []

  for (const entry of entries) {
    const dir = skillDir(targetDir, entry)
    const path = join(dir, 'SKILL.md')
    items.push({ entry, targetPath: path, action: decide(path, entry.sourcePath, force) })

    const listed = new Set<string>()
    for (const part of entry.parts ?? []) {
      listed.add(part.name)
      const partPath = join(dir, PARTS_DIR, `${part.name}.md`)
      items.push({ entry, part: part.name, targetPath: partPath, action: decide(partPath, part.sourcePath, force) })
    }

    for (const stale of staleParts(dir, listed)) {
      items.push({ entry, part: stale.name, targetPath: stale.path, action: 'prune' })
    }
  }

  return items
}
