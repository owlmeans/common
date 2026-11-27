import { describe, expect, test } from 'bun:test'
import { ProjectArea } from '../src/areas/consts.js'
import type { AreaDescriptor } from '../src/areas/types.js'
import { IntegrityRule, TARGET_PACKAGES_DIR, TargetLayout, TargetPackage } from '../src/integrity/consts.js'
import { TARGET_BUILD_SCRIPTS, TARGET_ENTRY_MARKERS, TARGET_INTEGRITY_FILES, TARGET_PROTECTED_FILES } from '../src/integrity/layout/consts.js'
import { targetLayoutHelper } from '../src/integrity/layout.js'
import type { TargetFileMap, TargetIntegrityReport } from '../src/integrity/types.js'
import { targetIntegrityHelper } from '../src/integrity/verify.js'
import { TOPOLOGY_FILE } from '../src/metadata/consts.js'
import { topologyCardHelper } from '../src/topology/card.js'
import { DEFAULT_TOPOLOGY } from '../src/topology/consts.js'
import { projectStructureHelper as structureHelper } from '../src/topology/structure.js'
import { StructurePartKind as Kind } from '../src/topology/structure/consts.js'
import type { ProjectStructure, StructurePart } from '../src/topology/structure/types.js'
import type { TargetPackageDescriptor, TopologyMeta } from '../src/topology/types.js'
import { SubProject as SubProjectRole } from '../src/slot/consts.js'

/**
 * A topology record carrying a STRUCTURE — what the platform stages a project of parts from — makes
 * the tree verified against it, strictly: every part's packages under the rules of their kind (a
 * library part's as a core library's, an api, web or worker part's as main's), the block itself to
 * `structure-map`, each part's `workspace:` siblings to `part-dependency`, and the workspace to the
 * record (`workspace-package`).
 *
 * The tree is synthetic: what the stager would write for `projectStructureHelper.topologyOf` — every
 * file the V2 manifest reads under each package the record names, `workspace:^` siblings from the
 * record's own edges.
 */
const SLUG = 'shop'
const CORE: string[] = Object.values(TargetPackage)
const ALL = [ProjectArea.User, ProjectArea.Admin, ProjectArea.Operator]
const partner: AreaDescriptor = { key: 'partner', kind: ProjectArea.User, segment: 'partner' }

const part = (patch: Partial<StructurePart> & Pick<StructurePart, 'name' | 'kind'>): StructurePart => ({
  dependsOn: [], purpose: `The ${patch.name} part.`, ...patch,
})

/** Every kind once: a library, a shared library, an api, a web calling main, an extra worker — over today's split. */
const custom = (): ProjectStructure => {
  const base = structureHelper.defaultFor(ALL)

  return {
    areas: [...base.areas, partner],
    parts: [
      ...base.parts,
      part({ name: 'dates', kind: Kind.Library, dependsOn: ['common'] }),
      part({ name: 'billing', kind: Kind.Shared, dependsOn: ['common', 'dates'] }),
      part({ name: 'hooks', kind: Kind.Api, dependsOn: ['common', 'backend', 'billing'], mount: 'hooks' }),
      part({ name: 'portal', kind: Kind.Web, dependsOn: ['common', 'dates', 'main'], mount: 'portal', areas: ['partner'] }),
      part({ name: 'mailer', kind: Kind.Worker, dependsOn: ['common', 'backend'], queues: ['mail'] }),
    ],
  }
}

/** The core package whose rules a recorded package is staged from. */
const rulesOf = (pkg: TargetPackageDescriptor): string | null => {
  if (CORE.includes(pkg.name)) return pkg.name
  if (pkg.kind === 'library') return null
  if (pkg.name.endsWith('-worker')) return TargetPackage.Worker
  return pkg.name.endsWith('-web') ? TargetPackage.Web : TargetPackage.Api
}

const manifestOf = (pkg: TargetPackageDescriptor, rules: string | null): string => JSON.stringify({
  name: targetLayoutHelper.targetPackageName(SLUG, pkg.name),
  type: 'module',
  scripts: { build: rules == null ? 'tsc -b' : TARGET_BUILD_SCRIPTS[rules], dev: 'nodemon' },
  dependencies: {
    ...Object.fromEntries((rules == null ? [] : targetLayoutHelper.targetManifest(TargetLayout.V2).requiredDeps[rules] ?? [])
      .map(dep => [dep, '^1.0.0'])),
    ...Object.fromEntries(pkg.dependsOn.map(dep => [targetLayoutHelper.targetPackageName(SLUG, dep), 'workspace:^'])),
  },
})

/** One package's files: a library part's three, or a core package's manifest list and markers re-rooted. */
const packageFiles = (pkg: TargetPackageDescriptor): TargetFileMap => {
  const rules = rulesOf(pkg)
  const dir = `${TARGET_PACKAGES_DIR}/${pkg.name}`
  if (rules == null) {
    return { [`${dir}/package.json`]: manifestOf(pkg, null), [`${dir}/tsconfig.json`]: '{}', [`${dir}/src/index.ts`]: 'export {}' }
  }
  const prefix = `${TARGET_PACKAGES_DIR}/${rules}/`
  const files: TargetFileMap = {}
  for (const path of targetLayoutHelper.targetManifest(TargetLayout.V2).files) {
    if (!path.startsWith(prefix)) continue
    const rel = path.slice(prefix.length)
    files[`${dir}/${rel}`] = rel === 'package.json' ? manifestOf(pkg, rules)
      : rel === 'tsconfig.json' ? '{}'
        : (TARGET_ENTRY_MARKERS[path] ?? ['export {}']).join('\n')
  }

  return files
}

const recordOf = (meta: unknown): string => `---\n${JSON.stringify(meta)}\n---\n\n# Topology\n`

interface Staged {
  files: TargetFileMap
  meta: TopologyMeta
  dirs: string[]
}

/** The tree the stager writes for a structure: the record, and every package it names. */
const stagedTree = (structure: ProjectStructure = custom()): Staged => {
  const topology = structureHelper.topologyOf(structure, DEFAULT_TOPOLOGY)
  const meta = topologyCardHelper.topologyMeta(topology)
  const files: TargetFileMap = Object.fromEntries(TARGET_INTEGRITY_FILES.map(path => [path, null]))
  files['package.json'] = JSON.stringify({ name: SLUG, type: 'module', workspaces: [`${TARGET_PACKAGES_DIR}/*`] })
  files['bunfig.toml'] = '[install]\nlinker = "hoisted"\n'
  for (const pkg of topology.packages) Object.assign(files, packageFiles(pkg))
  files[TOPOLOGY_FILE] = recordOf(meta)

  return { files, meta, dirs: topology.packages.map(pkg => pkg.name) }
}

/** The staged tree with its record's frontmatter changed. */
const withRecord = (mutate: (meta: TopologyMeta & Record<string, unknown>) => void, staged = stagedTree()): Staged => {
  const meta = JSON.parse(JSON.stringify(staged.meta)) as TopologyMeta & Record<string, unknown>
  mutate(meta)

  return { ...staged, files: { ...staged.files, [TOPOLOGY_FILE]: recordOf(meta) }, meta }
}

const verify = (staged: Staged, extra: string[] = []): TargetIntegrityReport =>
  targetIntegrityHelper.verifyTargetShape(staged.files, { workspaceDirs: [...staged.dirs, ...extra] })

const lines = (report: TargetIntegrityReport): string[] => report.violations.map(v => `${v.rule} ${v.path}: ${v.detail}`)
const ruleLines = (report: TargetIntegrityReport, rule: IntegrityRule): string[] =>
  report.violations.filter(v => v.rule === rule).map(v => v.detail)
const partOf = (meta: TopologyMeta, name: string) => meta.structure!.parts.find(one => one.name === name)!

describe('viable-common - integrity, a tree staged from a structure', () => {
  test('a tree with every kind of part verifies clean, read in two passes', async () => {
    const staged = stagedTree()
    const plan = targetIntegrityHelper.readPlan(staged.files)
    expect(plan.listWorkspace).toBe(true)
    for (const path of [
      'sources/dates/package.json', 'sources/dates/tsconfig.json', 'sources/dates/src/index.ts', 'sources/billing/src/index.ts',
      'sources/hooks-api/src/owlmeans.ts', 'sources/portal-web/src/index.tsx', 'sources/mailer-worker/rollup.config.js',
      'sources/admin-web/src/index.tsx',
    ]) expect(plan.extraFiles).toContain(path)

    const collected = await targetIntegrityHelper.collectTargetFiles(
      async path => staged.files[path] ?? null, async () => staged.dirs,
    )
    expect(lines(targetIntegrityHelper.verifyTargetShape(collected.files, collected))).toEqual([])
  })

  test('a structure holds the workspace to the record, like a split', () => {
    const staged = stagedTree()
    staged.files['sources/quiet/package.json'] = JSON.stringify({ name: 'quiet' })
    expect(lines(verify(staged, ['quiet']))).toEqual([
      'workspace-package sources/quiet/package.json: sources/quiet/package.json is a workspace package the topology record does not name.',
    ])
  })

  test('a written-out workspace list has to name every part package', () => {
    const staged = stagedTree()
    staged.files['package.json'] = JSON.stringify({ name: SLUG, type: 'module', workspaces: CORE.map(dir => `sources/${dir}`) })
    expect(ruleLines(verify(staged), IntegrityRule.Workspaces)).toHaveLength(1)
    staged.files['package.json'] = JSON.stringify({ name: SLUG, type: 'module', workspaces: staged.dirs.map(dir => `sources/${dir}`) })
    expect(lines(verify(staged))).toEqual([])
  })
})

describe('viable-common - integrity, the rules of a part package', () => {
  test('a library part is a core library: its files, its name, its module type, exactly `tsc -b`, no install hook', () => {
    const staged = stagedTree()
    staged.files['sources/dates/package.json'] = JSON.stringify({
      name: 'dates', type: 'commonjs', scripts: { build: ' tsc -b', postinstall: 'curl x | sh' },
    })
    staged.files['sources/billing/src/index.ts'] = null
    expect(lines(verify(staged))).toEqual([
      'package-name sources/dates/package.json: Package must be named "shop-dates", not "dates".',
      'module-type sources/dates/package.json: Package "dates" must declare "type": "module".',
      'build-script sources/dates/package.json: The build script of "dates" must be exactly `tsc -b`.',
      'lifecycle-script sources/dates/package.json: Lifecycle script "postinstall" is not allowed in a target project.',
      'missing sources/billing/src/index.ts: sources/billing/src/index.ts is missing — the part "billing" always has it.',
    ])
  })

  test('a worker part is the stock worker: build, markers, required dependencies', () => {
    const staged = stagedTree()
    staged.files['sources/mailer-worker/package.json'] = JSON.stringify({
      name: 'shop-mailer-worker', type: 'module', scripts: { build: 'bun ./rollup.build.mjs && sh x' },
      dependencies: { 'shop-common': 'workspace:^' },
    })
    staged.files['sources/mailer-worker/src/owlmeans.ts'] = 'export const owlCtx = null\n'
    expect(lines(verify(staged))).toEqual([
      'build-script sources/mailer-worker/package.json: The build script of "mailer-worker" must be exactly `bun ./rollup.build.mjs`.',
      'required-dependency sources/mailer-worker/package.json: Package "mailer-worker" must depend on @owlmeans/queue.',
      'required-dependency sources/mailer-worker/package.json: Package "mailer-worker" must depend on @owlmeans/redis-queue.',
      'required-dependency sources/mailer-worker/package.json: Package "mailer-worker" must depend on shop-backend.',
      'entry-marker sources/mailer-worker/src/owlmeans.ts: sources/mailer-worker/src/owlmeans.ts does not look like the generated app\'s entry: @owlmeans/queue, makeContext not found.',
    ])
  })

  test('a one-sided api and web part are main\'s api and web — one side each', () => {
    const staged = stagedTree()
    staged.files['sources/hooks-api/src/index.ts'] = 'console.log(1)'
    staged.files['sources/portal-web/rollup.config.js'] = null
    expect(lines(verify(staged))).toEqual([
      'entry-marker sources/hooks-api/src/index.ts: sources/hooks-api/src/index.ts does not look like the generated app\'s entry: ./owlmeans.js, initOwlMeans not found.',
      'missing sources/portal-web/rollup.config.js: sources/portal-web/rollup.config.js is missing — the part "portal" always has it.',
    ])
    expect(targetIntegrityHelper.readPlan(staged.files).extraFiles.some(path => path.startsWith('sources/hooks-web/'))).toBe(false)
  })
})

describe('viable-common - integrity, the structure-map rule', () => {
  const mapLines = (staged: Staged): string[] => ruleLines(verify(staged), IntegrityRule.StructureMap)

  test('a block that fails the structure\'s own rules: an illegal edge, a cycle, a duplicate mount or index', () => {
    expect(mapLines(withRecord(meta => { partOf(meta, 'portal').dependsOn.push('backend') })).join('\n')).toContain('portal')
    const cycle = mapLines(withRecord(meta => { partOf(meta, 'dates').dependsOn.push('billing') }))
    expect(cycle.length).toBeGreaterThan(0)
    expect(cycle.join('\n')).toMatch(/cycle/i)
    expect(mapLines(withRecord(meta => { partOf(meta, 'hooks').mount = 'admin' })).join('\n')).toContain('admin')
    const index = partOf(stagedTree().meta, 'admin').index
    expect(mapLines(withRecord(meta => { partOf(meta, 'hooks').index = index })).length).toBeGreaterThan(0)
    // Each sentence is the structure helper's own — the browser and a repair prompt read the same words.
    const issues = structureHelper.validateRef(withRecord(meta => { partOf(meta, 'portal').dependsOn.push('backend') }).meta.structure!)
    expect(mapLines(withRecord(meta => { partOf(meta, 'portal').dependsOn.push('backend') }))).toEqual(issues.map(issue => issue.message))
  })

  test('a block that is no structure, or lost entries', () => {
    expect(mapLines(withRecord(meta => { meta.structure = 'parts' as never }))).toEqual([
      'The record\'s structure is not a structure — it needs an areas and a parts list.',
    ])
    expect(mapLines(withRecord(meta => { (meta.structure!.parts as unknown[]).push({ name: 'x' }, 'garbage') }))).toContain(
      '2 entries of the record\'s structure are not areas or parts.',
    )
  })

  test('a part whose packages the record does not name, a package tagged with a part that does not own it', () => {
    expect(mapLines(withRecord(meta => { meta.packages = meta.packages.filter(pkg => pkg.name !== 'mailer-worker') }))).toEqual([
      'The part "mailer"\'s package "mailer-worker" is not among the record\'s packages.',
    ])
    expect(mapLines(withRecord(meta => {
      meta.packages = meta.packages.map(pkg => pkg.name === 'dates' ? { ...pkg, part: 'billing' } : pkg)
    }))).toEqual(['The package "dates" names the part "billing", which does not own it.'])
    expect(mapLines(withRecord(meta => {
      meta.packages = meta.packages.map(pkg => pkg.name === 'dates' ? { ...pkg, part: 'ghost' } : pkg)
    }))).toEqual(['The package "dates" names the part "ghost", which the structure does not hold.'])
    expect(mapLines(withRecord(meta => {
      meta.packages = meta.packages.map(pkg => pkg.name === 'dates' ? { ...pkg, partKind: Kind.Shared } : pkg)
    }))).toEqual(['The package "dates" names the part "dates" a shared — the structure holds a library.'])
  })

  test('apps that are not the structure\'s pairs, packages outside sources/', () => {
    expect(mapLines(withRecord(meta => { meta.apps = meta.apps!.filter(app => app.name !== 'backoffice') }))).toEqual([
      'The record\'s apps are not its structure\'s pairs.',
    ])
    expect(mapLines(withRecord(meta => { meta.dir = 'lib' }))).toContain(`A project with a structure keeps its packages under ${TARGET_PACKAGES_DIR}/.`)
  })
})

describe('viable-common - integrity, the part-dependency rule', () => {
  test('a sibling dependency the part\'s edges do not allow — a web side never reaches a shared library', () => {
    const staged = stagedTree()
    const depend = (dir: string, dep: string) => {
      const manifest = JSON.parse(staged.files[`sources/${dir}/package.json`]!) as { dependencies: Record<string, string> }
      manifest.dependencies[`${SLUG}-${dep}`] = 'workspace:^'
      staged.files[`sources/${dir}/package.json`] = JSON.stringify(manifest)
    }
    depend('portal-web', 'billing')
    depend('web', 'backend')
    depend('dates', 'billing')
    depend('mailer-worker', 'dates')
    expect(lines(verify(staged)).filter(line => line.startsWith(IntegrityRule.PartDependency))).toEqual([
      'part-dependency sources/web/package.json: Package "web" depends on shop-backend, which the structure does not let the part "main" depend on.',
      'part-dependency sources/dates/package.json: Package "dates" depends on shop-billing, which the structure does not let the part "dates" depend on.',
      'part-dependency sources/portal-web/package.json: Package "portal-web" depends on shop-billing, which the structure does not let the part "portal" depend on.',
      'part-dependency sources/mailer-worker/package.json: Package "mailer-worker" depends on shop-dates, which the structure does not let the part "mailer" depend on.',
    ])
  })

  test('only `workspace:` siblings are read as edges; a registry dependency is the package\'s own', () => {
    const staged = stagedTree()
    const manifest = JSON.parse(staged.files['sources/portal-web/package.json']!) as { dependencies: Record<string, string> }
    manifest.dependencies['shop-billing'] = '^1.0.0'
    staged.files['sources/portal-web/package.json'] = JSON.stringify(manifest)
    expect(ruleLines(verify(staged), IntegrityRule.PartDependency)).toEqual([])
  })
})

describe('viable-common - integrity, what a structure protects and builds', () => {
  test('every part package\'s manifest and build files are protected, as a core package\'s are', () => {
    const topology = structureHelper.topologyOf(custom(), DEFAULT_TOPOLOGY)
    const added = targetIntegrityHelper.protectedFilesOf(topologyCardHelper.parseTopologyMeta(JSON.parse(JSON.stringify(topology)))!)
      .filter(path => !TARGET_PROTECTED_FILES.includes(path))
    // Two pairs (4 packages), an api, a web and a worker: 7 bundles x 4 files; two libraries x 2.
    expect(added).toHaveLength(7 * 4 + 2 * 2)
    for (const path of ['sources/mailer-worker/rollup.build.mjs', 'sources/hooks-api/package.json', 'sources/portal-web/rollup.config.js', 'sources/dates/tsconfig.json', 'sources/billing/package.json']) {
      expect(added).toContain(path)
    }
  })

  test('every part builds — libraries, pairs, a one-sided api or web, an extra worker; an adopted bundle never', () => {
    const topology = topologyCardHelper.parseTopologyMeta(JSON.parse(JSON.stringify(structureHelper.topologyOf(custom(), DEFAULT_TOPOLOGY))))!
    const build = targetIntegrityHelper.buildOrderOf(topology)
    for (const name of ['common', 'dates', 'billing', 'backend', 'api', 'web', 'worker', 'admin-api', 'admin-web', 'hooks-api', 'portal-web', 'mailer-worker']) {
      expect(build).toContain(name)
    }
    const adopted = { ...topology, packages: [...topology.packages, { name: 'reports', roles: [SubProjectRole.Worker], kind: 'bundle' as const, dependsOn: ['common'] }] }
    expect(targetIntegrityHelper.buildOrderOf(adopted)).not.toContain('reports')
  })

  test('a structure today\'s split derives records no structure, and verifies exactly as that split', () => {
    const derived = structureHelper.topologyOf(structureHelper.defaultFor(ALL), DEFAULT_TOPOLOGY)
    expect(derived.structure).toBeUndefined()
  })
})
