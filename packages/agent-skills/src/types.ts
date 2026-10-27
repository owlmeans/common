

export interface ApplyResult {
  installed: number
  updated: number
  skipped: number
  conflicts: number
  linked: number
  /** Generated part files removed because their skill no longer lists them. */
  pruned: number
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

/**
 * One part of a chunked skill (manifest schemaVersion 3): a purpose-sized chunk embedded beside the
 * skill's core `SKILL.md`. `purposes` and `mentions` are what a prompt plugin selects it by — they
 * are read from here, never from the part file.
 */
export interface ManifestPart {
  /** The part's file stem, unique within its package; addressed as `@owlmeans/<pkg>#<name>`. */
  name: string
  /** Relative path within agent-meta/: `skills/<skill>/parts/<name>.md`. */
  file: string
  description: string
  purposes: string[]
  mentions: string[]
}

export interface ManifestEntry {
  kind: 'skill' | 'instruction'
  name: string
  category: 'package-specific' | 'multi-package' | 'general'
  file: string
  canonicalPath: string
  /** Present from schemaVersion 3 on a skill that is split into parts; older readers ignore it. */
  parts?: ManifestPart[]
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
  /** The skill's parts that passed validation, each with its embedded source; absent when unsplit. */
  parts?: DiscoveredPart[]
}

/** A part found beside a discovered skill. */
export interface DiscoveredPart extends ManifestPart {
  /** Absolute path to the embedded part file. */
  sourcePath: string
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
  | 'prune'         // a generated part the skill no longer lists → remove

export interface InstallItem {
  entry: DiscoveredEntry
  /** The part this item writes or prunes; absent for the skill's own `SKILL.md`. */
  part?: string
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
