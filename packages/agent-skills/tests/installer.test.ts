import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { discover } from '../src/discover.js'
import { detectLinked } from '../src/linked.js'
import { planInstall } from '../src/plan.js'
import { AUTO_GENERATED_BANNER } from '../src/consts.js'
import { applyInstall } from '../src/apply.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const BANNER = AUTO_GENERATED_BANNER

/** Where a skill lands in the target project. */
const skillTarget = (root: string, name: string): string =>
  join(root, '.agents', 'skills', name, 'SKILL.md')

const makeFixtureManifest = (pkgName: string, version: string, entries: Array<{
  kind: 'skill' | 'instruction'
  name: string
  category?: 'package-specific' | 'multi-package'
}>, schemaVersion = 2) => ({
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
    canonicalPath: e.kind === 'skill'
      ? `.agents/skills/${e.name}/SKILL.md`
      : `.github/instructions/${e.name}.instructions.md`,
  })),
})

const writeFixturePackage = (
  nmDir: string,
  pkgName: string,
  version: string,
  entries: Array<{ kind: 'skill' | 'instruction'; name: string }>,
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
  tmpDir = join(tmpdir(), `agent-skills-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
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
})

// ---------------------------------------------------------------------------
// Chunked skills — parts (manifest schemaVersion 3)
// ---------------------------------------------------------------------------

/** A v3 package whose one skill carries parts; `manifestParts` overrides what the manifest lists. */
const writeSplitPackage = (
  nmDir: string,
  pkgName: string,
  version: string,
  name: string,
  parts: string[],
  opts: { schemaVersion?: number; manifestParts?: Array<Record<string, unknown>> } = {},
): void => {
  const agentMetaDir = join(nmDir, '@owlmeans', pkgName.replace('@owlmeans/', ''), 'agent-meta')
  const skillDir = join(agentMetaDir, 'skills', name)
  mkdirSync(join(skillDir, 'parts'), { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), `---\nname: ${name}\n---\n${BANNER}\n# ${name}\n`, 'utf8')
  for (const part of parts) {
    writeFileSync(join(skillDir, 'parts', `${part}.md`), `---\nname: ${part}\n---\n${BANNER}\n# ${part}\n`, 'utf8')
  }
  const manifest = makeFixtureManifest(pkgName, version, [{ kind: 'skill', name }], opts.schemaVersion ?? 3)
  ;(manifest.entries[0] as Record<string, unknown>).parts = opts.manifestParts ?? parts.map(part => ({
    name: part,
    file: `skills/${name}/parts/${part}.md`,
    description: `The ${part} part.`,
    purposes: ['view'],
    mentions: [`${part}Widget`],
  }))
  writeFileSync(join(agentMetaDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
}

const partTarget = (root: string, name: string, part: string): string =>
  join(root, '.agents', 'skills', name, 'parts', `${part}.md`)

describe('parts — discover()', () => {
  it('maps the parts a v3 manifest lists, with their purposes and mentions', () => {
    writeSplitPackage(join(tmpDir, 'node_modules'), '@owlmeans/web-panel', '0.2.0', 'web-panel', ['navigation', 'picker'])
    const [entry] = discover(tmpDir, { extras: false })
    expect(entry.parts?.map(part => part.name)).toEqual(['navigation', 'picker'])
    expect(entry.parts?.[0].purposes).toEqual(['view'])
    expect(entry.parts?.[0].mentions).toEqual(['navigationWidget'])
    expect(entry.parts?.[0].sourcePath.endsWith(join('skills', 'web-panel', 'parts', 'navigation.md'))).toBe(true)
  })

  it('rejects a bad part name and a file outside skills/<name>/parts/', () => {
    writeSplitPackage(join(tmpDir, 'node_modules'), '@owlmeans/web-panel', '0.2.0', 'web-panel', ['good'], {
      manifestParts: [
        { name: 'good', file: 'skills/web-panel/parts/good.md', description: '', purposes: [], mentions: [] },
        { name: '../evil', file: 'skills/web-panel/parts/../evil.md', description: '', purposes: [], mentions: [] },
        { name: 'elsewhere', file: 'skills/other/parts/elsewhere.md', description: '', purposes: [], mentions: [] },
        { name: 'flat', file: 'skills/web-panel/flat.md', description: '', purposes: [], mentions: [] },
        { name: 'missing', file: 'skills/web-panel/parts/missing.md', description: '', purposes: [], mentions: [] },
      ],
    })
    const [entry] = discover(tmpDir, { extras: false })
    expect(entry.parts?.map(part => part.name)).toEqual(['good'])
  })

  it('a pre-v3 manifest gives the core only', () => {
    writeSplitPackage(join(tmpDir, 'node_modules'), '@owlmeans/web-panel', '0.2.0', 'web-panel', ['navigation'], { schemaVersion: 2 })
    const [entry] = discover(tmpDir, { extras: false })
    expect(entry.parts).toBeUndefined()
  })
})

describe('parts — planInstall() / applyInstall()', () => {
  it('plans one item per part beside the skill and installs them', () => {
    writeSplitPackage(join(tmpDir, 'node_modules'), '@owlmeans/web-panel', '0.2.0', 'web-panel', ['navigation', 'picker'])
    mkdirSync(join(tmpDir, '.claude'), { recursive: true })
    const items = planInstall(discover(tmpDir, { extras: false }), tmpDir)
    expect(items.map(item => [item.part ?? null, item.action])).toEqual([
      [null, 'install'], ['navigation', 'install'], ['picker', 'install'],
    ])
    expect(items[1].targetPath).toBe(partTarget(tmpDir, 'web-panel', 'navigation'))

    const result = applyInstall(items, tmpDir)
    expect(result.installed).toBe(3)
    expect(result.linked).toBe(1)
    expect(readFileSync(partTarget(tmpDir, 'web-panel', 'picker'), 'utf8')).toContain('# picker')
    expect(planInstall(discover(tmpDir, { extras: false }), tmpDir).every(item => item.action === 'skip-uptodate')).toBe(true)
  })

  it('a part follows the banner and conflict rules of its skill', () => {
    writeSplitPackage(join(tmpDir, 'node_modules'), '@owlmeans/web-panel', '0.2.0', 'web-panel', ['navigation', 'picker'])
    applyInstall(planInstall(discover(tmpDir, { extras: false }), tmpDir))
    writeFileSync(partTarget(tmpDir, 'web-panel', 'navigation'), '# my own navigation notes\n', 'utf8')
    writeFileSync(partTarget(tmpDir, 'web-panel', 'picker'), `${BANNER}\n# an older picker\n`, 'utf8')

    const items = planInstall(discover(tmpDir, { extras: false }), tmpDir)
    const action = (part: string) => items.find(item => item.part === part)?.action
    expect(action('navigation')).toBe('conflict')
    expect(action('picker')).toBe('update')

    applyInstall(items)
    expect(readFileSync(partTarget(tmpDir, 'web-panel', 'navigation'), 'utf8')).toBe('# my own navigation notes\n')
    const forced = planInstall(discover(tmpDir, { extras: false }), tmpDir, { force: true })
    expect(forced.find(item => item.part === 'navigation')?.action).toBe('update')
  })

  it('prunes a generated part the skill no longer lists, never a hand-written one', () => {
    const nm = join(tmpDir, 'node_modules')
    writeSplitPackage(nm, '@owlmeans/web-panel', '0.2.0', 'web-panel', ['navigation', 'picker'])
    applyInstall(planInstall(discover(tmpDir, { extras: false }), tmpDir))
    writeFileSync(partTarget(tmpDir, 'web-panel', 'mine'), '# hand-written\n', 'utf8')

    rmSync(join(nm, '@owlmeans'), { recursive: true, force: true })
    writeSplitPackage(nm, '@owlmeans/web-panel', '0.2.1', 'web-panel', ['navigation'])
    const items = planInstall(discover(tmpDir, { extras: false }), tmpDir)
    expect(items.filter(item => item.action === 'prune').map(item => item.part)).toEqual(['picker'])

    const result = applyInstall(items, tmpDir)
    expect(result.pruned).toBe(1)
    expect(existsSync(partTarget(tmpDir, 'web-panel', 'picker'))).toBe(false)
    expect(existsSync(partTarget(tmpDir, 'web-panel', 'mine'))).toBe(true)
    expect(existsSync(partTarget(tmpDir, 'web-panel', 'navigation'))).toBe(true)
  })

  it('removes the parts directory once its last generated part is pruned', () => {
    const nm = join(tmpDir, 'node_modules')
    writeSplitPackage(nm, '@owlmeans/web-panel', '0.2.0', 'web-panel', ['navigation'])
    applyInstall(planInstall(discover(tmpDir, { extras: false }), tmpDir))
    rmSync(join(nm, '@owlmeans'), { recursive: true, force: true })
    writeFixturePackage(nm, '@owlmeans/web-panel', '0.2.1', [{ kind: 'skill', name: 'web-panel' }])

    applyInstall(planInstall(discover(tmpDir, { extras: false }), tmpDir))
    expect(existsSync(join(tmpDir, '.agents', 'skills', 'web-panel', 'parts'))).toBe(false)
    expect(existsSync(skillTarget(tmpDir, 'web-panel'))).toBe(true)
  })
})
