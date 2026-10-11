#!/usr/bin/env bun
/**
 * Release entry point for the OwlMeans Common monorepo — a thin shim over the shared release
 * tooling in the library-manager workspace.
 *
 * The change detection, dependent closure, prerelease bumping and range realignment that used to
 * live here now live in `library-manager/scripts/lib/release-engine.ts`, driven by
 * `library-manager/scripts/publish.ts`. Keeping a second copy here meant two harnesses could
 * disagree about what "changed" means for the same repo, so this file only translates the old
 * flags and delegates. Run `publish.ts` directly if you are already in the library-manager tree.
 *
 * The one thing it still does itself is the canonical **Install:** sweep, which is a property of
 * this repo's skills rather than of releasing in general.
 *
 * Usage (unchanged):
 *   bun .agents/skills/publishing/scripts/release.ts                  # plan only (default)
 *   bun .agents/skills/publishing/scripts/release.ts --apply          # write versions + ranges
 *   bun .agents/skills/publishing/scripts/release.ts --publish --confirm
 *
 * Options that still map through: --tag, --all, --filter, --concurrency, --otp, --force.
 * `--baseline`, `--set`, `--only` and `--json` are gone: the engine compares against the version
 * each package declares and derives the next one, so there is nothing left for them to select.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '../../../..')
const PROJECT = path.basename(ROOT)

/** Where the shared tooling lives relative to this monorepo, primary checkout or vslot alike. */
const resolveLibraryManager = (): string | null => {
  for (const candidate of [
    path.resolve(ROOT, '../library-manager'),
    path.resolve(ROOT, '../../library-manager'),
  ]) {
    if (existsSync(path.join(candidate, 'scripts', 'publish.ts'))) {
      return candidate
    }
  }
  return null
}

const argv = process.argv.slice(2)
const has = (flag: string): boolean => argv.includes(flag)
const value = (flag: string): string | undefined => {
  const idx = argv.indexOf(flag)
  return idx >= 0 ? argv[idx + 1] : undefined
}

const publish = has('--publish')
const apply = has('--apply') || publish

if (publish && !has('--confirm')) {
  console.error('Refusing to publish without --confirm. Publishing is irreversible and public;')
  console.error('the operator has to agree to it explicitly, every time. Nothing was written.')
  process.exit(1)
}

for (const dropped of ['--baseline', '--set', '--only', '--json']) {
  if (has(dropped)) {
    console.error(`${dropped} is no longer supported. The engine compares each package against the`)
    console.error('version it declares and derives the next one; say what to ship with --filter.')
    process.exit(1)
  }
}

const forwarded = ['--project', PROJECT]
forwarded.push(has('--all') ? '--all' : '--changed')
if (apply && !publish) forwarded.push('--bump', 'rc')
if (!apply) forwarded.push('--dry-run')
for (const passthrough of ['--tag', '--filter', '--concurrency', '--otp']) {
  const given = value(passthrough)
  if (given != null) forwarded.push(passthrough, given)
}
if (has('--force')) forwarded.push('--force')

const libraryManager = resolveLibraryManager()

if (libraryManager == null) {
  console.error('Could not find the library-manager workspace next to this repo.')
  console.error('Clone it alongside this monorepo and run the release from there:')
  console.error('')
  console.error(`  bun run scripts/publish.ts ${forwarded.join(' ')}`)
  console.error('')
  process.exit(1)
}

/**
 * Every package-specific skill opens with an `**Install:**` line naming its package and a caret
 * range. Those lines are hand-written prose, so nothing bumps them and they rot to whatever
 * version the skill was authored against — while the embedded copies under packages/*\/agent-meta
 * are regenerated with the current version and silently disagree with the canonical text they
 * came from. Reconciling on every apply makes the stated rule true by construction: an Install
 * line always carries the named package's CURRENT version. Deliberately a full sweep rather than
 * only the bumped set, so a line that rotted earlier is repaired by the next release.
 */
const reconcileInstallLines = (): number => {
  const versionOf = new Map<string, string>()
  const packagesDir = path.join(ROOT, 'packages')
  if (existsSync(packagesDir)) {
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
      const manifestPath = path.join(packagesDir, entry.name, 'package.json')
      if (!entry.isDirectory() || !existsSync(manifestPath)) continue
      const json = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>
      if (json.name != null && json.version != null) versionOf.set(json.name, json.version)
    }
  }

  const skillsDir = path.join(ROOT, '.agents', 'skills')
  if (!existsSync(skillsDir)) return 0
  let reconciled = 0
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md')
    if (!entry.isDirectory() || !existsSync(skillPath)) continue
    const raw = readFileSync(skillPath, 'utf8')
    // Every pin on the line, not the first: an Install line may name a package and its driver,
    // and reconciling only the leading one leaves the rest to rot invisibly.
    const updated = raw.replace(/^\*\*Install:\*\*.*$/gm, line =>
      line.replace(/"(@owlmeans\/[a-z0-9-]+)":\s*"[^"]*"/g, (pin, name: string) => {
        const current = versionOf.get(name)
        return current == null ? pin : `"${name}": "^${current}"`
      }))
    if (updated !== raw) {
      writeFileSync(skillPath, updated)
      reconciled += 1
    }
  }
  return reconciled
}

console.log(`Delegating to ${path.join(libraryManager, 'scripts/publish.ts')}`)
console.log(`  bun run scripts/publish.ts ${forwarded.join(' ')}`)
console.log('')

const result = spawnSync('bun', ['run', 'scripts/publish.ts', ...forwarded], {
  cwd: libraryManager,
  stdio: 'inherit',
})

// Also after a publish run, not only after an --apply: a line that rotted during an earlier
// release is repaired by the next one either way, and a released version is exactly when the
// canonical text has to be true. The general form — every repo, plus the install COMMANDS in
// READMEs and skills — is `bump-deps.ts --pins-only --fix` in the library-manager harness, which
// `publish.ts` refuses to release without (exit 12).
if (result.status === 0 && apply) {
  const reconciled = reconcileInstallLines()
  if (reconciled > 0) {
    console.log(`\nReconciled the Install line in ${reconciled} skill(s) with current package versions.`)
    console.log('Re-run the agent-meta sync so the embedded copies follow.')
  }
}

process.exit(result.status ?? 1)
