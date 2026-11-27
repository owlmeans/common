import { TOPOLOGY_FILE } from '../metadata/consts.js'
import { appMapHelper } from '../topology/apps.js'
import {
  APP_API_SUFFIX, APP_NAME_PATTERN, APP_PACKAGE_DIR_PATTERN, APP_WEB_SUFFIX, MAIN_APP, MAIN_APP_API, MAIN_APP_WEB,
  RESERVED_APP_NAMES, RESERVED_MOUNTS, TARGET_APP_MAX_INDEX, TARGET_APP_MOUNT_PATTERN,
} from '../topology/apps/consts.js'
import { topologyCardHelper } from '../topology/card.js'
import { topologyHelper } from '../topology/resolve.js'
import type { TopologyDescriptor } from '../topology/types.js'
import {
  IntegrityRule, TARGET_FORBIDDEN_SCRIPTS, TARGET_LIBRARY_BUILD_SCRIPT, TARGET_PACKAGES_DIR, TARGET_SLUG_PATTERN,
  TargetLayout, TargetPackage,
} from './consts.js'
import { BUNDLE_PROTECTED, LIBRARY_PROTECTED, PART_LIBRARY_FILES } from './consts.local.js'
import { TARGET_INTEGRITY_FILES, TARGET_PROTECTED_FILES } from './layout/consts.js'
import { targetLayoutHelper } from './layout.js'
import type {
  IntegrityViolation, TargetFileMap, TargetIntegrityPlan, TargetIntegrityReport, TargetIntegrityTree,
  TargetLayoutManifest,
} from './types.js'
import { structureIntegrityHelper } from './verify/structure.js'
import type { TargetIntegrityHelper } from './verify/types.js'
import type { AppPackage, AppsRecord, OtherPackage, PartLibrary, TreeRecord } from './verify/types.local.js'

export const createTargetIntegrityHelper = (): TargetIntegrityHelper => {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value != null && typeof value === 'object' && !Array.isArray(value)

  const safeDir = (dir: string): boolean => APP_PACKAGE_DIR_PATTERN.test(dir)

  const corePackages = new Set<string>(Object.values(TargetPackage))

  /** The split the record declares — `null` for a record of one app or none. */
  const splitOf = (data: Record<string, unknown>, topology: TopologyDescriptor | null): AppsRecord | null => {
    if (!Array.isArray(data.apps)) return null
    const map = appMapHelper.narrow(data)
    if (map == null || map.apps.length < 2) return null

    return {
      claimed: data.apps.length,
      apps: map.apps,
      packages: new Set(topology?.packages.map(pkg => pkg.name) ?? []),
      dir: typeof data.dir === 'string' ? data.dir.trim() : '',
    }
  }

  /**
   * The recorded packages that are neither core nor an extra app's, as the runtime resolves the record:
   * its dependency order, each name once, with the kind its build lists read — so the verifier holds
   * exactly the packages the publisher would build to the rules.
   */
  const othersOf = (topology: TopologyDescriptor, classifiedDirs: readonly string[]): OtherPackage[] => {
    const classified = new Set<string>([...corePackages, ...classifiedDirs])
    const seen = new Set<string>()
    const out: OtherPackage[] = []
    for (const pkg of topologyHelper.resolveTopology(topology).packages) {
      if (classified.has(pkg.name) || seen.has(pkg.name)) continue
      seen.add(pkg.name)
      out.push({ dir: pkg.name, kind: pkg.kind })
    }

    return out
  }

  /**
   * Every app package with a name safe to address that is not one of the manifest's own — main's
   * `web` and `api` are checked as the layout's packages already.
   */
  const appPackagesOf = (record: AppsRecord, manifest: TargetLayoutManifest): AppPackage[] => {
    const core = new Set<string>(manifest.packages)
    const seen = new Set<string>()
    const out: AppPackage[] = []
    for (const app of record.apps) {
      for (const [dir, rules] of [[app.web, TargetPackage.Web], [app.api, TargetPackage.Api]] as const) {
        if (!safeDir(dir) || core.has(dir) || seen.has(dir)) continue
        seen.add(dir)
        out.push({ dir, rules, owner: `the app "${app.name}"` })
      }
    }

    return out
  }

  /** A main package's file, read for an app package instead. */
  const appPathOf = (path: string, manifest: TargetLayoutManifest, pkg: AppPackage): string | null => {
    const prefix = `${manifest.dir}/${pkg.rules}/`

    return path.startsWith(prefix) ? `${manifest.dir}/${pkg.dir}/${path.slice(prefix.length)}` : null
  }

  const appFilesOf = (manifest: TargetLayoutManifest, pkg: AppPackage): string[] =>
    manifest.files.map(path => appPathOf(path, manifest, pkg)).filter((path): path is string => path != null)

  const manifestPathOf = (dir: string): string => `${TARGET_PACKAGES_DIR}/${dir}/package.json`

  const partLibraryFilesOf = (lib: PartLibrary): string[] =>
    PART_LIBRARY_FILES.map(file => `${TARGET_PACKAGES_DIR}/${lib.dir}/${file}`)

  /**
   * What the record makes of the tree — `null` for today's one-pass path: not a V2 tree, no readable
   * record, or a record that neither splits, nor carries a structure, nor names a package beyond the
   * five core ones. A record placing its packages outside `sources/` names none of this tree's
   * packages: the runtime does not read it (the layout's own arrangement stands), and a split or a
   * structure one is refused (`app-map`, `structure-map`).
   */
  const recordOf = (files: TargetFileMap): TreeRecord | null => {
    if (targetLayoutHelper.detectTargetLayout(files) !== TargetLayout.V2) return null
    const source = files[TOPOLOGY_FILE]
    if (source == null) return null
    const data = topologyCardHelper.frontmatterOf(source)
    if (!isRecord(data)) return null
    const topology = topologyCardHelper.parseTopologyMeta(data)
    const split = splitOf(data, topology)
    const structure = structureIntegrityHelper.read(data)
    const manifest = targetLayoutHelper.targetManifest(TargetLayout.V2)
    const parts = structure?.ref != null ? structureIntegrityHelper.packagesOf(structure.ref) : { bundles: [], libraries: [] }
    const appPackages = split != null ? appPackagesOf(split, manifest) : []
    const named = new Set(appPackages.map(pkg => pkg.dir))
    appPackages.push(...parts.bundles.filter(pkg => !named.has(pkg.dir)))
    const others = topology != null && topology.dir === manifest.dir
      ? othersOf(topology, [...appPackages.map(pkg => pkg.dir), ...parts.libraries.map(lib => lib.dir)])
      : []
    if (split == null && structure == null && others.length === 0) return null

    return {
      dir: typeof data.dir === 'string' ? data.dir.trim() : '',
      recorded: topology?.packages ?? [],
      split,
      structure,
      strict: split != null || structure != null,
      appPackages,
      partLibraries: parts.libraries,
      packages: new Set(topology?.packages.map(pkg => pkg.name) ?? []),
      others,
    }
  }

  const readPlan = (files: TargetFileMap): TargetIntegrityPlan => {
    // Every V2 tree lists `sources/`: the workspace glob installs whatever is there, so every
    // package in it is checked for lifecycle scripts, recorded or not.
    if (targetLayoutHelper.detectTargetLayout(files) !== TargetLayout.V2) return { extraFiles: [], listWorkspace: false }
    const record = recordOf(files)
    if (record == null) return { extraFiles: [], listWorkspace: true }
    const manifest = targetLayoutHelper.targetManifest(TargetLayout.V2)

    return {
      extraFiles: [
        ...record.appPackages.flatMap(pkg => appFilesOf(manifest, pkg)),
        ...record.partLibraries.flatMap(partLibraryFilesOf),
        ...record.others.map(other => manifestPathOf(other.dir)),
      ],
      listWorkspace: true,
    }
  }

  const verifyTargetShape: TargetIntegrityHelper['verifyTargetShape'] = (files, tree) => {
    const violations: IntegrityViolation[] = []
    const layout = targetLayoutHelper.detectTargetLayout(files)
    const manifest = targetLayoutHelper.targetManifest(layout)
    const record = recordOf(files)
    const appPackages = record?.appPackages ?? []
    const partLibraries = record?.partLibraries ?? []

    // Only this layout's files. The caller reads the union of every layout's list so that the
    // probes are in hand before the layout is known — reporting the other layout's paths as
    // missing would refuse both trees at once.
    for (const path of manifest.files) {
      if (files[path] == null) {
        violations.push({
          path, rule: IntegrityRule.Missing,
          detail: `${path} is missing — a Viable project always has it.`
        })
      }
    }

    // The slug is read once, from the root, and every package name is checked against it. A
    // project the user renamed is still the project; a package that does not carry the root's
    // name is a different tree wearing the workspace layout.
    const slug = checkRoot()
    checkInstallConfig()
    for (const pkg of manifest.packages) {
      checkPackage(pkg, pkg, slug)
    }
    checkMarkers(Object.entries(manifest.markers))

    // A tree verified against its record: the record's app list (a split) and its structure, each
    // extra app's and structure part's package under its core package's or the library rules, every
    // other package the record names (an adopted or pulled one), the parts' dependency directions,
    // then whatever else the workspace holds. Nothing here runs on today's one-pass path.
    if (record != null) {
      if (record.split != null) {
        checkAppMap(record.split)
      }
      if (record.structure != null) {
        violations.push(...structureIntegrityHelper.mapViolations(record.structure, {
          dir: record.dir, packages: record.recorded, apps: record.split?.apps ?? null,
        }))
      }
      for (const pkg of appPackages) {
        checkAppPackage(pkg, slug)
      }
      for (const lib of partLibraries) {
        checkPartLibrary(lib, slug)
      }
      for (const other of record.others) {
        checkOtherPackage(other)
      }
      if (record.structure?.ref != null && slug != null) {
        violations.push(...structureIntegrityHelper.dependencyViolations(record.structure.ref, {
          slug, manifestOf: dir => parseJson(files[manifestPathOf(dir)]),
        }))
      }
    }
    if (layout === TargetLayout.V2) {
      checkWorkspacePackages(record)
    }

    return { ok: violations.length === 0, violations, layout }

    function checkRoot(): string | null {
      const found = readJson('package.json')
      if (found == null) return null

      const name = typeof found.name === 'string' ? found.name : ''
      if (!TARGET_SLUG_PATTERN.test(name)) {
        violations.push({
          path: 'package.json', rule: IntegrityRule.PackageName,
          detail: `The root package name "${String(found.name)}" is not a project slug`
            + ` — lowercase letters, digits and inner hyphens, up to 32 characters.`
        })
      }
      if (found.type !== 'module') {
        violations.push({
          path: 'package.json', rule: IntegrityRule.ModuleType,
          detail: 'The root package must declare "type": "module".'
        })
      }

      // The workspace list is what makes the packages resolve to each other. Both spellings are
      // the same tree: the glob `create-app` emits, or the entries written out — every app and
      // structure part package's among them for a tree verified against its record.
      const entries = [
        ...manifest.workspaceEntries,
        ...appPackages.map(pkg => `${manifest.dir}/${pkg.dir}`),
        ...partLibraries.map(lib => `${manifest.dir}/${lib.dir}`),
      ]
      const declared = Array.isArray(found.workspaces) ? found.workspaces as string[] : []
      const isGlob = declared.length === 1 && declared[0] === manifest.workspaceGlob
      const isExplicit = declared.length === entries.length
        && entries.every(entry => declared.includes(entry))
      if (!isGlob && !isExplicit) {
        violations.push({
          path: 'package.json', rule: IntegrityRule.Workspaces,
          detail: `The root package must declare the workspaces as ["${manifest.workspaceGlob}"]`
            + ` or as exactly ${entries.join(', ')}.`
        })
      }

      checkScripts('package.json', found)

      return TARGET_SLUG_PATTERN.test(name) ? name : null
    }

    /**
     * `bunfig.toml` decides where `bun install` fetches from and how it links.
     *
     * A registry line pointed elsewhere makes every dependency in the tree arbitrary code
     * regardless of how well-formed the manifests are, so it is checked as a shape rather than
     * a marker: nothing but the hoisted-linker install block belongs in it.
     */
    function checkInstallConfig(): void {
      const content = files['bunfig.toml']
      if (content == null) return

      const offending = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .filter(line => !/^\[install\]$/.test(line) && !/^linker\s*=/.test(line))

      if (offending.length > 0) {
        violations.push({
          path: 'bunfig.toml', rule: IntegrityRule.InstallConfig,
          detail: 'bunfig.toml may only declare the hoisted install linker.'
        })
      }
    }

    /** One package — `pkg` its directory, `rules` the manifest package whose rules it is held to. */
    function checkPackage(pkg: string, rules: string, slug: string | null): void {
      const path = `${manifest.dir}/${pkg}/package.json`
      const found = readJson(path)
      if (found == null) return

      checkIdentity(path, pkg, found, slug)

      const scripts = asRecord(found.scripts)
      if (scripts.build !== manifest.buildScripts[rules]) {
        // The one the platform actually spawns.
        violations.push({
          path, rule: IntegrityRule.BuildScript,
          detail: `The build script of "${pkg}" must be exactly \`${manifest.buildScripts[rules]}\`.`
        })
      }
      checkScripts(path, found)

      if (slug == null) return

      const deps = { ...asRecord(found.dependencies), ...asRecord(found.devDependencies) }
      for (const dep of targetLayoutHelper.targetRequiredDeps(slug, rules, layout)) {
        if (deps[dep] == null) {
          violations.push({
            path, rule: IntegrityRule.RequiredDependency,
            detail: `Package "${pkg}" must depend on ${dep}.`
          })
        }
      }
    }

    /** `<slug>-<pkg>` and `type: module` — a core or app package's name and module type. */
    function checkIdentity(path: string, pkg: string, found: Record<string, unknown>, slug: string | null): void {
      // With no readable slug the name and the workspace dependencies have nothing to be checked
      // against; the root violation already says why, and repeating it per package is noise.
      if (slug != null) {
        const expected = targetLayoutHelper.targetPackageName(slug, pkg)
        if (found.name !== expected) {
          violations.push({
            path, rule: IntegrityRule.PackageName,
            detail: `Package must be named "${expected}", not "${String(found.name)}".`
          })
        }
      }
      if (found.type !== 'module') {
        violations.push({
          path, rule: IntegrityRule.ModuleType,
          detail: `Package "${pkg}" must declare "type": "module".`
        })
      }
    }

    /**
     * A recorded package the manifest has no rules of its own for — adopted, or brought by a pull.
     *
     * The publisher builds every recorded library before anything that imports it, so a library's
     * build is exactly `tsc -b` (both sides trimmed — what adoption classifies by). Nothing else is
     * asked of it: the package is the person's, named and typed as they wrote it. A bundle is never
     * built or run (`buildOrderOf`). Either way the workspace glob installs it, so it carries no
     * lifecycle script. A library's directory listed with no manifest in it is `missing`: `bun run
     * build` there walks up to the root's `build`, which builds every `sources/*` package. A package
     * that is not there at all is nothing the platform runs; one the caller never read fails closed.
     */
    function checkOtherPackage(other: OtherPackage): void {
      const path = manifestPathOf(other.dir)
      const library = other.kind === 'library'
      const listed = tree?.workspaceDirs == null || tree.workspaceDirs.includes(other.dir)
      if (files[path] === undefined || (files[path] === null && library && listed)) {
        violations.push({
          path, rule: IntegrityRule.Missing,
          detail: `${path} is missing — the topology record names the ${library ? 'library' : 'package'} "${other.dir}".`
        })
        return
      }
      const found = readJson(path)
      if (found == null) return

      const build: unknown = asRecord(found.scripts).build
      if (library && (typeof build !== 'string' || build.trim() !== TARGET_LIBRARY_BUILD_SCRIPT)) {
        violations.push({
          path, rule: IntegrityRule.BuildScript,
          detail: `The build script of "${other.dir}" must be exactly \`${TARGET_LIBRARY_BUILD_SCRIPT}\``
          + ' — the topology record names it a library.'
        })
      }
      checkScripts(path, found)
    }

    /** Lifecycle hooks run on `bun install`, before anything else has a chance to refuse. */
    function checkScripts(path: string, found: Record<string, unknown>): void {
      const scripts = asRecord(found.scripts)
      for (const hook of TARGET_FORBIDDEN_SCRIPTS) {
        if (scripts[hook] != null) {
          violations.push({
            path, rule: IntegrityRule.LifecycleScript,
            detail: `Lifecycle script "${hook}" is not allowed in a target project.`
          })
        }
      }
    }

    function checkMarkers(entries: Array<[string, readonly string[]]>): void {
      for (const [path, markers] of entries) {
        const content = files[path]
        if (content == null) continue

        const absent = markers.filter(marker => !content.includes(marker))
        if (absent.length > 0) {
          violations.push({
            path, rule: IntegrityRule.EntryMarker,
            detail: `${path} does not look like the generated app's entry: ${absent.join(', ')} not found.`
          })
        }
      }
    }

    /** The record's own app list: well-formed, unique, and naming packages the record names. */
    function checkAppMap(found: AppsRecord): void {
      const report = (detail: string): void => {
        violations.push({ path: TOPOLOGY_FILE, rule: IntegrityRule.AppMap, detail })
      }
      const dropped = found.claimed - found.apps.length
      if (dropped === 1) report('1 entry of the record\'s apps list is not an app.')
      if (dropped > 1) report(`${dropped} entries of the record's apps list are not apps.`)
      if (found.dir !== TARGET_PACKAGES_DIR) report(`A project split into apps keeps its packages under ${TARGET_PACKAGES_DIR}/.`)
      if (!found.apps.some(app => app.name === MAIN_APP && app.mount === '' && app.index === 0)) {
        report(`The record's apps list has no "${MAIN_APP}" app at the host's root with index 0.`)
      }

      const names = new Map<string, number>()
      const mounts = new Map<string, number>()
      const indices = new Map<number, number>()
      const dirs = new Map<string, number>()
      const count = <K>(seen: Map<K, number>, key: K): void => {
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
      for (const app of found.apps) {
        count(names, app.name)
        count(indices, app.index)
        count(dirs, app.web)
        count(dirs, app.api)
        if (app.mount !== '') count(mounts, app.mount)
        if (!APP_NAME_PATTERN.test(app.name)) report(`The app name "${app.name}" is not 2–16 lower-case letters and digits.`)
        if (RESERVED_APP_NAMES.includes(app.name)) report(`The app name "${app.name}" is reserved.`)
        if (app.name === MAIN_APP) {
          if (app.web !== MAIN_APP_WEB || app.api !== MAIN_APP_API) {
            report(`The app "${MAIN_APP}" must keep the packages "${MAIN_APP_WEB}" and "${MAIN_APP_API}".`)
          }
          continue
        }
        if (!TARGET_APP_MOUNT_PATTERN.test(app.mount)) {
          report(`The app "${app.name}" has an ill-shaped mount "${app.mount}" — one lower-case path segment.`)
        } else if (RESERVED_MOUNTS.includes(app.mount)) {
          report(`The app "${app.name}" may not be mounted at the reserved path "/${app.mount}".`)
        }
        if (!Number.isInteger(app.index) || app.index < 1 || app.index > TARGET_APP_MAX_INDEX) {
          report(`The app "${app.name}" has the index ${app.index}, outside 1..${TARGET_APP_MAX_INDEX}.`)
        }
        for (const [dir, suffix] of [[app.web, APP_WEB_SUFFIX], [app.api, APP_API_SUFFIX]] as const) {
          if (dir !== `${app.name}${suffix}`) {
            report(`The app "${app.name}" names the package "${dir}" — it must be "${app.name}${suffix}".`)
          } else if (!found.packages.has(dir)) {
            report(`The app "${app.name}"'s package "${dir}" is not among the record's packages.`)
          }
        }
      }
      for (const [name, seen] of names) if (seen > 1) report(`The app name "${name}" is listed ${seen} times.`)
      for (const [mount, seen] of mounts) if (seen > 1) report(`The mount "/${mount}" is claimed ${seen} times.`)
      for (const [index, seen] of indices) if (seen > 1) report(`The index ${index} is claimed ${seen} times.`)
      for (const [dir, seen] of dirs) if (seen > 1) report(`The package "${dir}" is named ${seen} times.`)
    }

    /** An extra app's or a structure part's bundled package, held to main's web, api or worker rules. */
    function checkAppPackage(pkg: AppPackage, slug: string | null): void {
      for (const path of appFilesOf(manifest, pkg)) {
        if (files[path] == null) {
          violations.push({
            path, rule: IntegrityRule.Missing,
            detail: `${path} is missing — ${pkg.owner} always has it.`
          })
        }
      }
      checkPackage(pkg.dir, pkg.rules, slug)
      checkMarkers(Object.entries(manifest.markers)
        .map(([path, markers]): [string | null, readonly string[]] => [appPathOf(path, manifest, pkg), markers])
        .filter((entry): entry is [string, readonly string[]] => entry[0] != null))
    }

    /**
     * A structure's library part — what the platform staged, so held to the library rules a core
     * library is: its files, `<slug>-<dir>`, `type: module`, exactly `tsc -b`, no lifecycle script.
     * Its dependency directions are `part-dependency`'s.
     */
    function checkPartLibrary(lib: PartLibrary, slug: string | null): void {
      for (const path of partLibraryFilesOf(lib)) {
        if (files[path] == null) {
          violations.push({
            path, rule: IntegrityRule.Missing,
            detail: `${path} is missing — the part "${lib.part}" always has it.`
          })
        }
      }
      const path = manifestPathOf(lib.dir)
      const found = readJson(path)
      if (found == null) return

      checkIdentity(path, lib.dir, found, slug)
      if (asRecord(found.scripts).build !== TARGET_LIBRARY_BUILD_SCRIPT) {
        violations.push({
          path, rule: IntegrityRule.BuildScript,
          detail: `The build script of "${lib.dir}" must be exactly \`${TARGET_LIBRARY_BUILD_SCRIPT}\`.`
        })
      }
      checkScripts(path, found)
    }

    /**
     * A `sources/*` package nobody recorded — installed by the workspace glob all the same.
     *
     * A tree split into apps or carrying a structure holds its workspace to the record
     * (`workspace-package`): the runtime serves and ports exactly what the record says, and a package
     * it does not name is refused — a listed directory nobody looked into counts as one. Any other V2
     * tree treats it as an unclassified bundle: nothing builds or runs it, and its manifest carries no lifecycle script
     * (unreadable is refused — Bun reads manifests `JSON.parse` does not). A directory with no
     * manifest is no package; a listing whose manifests were never read checks nothing here.
     */
    function checkWorkspacePackages(found: TreeRecord | null): void {
      if (tree?.workspaceDirs == null) return
      const known = new Set<string>([
        ...manifest.packages, ...found?.packages ?? [], ...appPackages.map(pkg => pkg.dir), ...partLibraries.map(lib => lib.dir),
      ])
      const strict = found?.strict === true
      for (const dir of [...new Set(tree.workspaceDirs)].sort()) {
        if (dir === '' || dir.startsWith('.') || dir.includes('/') || known.has(dir)) continue
        const path = manifestPathOf(dir)
        if (!strict) {
          if (files[path] == null) continue
          const stray = readJson(path)
          if (stray != null) checkScripts(path, stray)
          continue
        }
        // Not read: assumed present — a listed directory nobody looked into is not proof of absence.
        if (files[path] === null) continue
        violations.push({
          path, rule: IntegrityRule.WorkspacePackage,
          detail: `${path} is a workspace package the topology record does not name.`
        })
      }
    }

    /** A manifest read for a second opinion — `null` when absent or unreadable, never reported (its own check did). */
    function parseJson(content: string | null | undefined): Record<string, unknown> | null {
      if (content == null) return null
      try {
        const parsed: unknown = JSON.parse(content)

        return isRecord(parsed) ? parsed : null
      } catch {
        return null
      }
    }

    function readJson(path: string): Record<string, unknown> | null {
      const content = files[path]
      if (content == null) return null
      try {
        const parsed: unknown = JSON.parse(content)

        return typeof parsed === 'object' && parsed !== null
          ? parsed as Record<string, unknown>
          : reportUnreadable(path)
      } catch {
        return reportUnreadable(path)
      }
    }

    function reportUnreadable(path: string): null {
      violations.push({
        path, rule: IntegrityRule.Unreadable, detail: `${path} is not a readable JSON object.`
      })

      return null
    }

    function asRecord(value: unknown): Record<string, string> {
      return typeof value === 'object' && value !== null
        ? value as Record<string, string>
        : {}
    }
  }

  const formatIntegrityReport = (report: TargetIntegrityReport): string =>
    report.violations.map(violation => `${violation.path}: ${violation.detail}`).join('\n')

  const collectTargetFiles: TargetIntegrityHelper['collectTargetFiles'] = async (read, list) => {
    const readAll = async (paths: readonly string[]): Promise<TargetFileMap> =>
      Object.fromEntries(await Promise.all(paths.map(async path => [path, await read(path)] as const)))

    const files = await readAll(TARGET_INTEGRITY_FILES)
    const plan = readPlan(files)
    Object.assign(files, await readAll(plan.extraFiles))
    if (!plan.listWorkspace) return { files }

    const workspaceDirs = await list(TARGET_PACKAGES_DIR)
    // The manifest of every listed directory the record does not name, so the rule can tell a stray
    // package from a stray directory.
    const record = recordOf(files)
    const named = new Set<string>([
      ...Object.values(TargetPackage), ...(record?.packages ?? []),
      ...plan.extraFiles.map(path => path.split('/')[1]),
    ])
    const strays = workspaceDirs
      .filter(dir => dir !== '' && !dir.startsWith('.') && !dir.includes('/') && !named.has(dir))
    Object.assign(files, await readAll(strays.map(dir => `${TARGET_PACKAGES_DIR}/${dir}/package.json`)))

    return { files, workspaceDirs }
  }

  const protectedFilesOf: TargetIntegrityHelper['protectedFilesOf'] = record => {
    // A structure's parts mirror the core packages: a bundled part (api, web, worker) has a bundle's
    // build files, a library part a library's.
    const parts = record?.structure != null ? structureIntegrityHelper.packagesOf(record.structure) : { bundles: [], libraries: [] }
    const bundles = new Set<string>([
      ...(record?.apps ?? []).filter(app => app.mount !== '').flatMap(app => [app.web, app.api]),
      ...(record?.packages ?? []).filter(pkg => pkg.app != null).map(pkg => pkg.name),
      ...parts.bundles.map(pkg => pkg.dir),
    ])
    const protect = (dirs: Iterable<string>, files: readonly string[]): string[] => [...dirs]
      .filter(dir => safeDir(dir) && !corePackages.has(dir))
      .flatMap(dir => files.map(file => `${TARGET_PACKAGES_DIR}/${dir}/${file}`))

    return [...new Set([
      ...TARGET_PROTECTED_FILES,
      ...protect(bundles, BUNDLE_PROTECTED),
      ...protect(parts.libraries.map(lib => lib.dir), LIBRARY_PROTECTED),
    ])]
  }

  const buildOrderOf: TargetIntegrityHelper['buildOrderOf'] = record => {
    // An app pair's packages and a structure's api, web and worker parts build like the core ones;
    // every library does. Only a bundle nothing classified — an adopted one — never builds.
    const appDirs = (record.apps ?? []).filter(app => app.mount !== '').flatMap(app => [app.web, app.api])
    const partDirs = record.structure != null ? structureIntegrityHelper.packagesOf(record.structure).bundles.map(pkg => pkg.dir) : []
    const bundles = new Set(othersOf(record, [...appDirs, ...partDirs]).filter(other => other.kind !== 'library').map(other => other.dir))

    return topologyHelper.resolveTopology(record).build.filter(name => !bundles.has(name))
  }

  return { verifyTargetShape, formatIntegrityReport, readPlan, collectTargetFiles, protectedFilesOf, buildOrderOf }
}

export const targetIntegrityHelper = createTargetIntegrityHelper()

/** @deprecated compat:factory-refactor — use `targetIntegrityHelper.verifyTargetShape(…)` */
export const verifyTargetShape = (files: TargetFileMap, tree?: TargetIntegrityTree): TargetIntegrityReport =>
  targetIntegrityHelper.verifyTargetShape(files, tree)

/** @deprecated compat:factory-refactor — use `targetIntegrityHelper.formatIntegrityReport(…)` */
export const formatIntegrityReport = (report: TargetIntegrityReport): string =>
  targetIntegrityHelper.formatIntegrityReport(report)
