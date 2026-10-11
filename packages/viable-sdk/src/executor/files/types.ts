import type { StatTreeResult, SubProject } from '@owlmeans/viable-common'
import type { LocalSourceFile, SourceListOptions } from '../types.js'

/**
 * The target's files, as the platform asks for them.
 *
 * Shaped exactly like the publisher's `createFileHelper`, because the caller is the same code:
 * the agent's remote helper sends a `SlotFileCommand` and parses one of these answers, and it has
 * no way to know whether a pod or a laptop produced it.
 */
export interface LocalFileHelper {
  /**
   * Wipe the project, keeping what the caller names and what is never ours to delete.
   *
   * The kept paths are project-relative and may be NESTED — `.agents/memory/history.md` is one
   * the reinit pipeline passes, and `sources/web/.env` is one this helper adds itself. Matching
   * them against top-level `readdir` names alone is what deleted the first: `.agents` matched
   * nothing in the ignore set, so the whole harness tree went along with the one file the
   * caller had explicitly asked to preserve — and nothing failed.
   *
   * So a directory is removed whole only when nothing kept lives under it; otherwise it is
   * walked and pruned entry by entry.
   */
  emptyProject: (ignore?: string[]) => Promise<void>
  deleteProject: () => Promise<void>
  /**
   * Finish an installed template: make sure the root manifest declares its workspaces.
   *
   * The agent pushes every template file itself, so this is only the finalizer. The workspace
   * list is written only when the manifest does not already declare one — the template ships
   * `["sources/*"]`, and injecting the explicit list beside it produced a manifest carrying the
   * key TWICE, valid only because JSON keeps the last one.
   */
  initializeProject: () => Promise<void>
  getSourceList: (pattern?: string, options?: SourceListOptions) => Promise<string[]>
  getStructuredList: (patterns: string[]) => Promise<string[]>
  readFile: (path: string, notThrow?: boolean) => Promise<string>
  readSource: (filePath: string) => Promise<LocalSourceFile>
  readPossibleSource: (filePath: string) => Promise<LocalSourceFile>
  readSources: (files: string | string[]) => Promise<LocalSourceFile[]>
  writeFile: (filePath: string, content: string) => Promise<void>
  writeSource: (file: { path: string, code: string }) => Promise<void>
  deleteFile: (filePath: string, noThrow?: boolean) => Promise<void>
  /**
   * The tree, one line per file, bounded.
   *
   * One command rather than a listing plus a read per entry: the caller is a census over a
   * repository somebody else wrote, which may hold a hundred thousand files, and one round trip
   * each — over a connector, on somebody's laptop — is not a slower walk but a walk that never
   * finishes.
   *
   * `total` counts what the walk SAW and `entries` what it returned. They differ once the limit
   * is reached, and that difference is the only thing that tells a caller its picture of the
   * tree is partial: a listing that reported only its own length would be indistinguishable
   * from a small repository.
   *
   * Every entry's `path` is relative to the directory ASKED FOR, not to the project root. That
   * is the contract the in-process helper and the publisher answer, and one executor answering
   * a different relativity is worse than either choice: the caller is a census that follows a
   * listing with a `readHead` of what it listed, and nothing downstream knows which of the
   * three produced the path it is holding.
   */
  statTree: (dir?: string, limit?: number) => Promise<StatTreeResult>
  /**
   * The first bytes of one file, decoded as text.
   *
   * A classification reads a head; reading whole files to do it would hold a megabyte export in
   * memory to look at its first line. Whatever the decoding produces for a binary head is the
   * answer — that IS the signal an entropy classification wants, and cleaning it up would hide
   * the one thing the caller is asking about.
   */
  readHead: (filePath: string, bytes: number) => Promise<string>
  /**
   * Move everything in the project root under one directory, leaving a named few where they are.
   *
   * What makes a converted project possible: the origin's own tree goes below, a Viable target
   * is grown above it, and the two never share a path. It is the same walk `emptyProject` does —
   * kept paths may be nested, a directory holding one is walked rather than moved, and a
   * directory left empty by that walk does not survive as a shell.
   *
   * The always-keep set applies here too and for the same reason: `.git` is the developer's
   * history and moving it under the origin would take the project's whole history with it,
   * `.viable` is how a later session recognizes the project, and the two `.env` files hold what
   * the platform cannot re-derive.
   *
   * Refuses a destination that already holds something. A relocation into an occupied directory
   * interleaves two trees, and nothing afterwards can tell which files came from where.
   */
  relocate: (dir: string, keep?: string[]) => Promise<{ moved: number, kept: string[] }>
  /**
   * Delete a directory and everything under it — the purge of a relocated origin.
   *
   * Refuses the project root: emptying the project is `emptyProject`, which has a keep list this
   * does not, and a purge that resolved to `.` would take the developer's `.git` and `.env` with
   * the origin it was asked to remove.
   */
  removeTree: (dir: string) => Promise<void>
  getRootPath: (subproject?: SubProject) => string
  findFilesWithEnvVars: (frontend?: boolean) => Promise<string[]>
}
