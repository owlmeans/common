import type { SlotGitCommand } from '@owlmeans/viable-common'

/**
 * Git in ONE local project directory, answered the way the publisher answers a slot's git
 * commands. Every dispatch is serialized per directory: git takes `.git/*.lock` files for the
 * duration of a write, so two concurrent operations on one repository fail.
 */
export interface LocalGitHelper {
  /**
   * Answer one `SlotGitCommand` against the directory. The three that touch a remote, and a clone,
   * are refused as TEXT in the shape their caller parses — a policy, not a failure.
   */
  dispatchGitCommand: (command: SlotGitCommand, args?: Record<string, any>) => Promise<Record<string, unknown>>
  /**
   * Make the directory a repository the platform can work in, and change nothing else: no baseline
   * commit, and an identity only when there is none.
   */
  ensureGitRepo: () => Promise<void>
}
