import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

// Scan node_modules/@owlmeans/*/agent-meta/ for manifests.
const scanNodeModules = (targetDir: string): DiscoveredEntry[] => {
  const nmDir = join(targetDir, 'node_modules', '@owlmeans')
  if (!existsSync(nmDir)) return []

  const entries: DiscoveredEntry[] = []
  let pkgDirs: string[]
  try {
    pkgDirs = readdirSync(nmDir)
  } catch {
    return []
  }

  for (const pkgDir of pkgDirs) {
    const manifestPath = join(nmDir, pkgDir, 'agent-meta', 'manifest.json')
    if (!existsSync(manifestPath)) continue
    const manifest = parseManifest(manifestPath)
    if (manifest == null) continue

    const agentMetaDir = join(nmDir, pkgDir, 'agent-meta')
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
  /** Install only skills. */
  claudeOnly?: boolean
  /** Install only instructions. */
  copilotOnly?: boolean
}

/** Collect all DiscoveredEntries, deduplicated by (kind, name). */
export const discover = (targetDir: string, opts: DiscoverOptions = {}): DiscoveredEntry[] => {
  const { extras = true, only, claudeOnly = false, copilotOnly = false } = opts

  const allEntries = scanNodeModules(targetDir)

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
    allEntries.push(...scanSelfExtras(selfName, selfVersion))
  }

  // Deduplicate by (kind, name): prefer highest semver version
  const byKey = new Map<string, DiscoveredEntry>()
  for (const e of allEntries) {
    const key = `${e.kind}:${e.name}`
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

  // Apply tool filters
  if (claudeOnly) result = result.filter(e => e.kind === 'skill')
  if (copilotOnly) result = result.filter(e => e.kind === 'instruction')

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
