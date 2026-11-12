import { TOPOLOGY_FILE } from '../metadata/consts.js'
import { appMapHelper } from '../topology/apps.js'
import {
  APP_API_SUFFIX, APP_NAME_PATTERN, APP_PACKAGE_DIR_PATTERN, APP_WEB_SUFFIX, MAIN_APP, MAIN_APP_API, MAIN_APP_WEB,
  RESERVED_APP_NAMES, RESERVED_MOUNTS, TARGET_APP_MAX_INDEX, TARGET_APP_MOUNT_PATTERN,
} from '../topology/apps/consts.js'
import { topologyCardHelper } from '../topology/card.js'
import {
  IntegrityRule, TARGET_FORBIDDEN_SCRIPTS, TARGET_PACKAGES_DIR, TARGET_SLUG_PATTERN, TargetLayout, TargetPackage,
} from './consts.js'
import { BUNDLE_PROTECTED } from './consts.local.js'
import { TARGET_INTEGRITY_FILES, TARGET_PROTECTED_FILES } from './layout/consts.js'
import { targetLayoutHelper } from './layout.js'
import type {
  IntegrityViolation, TargetFileMap, TargetIntegrityPlan, TargetIntegrityReport, TargetIntegrityTree,
  TargetLayoutManifest,
} from './types.js'
import type { TargetIntegrityHelper } from './verify/types.js'
import type { AppPackage, AppsRecord } from './verify/types.local.js'

export const createTargetIntegrityHelper = (): TargetIntegrityHelper => {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value != null && typeof value === 'object' && !Array.isArray(value)

  const safeDir = (dir: string): boolean => APP_PACKAGE_DIR_PATTERN.test(dir)

  /** The split the record declares — `null` for a record of one app, an unreadable record, or none. */
  const appsRecordOf = (files: TargetFileMap): AppsRecord | null => {
    if (targetLayoutHelper.detectTargetLayout(files) !== TargetLayout.V2) return null
    const source = files[TOPOLOGY_FILE]
    if (source == null) return null
    const data = topologyCardHelper.frontmatterOf(source)
    if (!isRecord(data) || !Array.isArray(data.apps)) return null
    const map = appMapHelper.narrow(data)
    if (map == null || map.apps.length < 2) return null
    const topology = topologyCardHelper.parseTopologyMeta(data)

    return {
      claimed: data.apps.length,
      apps: map.apps,
      packages: new Set(topology?.packages.map(pkg => pkg.name) ?? []),
      dir: typeof data.dir === 'string' ? data.dir.trim() : '',
    }
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
        out.push({ dir, rules, app: app.name })
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

  const readPlan = (files: TargetFileMap): TargetIntegrityPlan => {
    const record = appsRecordOf(files)
    if (record == null) return { extraFiles: [], listWorkspace: false }
    const manifest = targetLayoutHelper.targetManifest(TargetLayout.V2)

    return {
      extraFiles: appPackagesOf(record, manifest).flatMap(pkg => appFilesOf(manifest, pkg)),
      listWorkspace: true,
    }
  }

  const verifyTargetShape: TargetIntegrityHelper['verifyTargetShape'] = (files, tree) => {
    const violations: IntegrityViolation[] = []
    const layout = targetLayoutHelper.detectTargetLayout(files)
    const manifest = targetLayoutHelper.targetManifest(layout)
    const record = appsRecordOf(files)
    const appPackages = record != null ? appPackagesOf(record, manifest) : []

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

    // A tree split into apps: the record's list, then each extra app's packages under main's rules,
    // then whatever else the workspace holds. Nothing here runs for a tree with no split.
    if (record != null) {
      checkAppMap(record)
      for (const pkg of appPackages) {
        checkAppPackage(pkg, slug)
      }
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
      // the same tree: the glob `create-app` emits, or the entries written out — every app
      // package's among them for a tree split into apps.
      const entries = [
        ...manifest.workspaceEntries, ...appPackages.map(pkg => `${manifest.dir}/${pkg.dir}`),
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

    /** An extra app's package, held to main's web or api rules. */
    function checkAppPackage(pkg: AppPackage, slug: string | null): void {
      for (const path of appFilesOf(manifest, pkg)) {
        if (files[path] == null) {
          violations.push({
            path, rule: IntegrityRule.Missing,
            detail: `${path} is missing — the app "${pkg.app}" always has it.`
          })
        }
      }
      checkPackage(pkg.dir, pkg.rules, slug)
      checkMarkers(Object.entries(manifest.markers)
        .map(([path, markers]): [string | null, readonly string[]] => [appPathOf(path, manifest, pkg), markers])
        .filter((entry): entry is [string, readonly string[]] => entry[0] != null))
    }

    /** A `sources/*` package nobody recorded: installed by the workspace glob, checked by nothing. */
    function checkWorkspacePackages(found: AppsRecord): void {
      if (tree?.workspaceDirs == null) return
      const known = new Set<string>([...manifest.packages, ...found.packages, ...appPackages.map(pkg => pkg.dir)])
      for (const dir of [...new Set(tree.workspaceDirs)].sort()) {
        if (dir === '' || dir.startsWith('.') || dir.includes('/') || known.has(dir)) continue
        const path = `${manifest.dir}/${dir}/package.json`
        // Not read: assumed present — a listed directory nobody looked into is not proof of absence.
        if (files[path] === null) continue
        violations.push({
          path, rule: IntegrityRule.WorkspacePackage,
          detail: `${path} is a workspace package the topology record does not name.`
        })
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
    const record = appsRecordOf(files)
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
    const dirs = new Set<string>([
      ...(record?.apps ?? []).filter(app => app.mount !== '').flatMap(app => [app.web, app.api]),
      ...(record?.packages ?? []).filter(pkg => pkg.app != null).map(pkg => pkg.name),
    ])
    const extra = [...dirs]
      .filter(dir => safeDir(dir) && !(Object.values(TargetPackage) as string[]).includes(dir))
      .flatMap(dir => BUNDLE_PROTECTED.map(file => `${TARGET_PACKAGES_DIR}/${dir}/${file}`))

    return [...new Set([...TARGET_PROTECTED_FILES, ...extra])]
  }

  return { verifyTargetShape, formatIntegrityReport, readPlan, collectTargetFiles, protectedFilesOf }
}

export const targetIntegrityHelper = createTargetIntegrityHelper()

/** @deprecated compat:factory-refactor — use `targetIntegrityHelper.verifyTargetShape(…)` */
export const verifyTargetShape = (files: TargetFileMap, tree?: TargetIntegrityTree): TargetIntegrityReport =>
  targetIntegrityHelper.verifyTargetShape(files, tree)

/** @deprecated compat:factory-refactor — use `targetIntegrityHelper.formatIntegrityReport(…)` */
export const formatIntegrityReport = (report: TargetIntegrityReport): string =>
  targetIntegrityHelper.formatIntegrityReport(report)
