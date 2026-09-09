import {
  IntegrityRule, TARGET_BUILD_SCRIPTS, TARGET_ENTRY_MARKERS, TARGET_FORBIDDEN_SCRIPTS,
  TARGET_INTEGRITY_FILES, TARGET_PACKAGES_DIR, TARGET_SLUG_PATTERN, TARGET_WORKSPACE_ENTRIES,
  TARGET_WORKSPACE_GLOB, targetPackageName, targetRequiredDeps, TargetPackage
} from './consts.js'
import type { IntegrityViolation, TargetFileMap, TargetIntegrityReport } from './types.js'

/**
 * Decide whether a tree is the generated application, from its files alone.
 *
 * Pure and IO-free on purpose. The publisher reads the sandbox and calls this; a test reads
 * the template and calls this; both then agree by construction. It is also why the check is
 * cheap enough to sit in front of every spawn rather than only at the moments someone
 * remembered to guard.
 *
 * Every rule collects rather than short-circuits: a tree that fails is usually a person's
 * repository, and telling them one thing at a time turns a fix into a dozen round trips
 * through a pull that reverts itself each time.
 */
export const verifyTargetShape = (files: TargetFileMap): TargetIntegrityReport => {
  const violations: IntegrityViolation[] = []

  for (const path of TARGET_INTEGRITY_FILES) {
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
  for (const pkg of Object.values(TargetPackage)) {
    checkPackage(pkg, slug)
  }
  checkMarkers()

  return { ok: violations.length === 0, violations }

  function checkRoot(): string | null {
    const manifest = readJson('package.json')
    if (manifest == null) return null

    const name = typeof manifest.name === 'string' ? manifest.name : ''
    if (!TARGET_SLUG_PATTERN.test(name)) {
      violations.push({
        path: 'package.json', rule: IntegrityRule.PackageName,
        detail: `The root package name "${String(manifest.name)}" is not a project slug`
          + ` — lowercase letters, digits and inner hyphens, up to 32 characters.`
      })
    }
    if (manifest.type !== 'module') {
      violations.push({
        path: 'package.json', rule: IntegrityRule.ModuleType,
        detail: 'The root package must declare "type": "module".'
      })
    }

    // The workspace list is what makes the packages resolve to each other. Both spellings are
    // the same tree: the glob `create-app` emits, or the entries written out.
    const declared = Array.isArray(manifest.workspaces) ? manifest.workspaces as string[] : []
    const isGlob = declared.length === 1 && declared[0] === TARGET_WORKSPACE_GLOB
    const isExplicit = declared.length === TARGET_WORKSPACE_ENTRIES.length
      && TARGET_WORKSPACE_ENTRIES.every(entry => declared.includes(entry))
    if (!isGlob && !isExplicit) {
      violations.push({
        path: 'package.json', rule: IntegrityRule.Workspaces,
        detail: `The root package must declare the workspaces as ["${TARGET_WORKSPACE_GLOB}"]`
          + ` or as exactly ${TARGET_WORKSPACE_ENTRIES.join(', ')}.`
      })
    }

    checkScripts('package.json', manifest)

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

  function checkPackage(pkg: TargetPackage, slug: string | null): void {
    const path = `${TARGET_PACKAGES_DIR}/${pkg}/package.json`
    const manifest = readJson(path)
    if (manifest == null) return

    // With no readable slug the name and the workspace dependencies have nothing to be checked
    // against; the root violation already says why, and repeating it per package is noise.
    if (slug != null) {
      const expected = targetPackageName(slug, pkg)
      if (manifest.name !== expected) {
        violations.push({
          path, rule: IntegrityRule.PackageName,
          detail: `Package must be named "${expected}", not "${String(manifest.name)}".`
        })
      }
    }
    if (manifest.type !== 'module') {
      violations.push({
        path, rule: IntegrityRule.ModuleType,
        detail: `Package "${pkg}" must declare "type": "module".`
      })
    }

    const scripts = asRecord(manifest.scripts)
    if (scripts.build !== TARGET_BUILD_SCRIPTS[pkg]) {
      // The one the platform actually spawns.
      violations.push({
        path, rule: IntegrityRule.BuildScript,
        detail: `The build script of "${pkg}" must be exactly \`${TARGET_BUILD_SCRIPTS[pkg]}\`.`
      })
    }
    checkScripts(path, manifest)

    if (slug == null) return

    const deps = { ...asRecord(manifest.dependencies), ...asRecord(manifest.devDependencies) }
    for (const dep of targetRequiredDeps(slug, pkg)) {
      if (deps[dep] == null) {
        violations.push({
          path, rule: IntegrityRule.RequiredDependency,
          detail: `Package "${pkg}" must depend on ${dep}.`
        })
      }
    }
  }

  /** Lifecycle hooks run on `bun install`, before anything else has a chance to refuse. */
  function checkScripts(path: string, manifest: Record<string, unknown>): void {
    const scripts = asRecord(manifest.scripts)
    for (const hook of TARGET_FORBIDDEN_SCRIPTS) {
      if (scripts[hook] != null) {
        violations.push({
          path, rule: IntegrityRule.LifecycleScript,
          detail: `Lifecycle script "${hook}" is not allowed in a target project.`
        })
      }
    }
  }

  function checkMarkers(): void {
    for (const [path, markers] of Object.entries(TARGET_ENTRY_MARKERS)) {
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

/** One line per violation — what goes into a log, `slot.lastError`, or a build diagnostic. */
export const formatIntegrityReport = (report: TargetIntegrityReport): string =>
  report.violations.map(violation => `${violation.path}: ${violation.detail}`).join('\n')
