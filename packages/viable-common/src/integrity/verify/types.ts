import type { TargetFileMap, TargetIntegrityReport } from '../types.js'

/** The integrity verdict on a target tree, and its one-line-per-violation rendering. */
export interface TargetIntegrityHelper {
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
  verifyTargetShape: (files: TargetFileMap) => TargetIntegrityReport
  /** One line per violation — what goes into a log, `slot.lastError`, or a build diagnostic. */
  formatIntegrityReport: (report: TargetIntegrityReport) => string
}
