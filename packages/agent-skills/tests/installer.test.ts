import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import { discover } from '../src/discover.js'
import { detectLinked } from '../src/linked.js'
import { planInstall, AUTO_GENERATED_BANNER } from '../src/plan.js'
import { applyInstall } from '../src/apply.js'
import { run } from '../src/run.js'
import type { CliArgs } from '../src/args.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const BANNER = AUTO_GENERATED_BANNER

/** Where a skill lands in the target project. */
const skillTarget = (root: string, name: string): string =>
  join(root, '.agents', 'skills', name, 'SKILL.md')

type FixtureCategory = 'package-specific' | 'multi-package' | 'general'

interface FixtureEntry {
  kind: 'skill' | 'instruction'
  name: string
  category?: FixtureCategory
}

const makeFixtureManifest = (
  pkgName: string,
  version: string,
  entries: FixtureEntry[],
  schemaVersion = 2,
) => ({
  schemaVersion,
  package: pkgName,
  version,
  generatedAt: '2026-06-10T00:00:00Z',
  canonicalRepo: 'https://github.com/owlmeans/common',
  entries: entries.map(e => ({
    kind: e.kind,
    name: e.name,
    category: e.category ?? 'package-specific',
    file: e.kind === 'skill'
      ? `skills/${e.name}/SKILL.md`
      : `instructions/${e.name}.instructions.md`,
    // Every entry's canonical home is the Agent Skills store, whatever format the
    // publishing package used for the embedded copy.
    canonicalPath: `.agents/skills/${e.name}/SKILL.md`,
  })),
})

const writeFixturePackage = (
  nmDir: string,
  pkgName: string,
  version: string,
  entries: FixtureEntry[],
  schemaVersion = 2,
): void => {
  const pkgDir = join(nmDir, '@owlmeans', pkgName.replace('@owlmeans/', ''))
  const agentMetaDir = join(pkgDir, 'agent-meta')
  mkdirSync(join(agentMetaDir, 'skills'), { recursive: true })
  mkdirSync(join(agentMetaDir, 'instructions'), { recursive: true })

  const manifest = makeFixtureManifest(pkgName, version, entries, schemaVersion)
  writeFileSync(join(agentMetaDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  for (const e of entries) {
    let content = `${BANNER}\n`
    if (e.kind === 'skill') {
      content += `---\nname: ${e.name}\n---\n# ${e.name}\nSkill content.\n`
      const skillDir = join(agentMetaDir, 'skills', e.name)
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(join(skillDir, 'SKILL.md'), content, 'utf8')
    } else {
      content += `---\ndescription: "${e.name}"\napplyTo: "**/*.ts"\n---\n# ${e.name}\n`
      writeFileSync(join(agentMetaDir, 'instructions', `${e.name}.instructions.md`), content, 'utf8')
    }
  }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tmpDir: string

beforeEach(() => {
  const dir = join(tmpdir(), `agent-skills-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  // Realpath: detectLinked() compares a package's realpath against the target dir, so a
  // symlinked temp root (as on macOS) would otherwise read as a linked monorepo.
  tmpDir = realpathSync(dir)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// discover()
// ---------------------------------------------------------------------------

describe('discover()', () => {
  it('returns empty when no node_modules/@owlmeans exists', () => {
    const entries = discover(tmpDir, { extras: false })
    expect(entries).toEqual([])
  })

  it('discovers skills from node_modules', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('context')
  })

  it('drops instruction entries published by pre-v2 packages', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
      { kind: 'instruction', name: 'context' },
    ], 1)
    const entries = discover(tmpDir, { extras: false })
    expect(entries).toHaveLength(1)
    expect(entries.every(e => e.kind === 'skill')).toBe(true)
  })

  it('deduplicates by name, keeping highest version', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.5', [
      { kind: 'skill', name: 'context' },
    ])
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/auth', '0.1.7', [
      { kind: 'skill', name: 'context' }, // same name, higher version
    ])
    const entries = discover(tmpDir, { extras: false })
    expect(entries).toHaveLength(1)
    expect(entries[0].version).toBe('0.1.7')
  })

  it('--only filter restricts by package name', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/auth', '0.1.7', [
      { kind: 'skill', name: 'auth' },
    ])
    const entries = discover(tmpDir, { extras: false, only: ['@owlmeans/context'] })
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('context')
  })

  it('--only filters by package BEFORE deduping', () => {
    // Both packages ship a skill of the same name; the one NOT named by --only holds
    // the higher version, so a filter applied after dedup would return nothing.
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.18-rc.5', [
      { kind: 'skill', name: 'shared' },
    ])
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/auth', '0.1.18-rc.12', [
      { kind: 'skill', name: 'shared' },
    ])
    const entries = discover(tmpDir, { extras: false, only: ['@owlmeans/context'] })
    expect(entries).toHaveLength(1)
    expect(entries[0].packageName).toBe('@owlmeans/context')
    expect(entries[0].version).toBe('0.1.18-rc.5')
  })

  it('--only accepts a bare package name without the scope', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/auth', '0.1.7', [
      { kind: 'skill', name: 'auth' },
    ])
    const entries = discover(tmpDir, { extras: false, only: ['auth'] })
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('auth')
  })

  it('dedup compares prereleases — the higher rc wins whatever the walk order', () => {
    // The lower rc sits in the alphabetically first package, so a comparison that
    // stopped at major/minor/patch would keep it as the first-seen entry.
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/aaa', '0.1.18-rc.5', [
      { kind: 'skill', name: 'shared' },
    ])
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/zzz', '0.1.18-rc.12', [
      { kind: 'skill', name: 'shared' },
    ])
    const entries = discover(tmpDir, { extras: false })
    expect(entries).toHaveLength(1)
    expect(entries[0].version).toBe('0.1.18-rc.12')
    expect(entries[0].packageName).toBe('@owlmeans/zzz')
  })

  it('dedup keeps the higher rc when it is reached first', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/aaa', '0.1.18-rc.12', [
      { kind: 'skill', name: 'shared' },
    ])
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/zzz', '0.1.18-rc.5', [
      { kind: 'skill', name: 'shared' },
    ])
    const entries = discover(tmpDir, { extras: false })
    expect(entries).toHaveLength(1)
    expect(entries[0].version).toBe('0.1.18-rc.12')
  })

  it('dedup ranks a release above any prerelease of the same version', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/aaa', '0.1.18', [
      { kind: 'skill', name: 'shared' },
    ])
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/zzz', '0.1.18-rc.99', [
      { kind: 'skill', name: 'shared' },
    ])
    const entries = discover(tmpDir, { extras: false })
    expect(entries).toHaveLength(1)
    expect(entries[0].version).toBe('0.1.18')
  })

  it('dedup still ranks a higher patch above any prerelease of a later one', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/aaa', '0.1.19-rc.1', [
      { kind: 'skill', name: 'shared' },
    ])
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/zzz', '0.1.18', [
      { kind: 'skill', name: 'shared' },
    ])
    const entries = discover(tmpDir, { extras: false })
    expect(entries[0].version).toBe('0.1.19-rc.1')
  })

  it('keeps general-category entries', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.18-rc.12', [
      { kind: 'skill', name: 'context', category: 'package-specific' },
      { kind: 'skill', name: 'self-education', category: 'general' },
      { kind: 'skill', name: 'shadcn-web', category: 'multi-package' },
    ])
    const entries = discover(tmpDir, { extras: false })
    expect(entries.map(e => e.name).sort()).toEqual(['context', 'self-education', 'shadcn-web'])
    expect(entries.find(e => e.name === 'self-education')?.category).toBe('general')
  })

  it('discovers the installer\'s own bundled extras when extras are on', () => {
    // Empty project: everything found comes from the installer's own agent-meta/.
    const entries = discover(tmpDir)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every(e => e.isExtra)).toBe(true)
    expect(entries.every(e => e.packageName === '@owlmeans/agent-skills')).toBe(true)
    expect(entries.every(e => e.kind === 'skill')).toBe(true)
    // Bundling is by category: the installer's own package skill plus every general one.
    expect(entries.some(e => e.name === 'agent-skills')).toBe(true)
    expect(entries.some(e => e.category === 'general')).toBe(true)
  })

  it('--no-extras leaves an empty project empty', () => {
    expect(discover(tmpDir, { extras: false })).toEqual([])
  })

  it('a package copy outranks the bundled extra of the same name', () => {
    const bundled = discover(tmpDir)
    const name = bundled[0].name
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '99.0.0', [
      { kind: 'skill', name, category: 'general' },
    ])
    const entries = discover(tmpDir)
    expect(entries.filter(e => e.name === name)).toHaveLength(1)
    expect(entries.find(e => e.name === name)?.packageName).toBe('@owlmeans/context')
  })

  it('discovers entries nested in workspace package node_modules (bun monorepo)', () => {
    // Scaffolded bun workspace: root has no @owlmeans; deps live under sources/*.
    writeFixturePackage(join(tmpDir, 'sources', 'web', 'node_modules'), '@owlmeans/web-panel', '0.1.9', [
      { kind: 'skill', name: 'web-panel' },
    ])
    writeFixturePackage(join(tmpDir, 'sources', 'api', 'node_modules'), '@owlmeans/server-app', '0.1.9', [
      { kind: 'skill', name: 'server-app' },
    ])
    const entries = discover(tmpDir, { extras: false })
    expect(entries.some(e => e.name === 'web-panel')).toBe(true)
    expect(entries.some(e => e.name === 'server-app')).toBe(true)
  })

  it('combines root and nested node_modules', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.9', [
      { kind: 'skill', name: 'context' },
    ])
    writeFixturePackage(join(tmpDir, 'sources', 'web', 'node_modules'), '@owlmeans/web-panel', '0.1.9', [
      { kind: 'skill', name: 'web-panel' },
    ])
    const entries = discover(tmpDir, { extras: false })
    expect(entries.some(e => e.name === 'context')).toBe(true)
    expect(entries.some(e => e.name === 'web-panel')).toBe(true)
  })

  it('does not double-count a package symlinked into multiple workspaces', () => {
    // Physical package under the root store…
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.9', [
      { kind: 'skill', name: 'context' },
    ])
    const realPkg = join(tmpDir, 'node_modules', '@owlmeans', 'context')
    // …symlinked into a workspace's node_modules (as bun's store linker may do).
    const nestedScope = join(tmpDir, 'sources', 'web', 'node_modules', '@owlmeans')
    mkdirSync(nestedScope, { recursive: true })
    symlinkSync(realPkg, join(nestedScope, 'context'))

    const entries = discover(tmpDir, { extras: false })
    expect(entries.filter(e => e.name === 'context')).toHaveLength(1)
  })

  it('ignores hidden directories while walking', () => {
    // A stray manifest under a hidden dir must not be picked up.
    writeFixturePackage(join(tmpDir, '.git', 'node_modules'), '@owlmeans/ghost', '0.1.9', [
      { kind: 'skill', name: 'ghost' },
    ])
    const entries = discover(tmpDir, { extras: false })
    expect(entries.some(e => e.name === 'ghost')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// detectLinked()
// ---------------------------------------------------------------------------

describe('detectLinked()', () => {
  it('returns linked=false when no node_modules', () => {
    const result = detectLinked(tmpDir)
    expect(result.linked).toBe(false)
    expect(result.evidence).toEqual([])
  })

  it('returns linked=false for regular (non-symlinked) packages', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [])
    const result = detectLinked(tmpDir)
    expect(result.linked).toBe(false)
  })

  it('detects symlinked packages', () => {
    const nmScope = join(tmpDir, 'node_modules', '@owlmeans')
    mkdirSync(nmScope, { recursive: true })
    // Create real package elsewhere and symlink it
    const realPkg = join(tmpDir, 'real-pkg')
    mkdirSync(realPkg)
    symlinkSync(realPkg, join(nmScope, 'context'))

    const result = detectLinked(tmpDir)
    expect(result.linked).toBe(true)
    expect(result.evidence).toContain('@owlmeans/context')
  })
})

// ---------------------------------------------------------------------------
// planInstall()
// ---------------------------------------------------------------------------

describe('planInstall()', () => {
  it('targets .agents/skills and marks missing targets as install', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    const items = planInstall(entries, tmpDir)
    expect(items).toHaveLength(1)
    expect(items[0].action).toBe('install')
    expect(items[0].targetPath).toBe(skillTarget(tmpDir, 'context'))
  })

  it('marks identical files as skip-uptodate', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    // Write same content to target
    const targetDir = join(tmpDir, '.agents', 'skills', 'context')
    mkdirSync(targetDir, { recursive: true })
    const source = readFileSync(entries[0].sourcePath, 'utf8')
    writeFileSync(join(targetDir, 'SKILL.md'), source, 'utf8')

    const items = planInstall(entries, tmpDir)
    expect(items[0].action).toBe('skip-uptodate')
  })

  it('marks managed (banner) changed files as update', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    const targetDir = join(tmpDir, '.agents', 'skills', 'context')
    mkdirSync(targetDir, { recursive: true })
    // Write old managed content (has banner, but different)
    writeFileSync(join(targetDir, 'SKILL.md'), `${BANNER}\n# Old content\n`, 'utf8')

    const items = planInstall(entries, tmpDir)
    expect(items[0].action).toBe('update')
  })

  it('marks locally-edited (no banner) files as conflict', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    const targetDir = join(tmpDir, '.agents', 'skills', 'context')
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(join(targetDir, 'SKILL.md'), '# My custom skill\n', 'utf8')

    const items = planInstall(entries, tmpDir)
    expect(items[0].action).toBe('conflict')
  })

  it('--force upgrades conflict to update', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    const targetDir = join(tmpDir, '.agents', 'skills', 'context')
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(join(targetDir, 'SKILL.md'), '# My custom skill\n', 'utf8')

    const items = planInstall(entries, tmpDir, { force: true })
    expect(items[0].action).toBe('update')
  })
})

// ---------------------------------------------------------------------------
// applyInstall() — idempotency and the Claude Code bridge
// ---------------------------------------------------------------------------

describe('applyInstall()', () => {
  it('writes install items into .agents/skills', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    const items = planInstall(entries, tmpDir)
    const result = applyInstall(items)
    expect(result.installed).toBe(1)
    expect(existsSync(skillTarget(tmpDir, 'context'))).toBe(true)
  })

  it('is idempotent — second run yields all skip-uptodate', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    // First run
    applyInstall(planInstall(entries, tmpDir))
    // Second run
    const items2 = planInstall(entries, tmpDir)
    expect(items2[0].action).toBe('skip-uptodate')
    const result2 = applyInstall(items2)
    expect(result2.installed).toBe(0)
    expect(result2.skipped).toBe(1)
  })

  it('does not write conflict items', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    const targetDir = join(tmpDir, '.agents', 'skills', 'context')
    mkdirSync(targetDir, { recursive: true })
    const localContent = '# My custom skill\n'
    writeFileSync(join(targetDir, 'SKILL.md'), localContent, 'utf8')

    const items = planInstall(entries, tmpDir)
    applyInstall(items)
    // File should remain unchanged
    expect(readFileSync(join(targetDir, 'SKILL.md'), 'utf8')).toBe(localContent)
  })

  it('symlinks installed skills into .claude/skills when the project uses Claude Code', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    mkdirSync(join(tmpDir, '.claude'), { recursive: true })
    const entries = discover(tmpDir, { extras: false })
    const result = applyInstall(planInstall(entries, tmpDir), tmpDir)

    const link = join(tmpDir, '.claude', 'skills', 'context')
    expect(result.linked).toBe(1)
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readlinkSync(link)).toBe(join('..', '..', '.agents', 'skills', 'context'))
  })

  it('leaves a project without .claude/ untouched', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    const result = applyInstall(planInstall(entries, tmpDir), tmpDir)
    expect(result.linked).toBe(0)
    expect(existsSync(join(tmpDir, '.claude'))).toBe(false)
  })

  it('symlinks a conflicted skill too, without writing to it', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    mkdirSync(join(tmpDir, '.claude'), { recursive: true })
    const local = '# My custom skill\n'
    mkdirSync(dirname(skillTarget(tmpDir, 'context')), { recursive: true })
    writeFileSync(skillTarget(tmpDir, 'context'), local, 'utf8')

    const entries = discover(tmpDir, { extras: false })
    const items = planInstall(entries, tmpDir)
    expect(items[0].action).toBe('conflict')

    const result = applyInstall(items, tmpDir)
    expect(result.conflicts).toBe(1)
    // The local edit survives…
    expect(readFileSync(skillTarget(tmpDir, 'context'), 'utf8')).toBe(local)
    // …and Claude Code still sees the skill the project already has.
    expect(result.linked).toBe(1)
    expect(lstatSync(join(tmpDir, '.claude', 'skills', 'context')).isSymbolicLink()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// run() — the non-TTY conflict path
// ---------------------------------------------------------------------------

const cliArgs = (over: Partial<CliArgs> = {}): CliArgs => ({
  dir: tmpDir,
  yes: false,
  only: [],
  extras: false,
  force: false,
  dryRun: false,
  help: false,
  ...over,
})

/** Run the installer with stdin forced non-TTY, capturing its output. */
const runNonTty = async (args: CliArgs): Promise<{ code: number, out: string, err: string }> => {
  const tty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
  const stdout = process.stdout.write
  const stderr = process.stderr.write
  let out = ''
  let err = ''
  const text = (chunk: string | Uint8Array): string =>
    typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')

  Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    out += text(chunk)
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    err += text(chunk)
    return true
  }) as typeof process.stderr.write

  try {
    const result = await run(args)
    return { code: result.code, out, err }
  } finally {
    process.stdout.write = stdout
    process.stderr.write = stderr
    if (tty != null) Object.defineProperty(process.stdin, 'isTTY', tty)
    else Reflect.deleteProperty(process.stdin, 'isTTY')
  }
}

describe('run() — non-TTY with conflicts', () => {
  it('installs every clean skill and still reports the unresolved conflict', async () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.18-rc.12', [
      { kind: 'skill', name: 'context' },
      { kind: 'skill', name: 'router-plugins' },
      { kind: 'skill', name: 'reuse-code' },
    ])
    // One skill was hand-edited locally — the only conflict in the plan.
    const edited = skillTarget(tmpDir, 'context')
    mkdirSync(dirname(edited), { recursive: true })
    const local = '# My own context notes\n'
    writeFileSync(edited, local, 'utf8')

    const { code, out } = await runNonTty(cliArgs())

    // The conflict is reported and the run fails…
    expect(code).toBe(5)
    expect(out).toContain('CONFLICT')
    expect(out).toContain(edited)
    expect(readFileSync(edited, 'utf8')).toBe(local)
    // …but one hand-edited file no longer costs the whole installation.
    expect(existsSync(skillTarget(tmpDir, 'router-plugins'))).toBe(true)
    expect(existsSync(skillTarget(tmpDir, 'reuse-code'))).toBe(true)
    expect(out).toContain('2 installed')
  })

  it('--force overwrites the local edit and succeeds', async () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.18-rc.12', [
      { kind: 'skill', name: 'context' },
    ])
    const edited = skillTarget(tmpDir, 'context')
    mkdirSync(dirname(edited), { recursive: true })
    writeFileSync(edited, '# My own context notes\n', 'utf8')

    const { code } = await runNonTty(cliArgs({ force: true }))
    expect(code).toBe(0)
    expect(readFileSync(edited, 'utf8')).toContain(BANNER)
  })

  it('--yes accepts the leftover conflicts and succeeds', async () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.18-rc.12', [
      { kind: 'skill', name: 'context' },
      { kind: 'skill', name: 'reuse-code' },
    ])
    const edited = skillTarget(tmpDir, 'context')
    mkdirSync(dirname(edited), { recursive: true })
    const local = '# My own context notes\n'
    writeFileSync(edited, local, 'utf8')

    const { code } = await runNonTty(cliArgs({ yes: true }))
    expect(code).toBe(0)
    expect(readFileSync(edited, 'utf8')).toBe(local)
    expect(existsSync(skillTarget(tmpDir, 'reuse-code'))).toBe(true)
  })

  it('a dry run writes nothing', async () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.18-rc.12', [
      { kind: 'skill', name: 'context' },
    ])
    const { code } = await runNonTty(cliArgs({ dryRun: true }))
    expect(code).toBe(0)
    expect(existsSync(skillTarget(tmpDir, 'context'))).toBe(false)
  })

  it('reports exit 3 when nothing is found', async () => {
    const { code } = await runNonTty(cliArgs())
    expect(code).toBe(3)
  })

  it('refuses a linked monorepo with exit 4', async () => {
    const nmScope = join(tmpDir, 'node_modules', '@owlmeans')
    mkdirSync(nmScope, { recursive: true })
    const realPkg = join(tmpDir, 'real-pkg')
    mkdirSync(realPkg)
    symlinkSync(realPkg, join(nmScope, 'context'))

    const { code, err } = await runNonTty(cliArgs())
    expect(code).toBe(4)
    expect(err).toContain('linked monorepo detected')
  })
})
