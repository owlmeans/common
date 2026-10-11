

export interface ApplyResult {
  installed: number
  updated: number
  skipped: number
  conflicts: number
  linked: number
}

export interface CliArgs {
  dir: string
  yes: boolean
  only: string[]
  /** @deprecated no-op — skills install to `.agents/skills/` for every agent. */
  claudeOnly?: boolean
  /** @deprecated no-op — skills install to `.agents/skills/` for every agent. */
  copilotOnly?: boolean
  extras: boolean
  force: boolean
  dryRun: boolean
  help: boolean
}

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

export interface DiscoverOptions {
  /** Include installer's bundled extras. Default: true */
  extras?: boolean
  /** Restrict to entries from these package names. */
  only?: string[]
}

export interface LinkedResult {
  linked: boolean
  /** Symlinked package names found in node_modules. */
  evidence: string[]
}

export type InstallAction =
  | 'install'       // target missing → write
  | 'skip-uptodate' // bytes identical → no-op
  | 'update'        // managed (banner present) and differs → overwrite
  | 'conflict'      // local edit (no banner) and differs → skip or prompt

export interface InstallItem {
  entry: DiscoveredEntry
  targetPath: string
  action: InstallAction
}

export interface PlanOptions {
  /** Treat conflicts as 'overwrite' (--force). */
  force?: boolean
}

export type RunResult =
  | { code: 0 }
  | { code: 2; message: string }  // CLI parse
  | { code: 3; message: string }  // nothing found
  | { code: 4; message: string }  // linked refusal
  | { code: 5; message: string }  // unresolved conflicts
