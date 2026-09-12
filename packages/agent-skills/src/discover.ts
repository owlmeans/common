import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ManifestEntry {
  kind: 'skill' | 'instruction'
  name: string
  category: 'package-specific' | 'multi-package' | 'general'
  file: string
  canonicalPath: string
}

export interface Manifest {
  schemaVersion: number
  package: string
  version: string
  generatedAt: string
  canonicalRepo: string
  entries: ManifestEntry[]
}

export interface DiscoveredEntry {
  kind: 'skill' | 'instruction'
  name: string
  category: 'package-specific' | 'multi-package' | 'general'
  /** Absolute path to the embedded source file. */
  sourcePath: string
  canonicalPath: string
  /** Package this came from. */
  packageName: string
  version: string
  /** True for extras bundled in the installer itself. */
  isExtra: boolean
}

/** Parse a manifest.json, return null if invalid/unparseable. */
const parseManifest = (manifestPath: string): Manifest | null => {
  try {
    const raw = readFileSync(manifestPath, 'utf8')
    const m = JSON.parse(raw) as Manifest
    if (typeof m.schemaVersion !== 'number' || !Array.isArray(m.entries)) return null
    return m
  } catch {
    return null
  }
}

const OWLMEANS_SCOPE = '@owlmeans'

/**
 * Collect every existing `<...>/node_modules/@owlmeans` directory in the project
 * tree. A scaffolded app is a bun workspace whose `@owlmeans/*` deps belong to its
 * `sources/*` packages (the root has none), so bun may keep them under
 * `sources/<pkg>/node_modules/@owlmeans` rather than at the root. Scanning only the
 * root would miss them — so we walk the whole tree.
 *
 * The walk is bounded: it never descends into a `node_modules` directory (it just
 * records its `@owlmeans` scope), skips hidden dirs (`.git`, `.github`, …), and
 * tracks visited realpaths to avoid symlink cycles.
 */
const collectScopeDirs = (targetDir: string): string[] => {
  const found: string[] = []
  const seen = new Set<string>()

  const walk = (dir: string): void => {
    let real: string
    try {
      real = realpathSync(dir)
    } catch {
      return
    }
    if (seen.has(real)) return
    seen.add(real)

    let dirents: import('node:fs').Dirent[]
    try {
      dirents = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const dirent of dirents) {
      const name = dirent.name
      if (name === 'node_modules') {
        const scope = join(dir, 'node_modules', OWLMEANS_SCOPE)
        if (existsSync(scope)) found.push(scope)
        // never descend into node_modules
        continue
      }
      if (name.startsWith('.')) continue
      if (!dirent.isDirectory()) continue
      walk(join(dir, name))
    }
  }

  walk(targetDir)
  return found
}

interface ScopePackage {
  /** Realpath of the package dir, used to dedup the same physical package read via
   *  multiple (symlinked) locations. */
  realDir: string
  entries: DiscoveredEntry[]
}

/** Read all @owlmeans packages under a single `.../node_modules/@owlmeans` dir. */
const scanScopeDir = (scopeDir: string): ScopePackage[] => {
  let pkgDirs: string[]
  try {
    pkgDirs = readdirSync(scopeDir)
  } catch {
    return []
  }

  const packages: ScopePackage[] = []
  for (const pkgDir of pkgDirs) {
    const pkgPath = join(scopeDir, pkgDir)
    const agentMetaDir = join(pkgPath, 'agent-meta')
    const manifestPath = join(agentMetaDir, 'manifest.json')
    if (!existsSync(manifestPath)) continue
    const manifest = parseManifest(manifestPath)
    if (manifest == null) continue

    let realDir: string
    try {
      realDir = realpathSync(pkgPath)
    } catch {
      realDir = pkgPath
    }

    const entries: DiscoveredEntry[] = []
    for (const e of manifest.entries) {
      const sourcePath = join(agentMetaDir, e.file)
      if (!existsSync(sourcePath)) continue
      entries.push({
        kind: e.kind,
        name: e.name,
        category: e.category,
        sourcePath,
        canonicalPath: e.canonicalPath,
        packageName: manifest.package,
        version: manifest.version,
        isExtra: false,
      })
    }
    if (entries.length > 0) packages.push({ realDir, entries })
  }

  return packages
}

// Scan every node_modules/@owlmeans/*/agent-meta/ in the project tree for manifests.
const scanNodeModules = (targetDir: string): DiscoveredEntry[] => {
  const entries: DiscoveredEntry[] = []
  const seenPkgDirs = new Set<string>()

  for (const scopeDir of collectScopeDirs(targetDir)) {
    for (const pkg of scanScopeDir(scopeDir)) {
      // Skip a package already read via another (symlinked) location.
      if (seenPkgDirs.has(pkg.realDir)) continue
      seenPkgDirs.add(pkg.realDir)
      entries.push(...pkg.entries)
    }
  }

  return entries
}

/** Resolve the installer package's own agent-meta dir (for bundled extras). */
const selfAgentMetaDir = (): string | null => {
  try {
    const selfDir = dirname(fileURLToPath(import.meta.url))
    // src/ → .. → package root → agent-meta
    const candidate = join(selfDir, '..', 'agent-meta')
    return existsSync(candidate) ? candidate : null
  } catch {
    return null
  }
}

/** Scan the installer's own agent-meta/ for bundled extras. */
const scanSelfExtras = (packageName: string, version: string): DiscoveredEntry[] => {
  const agentMetaDir = selfAgentMetaDir()
  if (agentMetaDir == null) return []

  const manifestPath = join(agentMetaDir, 'manifest.json')
  const manifest = parseManifest(manifestPath)
  if (manifest == null) return []

  const entries: DiscoveredEntry[] = []
  for (const e of manifest.entries) {
    const sourcePath = join(agentMetaDir, e.file)
    if (!existsSync(sourcePath)) continue
    entries.push({
      kind: e.kind,
      name: e.name,
      category: e.category,
      sourcePath,
      canonicalPath: e.canonicalPath,
      packageName,
      version,
      isExtra: true,
    })
  }
  return entries
}

export interface DiscoverOptions {
  /** Include installer's bundled extras. Default: true */
  extras?: boolean
  /** Restrict to entries from these package names. */
  only?: string[]
}

/**
 * Collect all DiscoveredEntries, deduplicated by name.
 *
 * Only `kind: 'skill'` entries are installed. Packages published before schema v2
 * also carry `kind: 'instruction'` twins of the same knowledge (the Copilot format
 * that predates the Agent Skills standard); they are dropped here so a mixed
 * node_modules never installs both halves.
 */
export const discover = (targetDir: string, opts: DiscoverOptions = {}): DiscoveredEntry[] => {
  const { extras = true, only } = opts

  const allEntries = scanNodeModules(targetDir).filter(e => e.kind === 'skill')

  if (extras) {
    // Get installer's own package name+version from its package.json
    let selfName = '@owlmeans/agent-skills'
    let selfVersion = '0.0.0'
    try {
      const selfPkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
      if (existsSync(selfPkgPath)) {
        const pkg = JSON.parse(readFileSync(selfPkgPath, 'utf8'))
        if (pkg.name) selfName = pkg.name
        if (pkg.version) selfVersion = pkg.version
      }
    } catch { /* use defaults */ }
    allEntries.push(...scanSelfExtras(selfName, selfVersion).filter(e => e.kind === 'skill'))
  }

  // Deduplicate by name: prefer highest semver version
  const byKey = new Map<string, DiscoveredEntry>()
  for (const e of allEntries) {
    const key = e.name
    const existing = byKey.get(key)
    if (existing == null) {
      byKey.set(key, e)
    } else if (compareSemver(e.version, existing.version) > 0) {
      byKey.set(key, e)
    }
  }

  let result = Array.from(byKey.values())

  // Apply --only filter
  if (only != null && only.length > 0) {
    result = result.filter(e => only.some(n => matchPkgName(n, e.packageName)))
  }

  return result
}

/** Compare two semver strings. Returns >0 if a > b, <0 if a < b, 0 if equal. */
const compareSemver = (a: string, b: string): number => {
  const parse = (s: string): number[] =>
    s.replace(/^[^0-9]*/, '').split('.').map(n => parseInt(n, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Match package name allowing bare name without scope (@owlmeans/ prefix optional). */
const matchPkgName = (filter: string, pkgName: string): boolean => {
  if (filter === pkgName) return true
  if (!filter.startsWith('@') && pkgName === `@owlmeans/${filter}`) return true
  return false
}
