import {
  detectTargetLayout, IntegrityRule, TARGET_FORBIDDEN_SCRIPTS, TARGET_SLUG_PATTERN,
  targetManifest, targetPackageName, targetRequiredDeps
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
 * The tree picks the manifest it is verified against. A slot holds the layout it was
 * initialized with for the life of the project and nothing migrates it, so asserting the
 * current layout unconditionally does not make the check stricter — it aims it at a tree that
 * was never there, and every legacy slot answers with one `missing` violation per file it was
 * never supposed to have. That refuses the application the platform itself generated.
 *
 * Every rule collects rather than short-circuits: a tree that fails is usually a person's
 * repository, and telling them one thing at a time turns a fix into a dozen round trips
 * through a pull that reverts itself each time.
 */
export const verifyTargetShape = (files: TargetFileMap): TargetIntegrityReport => {
  const violations: IntegrityViolation[] = []
  const layout = detectTargetLayout(files)
  const manifest = targetManifest(layout)

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
    checkPackage(pkg, slug)
  }
  checkMarkers()

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
    // the same tree: the glob `create-app` emits, or the entries written out.
    const declared = Array.isArray(found.workspaces) ? found.workspaces as string[] : []
    const isGlob = declared.length === 1 && declared[0] === manifest.workspaceGlob
    const isExplicit = declared.length === manifest.workspaceEntries.length
      && manifest.workspaceEntries.every(entry => declared.includes(entry))
    if (!isGlob && !isExplicit) {
      violations.push({
        path: 'package.json', rule: IntegrityRule.Workspaces,
        detail: `The root package must declare the workspaces as ["${manifest.workspaceGlob}"]`
          + ` or as exactly ${manifest.workspaceEntries.join(', ')}.`
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

  function checkPackage(pkg: string, slug: string | null): void {
    const path = `${manifest.dir}/${pkg}/package.json`
    const found = readJson(path)
    if (found == null) return

    // With no readable slug the name and the workspace dependencies have nothing to be checked
    // against; the root violation already says why, and repeating it per package is noise.
    if (slug != null) {
      const expected = targetPackageName(slug, pkg)
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
    if (scripts.build !== manifest.buildScripts[pkg]) {
      // The one the platform actually spawns.
      violations.push({
        path, rule: IntegrityRule.BuildScript,
        detail: `The build script of "${pkg}" must be exactly \`${manifest.buildScripts[pkg]}\`.`
      })
    }
    checkScripts(path, found)

    if (slug == null) return

    const deps = { ...asRecord(found.dependencies), ...asRecord(found.devDependencies) }
    for (const dep of targetRequiredDeps(slug, pkg, layout)) {
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

  function checkMarkers(): void {
    for (const [path, markers] of Object.entries(manifest.markers)) {
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
