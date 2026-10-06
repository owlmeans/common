import type { TargetFileMap, TargetIntegrityReport } from '@owlmeans/viable-common'

/**
 * Whether a directory still holds the generated application — the check in front of every spawn.
 *
 * The verdict is memoized for a couple of seconds, process-wide, and dropped wherever the
 * connector itself changes the tree.
 */
export interface IntegrityHelper {
  /** Read the manifest's files from a tree; a path that cannot be read comes back as `null`. */
  readTargetFiles: (dir: string) => Promise<TargetFileMap>
  /** Verify the tree, reusing a verdict from the last couple of seconds. */
  verifyTarget: (dir: string) => Promise<TargetIntegrityReport>
  /** Drop the memoized verdict — called wherever the connector itself changes the tree. */
  forgetIntegrity: () => void
  /**
   * The refusal text a build or shell command answers with, or `null` when the tree is fine.
   *
   * Text and not an exception, because "error text or null" is the contract every shell command
   * already answers with — a caller needs no new branch to notice a refusal, and the diagnostics
   * reach the person whose tree they belong to through the channel that already carries a failed
   * build.
   */
  integrityRefusal: (dir: string, prefix?: string) => Promise<string | null>
}
