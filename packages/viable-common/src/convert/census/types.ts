import type { DumpKind, EntropyClass, FileClass, SizeClass, WorkspaceKind } from '../consts.js'

/**
 * The census's file classification: pure, deterministic derivations over the conversion
 * vocabulary.
 *
 * Everything here answers the same way for the same input, in every runtime, forever — which is
 * what makes the documents a conversion writes byte-stable across two runs, and therefore what
 * makes the prompt cache prefix they are injected into actually hit. Nothing here reads a file,
 * calls a model or looks at a clock.
 */
export interface CensusHelper {
  /** Which {@link SizeClass} a byte count falls in. Boundaries are exclusive upper bounds. */
  sizeClassOf: (bytes: number) => SizeClass
  /**
   * What one file of the origin is.
   *
   * Location outranks the tail wherever it says more — a `.ts` under `__tests__/` is a test, a
   * `.json` under `seed/` is data — but only where it says more. The seed/dump rule therefore runs
   * AFTER the extension table and applies only to {@link DATA_OVERRIDABLE}: asked first, it answered
   * `Data` for every path merely containing the word (`tests/fixtures/user.ts`, `src/seedUsers.ts`,
   * `src/exportReport.ts`), which is the census's source budget spent on the wrong files twice over.
   */
  fileClassOf: (path: string, ext: string) => FileClass
  /**
   * The binary verdict a path already carries, or `null` for a file that has to be probed.
   *
   * The three executors that walk a tree — the library-local helper, the publisher and the connector
   * SDK — must answer the same verdict for the same file, and a probe alone does not: a small `.ico`
   * with no NUL in its first bytes reads as text, so a census run on a laptop and the same census
   * run in the slot disagreed about the same repository. The tail is asked first and the probe only
   * where the tail says nothing, which is also why the probe is affordable at census scale — the
   * extensions above are the bulk of any repository.
   *
   * The extension is taken exactly the way `path.extname` takes it, because two of the three callers
   * used to: the last dot of the last SEGMENT, and nothing for a name with no dot or for a dotfile.
   */
  binaryByExtension: (path: string) => boolean | null
  /**
   * How usable a file's head is as evidence.
   *
   * The printable ratio over the sampled head, and nothing cleverer: the question is only whether a
   * model can read it. A minified bundle is printable and useless, so a second rule catches the
   * shape that gives it away — very long lines with almost no whitespace.
   */
  entropyClassOf: (head: string) => EntropyClass
  /** Whether a path names bulk data — an export, not the application's own data. */
  isBulkPath: (path: string) => boolean
  /** Whether a path names seed data — what the application needs in order to make sense. */
  isSeedPath: (path: string) => boolean
}

/**
 * {@link FileStat} is declared in `../../slot/types.js`, not here.
 *
 * It is the element of a `statTree` answer, and a slot command's result shape belongs to the slot
 * vocabulary the publisher and the connector both implement. Redeclaring it beside the census that
 * consumes it would give the root barrel two `FileStat`s and the two would drift the first time
 * one end added a field.
 */

/** One file, as the census classified it. `read` says whether its head was actually opened. */
export interface FileCensusEntry {
  path: string
  bytes: number
  ext: string
  cls: FileClass
  size: SizeClass
  entropy?: EntropyClass
  read: boolean
}

/** A package manifest found in the origin, and what it declares. */
export interface InventoryPackage {
  name?: string
  path: string
  /** The manifest file itself, root-relative — `package.json`, `pom.xml`, `go.mod`, … */
  manifest: string
  /** `member` for a package a workspace root declares; otherwise the workspace kind it declares. */
  kind: WorkspaceKind | 'member'
  deps: string[]
  scripts: Record<string, string>
  /** Whether something in the tree actually reaches it. See {@link UnlinkedRef}. */
  linked: boolean
}

export interface WorkspaceMember {
  name?: string
  path: string
  /** The manifest that declared this member. */
  declaredBy: string
  present: boolean
}

export interface SubmoduleRef {
  path: string
  url?: string
  present: boolean
}

/**
 * A directory holding code that nothing in the workspace declares, or a declaration with nothing
 * behind it.
 *
 * Reported rather than silently included: code the build never sees is code the origin does not
 * run, and converting it produces stories for behaviour the application does not have.
 */
export interface UnlinkedRef {
  path: string
  reason: 'not-a-member' | 'missing-submodule' | 'declared-not-present'
}

export interface WorkspaceReport {
  kind: WorkspaceKind
  globs: string[]
  members: WorkspaceMember[]
  submodules: SubmoduleRef[]
  unlinked: UnlinkedRef[]
}

/** A data file the origin carries that is too large, or too generated, to become seed data. */
export interface DumpRecord {
  path: string
  kind: DumpKind
  bytes: number
  format: string
  rows?: number
  /** At most {@link DUMP_SAMPLE_LINES} lines, read from the head. Never the whole file. */
  sample: string[]
  columns?: string[]
}

/** A small data file the code itself references — the data the application needs to make sense. */
export interface SeedRecord {
  name: string
  path: string
  bytes: number
  format: string
  rows?: number
  /** The source files that name it. The proof that it is seed rather than an export. */
  referencedBy: string[]
  carried: boolean
  /** Where it was written in the target, once carried. */
  target?: string
}

export interface InventorySummary {
  root: string
  files: number
  bytes: number
  read: number
  skipped: number
  /** A census that hit {@link CENSUS_MAX_ENTRIES}. Everything downstream must say so. */
  truncated: boolean
  byClass: Record<FileClass, number>
  bySize: Record<SizeClass, number>
  extensions: { ext: string, files: number, bytes: number }[]
  packages: InventoryPackage[]
  workspace: WorkspaceReport
  dumps: DumpRecord[]
  seeds: SeedRecord[]
  manifests: string[]
  vcs: { git: boolean, submodules: number }
  version: number
  takenAt: string
}

/** One data file, classified by the model where the path and the size alone were not enough. */
export interface SeedDetectionItem {
  path: string
  name: string
  /** Whether it is data the application needs rather than an export of what it produced. */
  seed: boolean
  /** Whether it should be carried into the target. */
  carry: boolean
  reason: string
}

export interface SeedDetection {
  items: SeedDetectionItem[]
}
