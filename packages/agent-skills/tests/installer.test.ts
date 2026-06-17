import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { discover } from '../src/discover.js'
import { detectLinked } from '../src/linked.js'
import { planInstall, AUTO_GENERATED_BANNER } from '../src/plan.js'
import { applyInstall } from '../src/apply.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const BANNER = AUTO_GENERATED_BANNER

const makeFixtureManifest = (pkgName: string, version: string, entries: Array<{
  kind: 'skill' | 'instruction'
  name: string
  category?: 'package-specific' | 'multi-package'
}>) => ({
  schemaVersion: 1,
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
      ? `.claude/skills/${e.name}/SKILL.md`
      : `.github/instructions/${e.name}.instructions.md`,
  })),
})

const writeFixturePackage = (
  nmDir: string,
  pkgName: string,
  version: string,
  entries: Array<{ kind: 'skill' | 'instruction'; name: string }>,
): void => {
  const pkgDir = join(nmDir, '@owlmeans', pkgName.replace('@owlmeans/', ''))
  const agentMetaDir = join(pkgDir, 'agent-meta')
  mkdirSync(join(agentMetaDir, 'skills'), { recursive: true })
  mkdirSync(join(agentMetaDir, 'instructions'), { recursive: true })

  const manifest = makeFixtureManifest(pkgName, version, entries)
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

  it('discovers entries from node_modules', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
      { kind: 'instruction', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    expect(entries).toHaveLength(2)
    expect(entries.some(e => e.kind === 'skill' && e.name === 'context')).toBe(true)
    expect(entries.some(e => e.kind === 'instruction' && e.name === 'context')).toBe(true)
  })

  it('deduplicates by (kind, name), keeping highest version', () => {
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

  it('--claude-only filter', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
      { kind: 'instruction', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false, claudeOnly: true })
    expect(entries.every(e => e.kind === 'skill')).toBe(true)
  })

  it('--copilot-only filter', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
      { kind: 'instruction', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false, copilotOnly: true })
    expect(entries.every(e => e.kind === 'instruction')).toBe(true)
  })

  it('discovers entries nested in workspace package node_modules (bun monorepo)', () => {
    // Scaffolded bun workspace: root has no @owlmeans; deps live under sources/*.
    writeFixturePackage(join(tmpDir, 'sources', 'web', 'node_modules'), '@owlmeans/web-panel', '0.1.9', [
      { kind: 'skill', name: 'web-panel' },
      { kind: 'instruction', name: 'web-panel' },
    ])
    writeFixturePackage(join(tmpDir, 'sources', 'api', 'node_modules'), '@owlmeans/server-app', '0.1.9', [
      { kind: 'skill', name: 'server-app' },
    ])
    const entries = discover(tmpDir, { extras: false })
    expect(entries.some(e => e.kind === 'skill' && e.name === 'web-panel')).toBe(true)
    expect(entries.some(e => e.kind === 'instruction' && e.name === 'web-panel')).toBe(true)
    expect(entries.some(e => e.kind === 'skill' && e.name === 'server-app')).toBe(true)
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
  it('marks missing targets as install', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    const items = planInstall(entries, tmpDir)
    expect(items).toHaveLength(1)
    expect(items[0].action).toBe('install')
  })

  it('marks identical files as skip-uptodate', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    // Write same content to target
    const targetDir = join(tmpDir, '.claude', 'skills', 'context')
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
    const targetDir = join(tmpDir, '.claude', 'skills', 'context')
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
    const targetDir = join(tmpDir, '.claude', 'skills', 'context')
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
    const targetDir = join(tmpDir, '.claude', 'skills', 'context')
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(join(targetDir, 'SKILL.md'), '# My custom skill\n', 'utf8')

    const items = planInstall(entries, tmpDir, { force: true })
    expect(items[0].action).toBe('update')
  })
})

// ---------------------------------------------------------------------------
// applyInstall() — idempotency
// ---------------------------------------------------------------------------

describe('applyInstall()', () => {
  it('writes install items', () => {
    writeFixturePackage(join(tmpDir, 'node_modules'), '@owlmeans/context', '0.1.7', [
      { kind: 'skill', name: 'context' },
      { kind: 'instruction', name: 'context' },
    ])
    const entries = discover(tmpDir, { extras: false })
    const items = planInstall(entries, tmpDir)
    const result = applyInstall(items)
    expect(result.installed).toBe(2)
    expect(existsSync(join(tmpDir, '.claude', 'skills', 'context', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(tmpDir, '.github', 'instructions', 'context.instructions.md'))).toBe(true)
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
    const targetDir = join(tmpDir, '.claude', 'skills', 'context')
    mkdirSync(targetDir, { recursive: true })
    const localContent = '# My custom skill\n'
    writeFileSync(join(targetDir, 'SKILL.md'), localContent, 'utf8')

    const items = planInstall(entries, tmpDir)
    applyInstall(items)
    // File should remain unchanged
    expect(readFileSync(join(targetDir, 'SKILL.md'), 'utf8')).toBe(localContent)
  })
})
