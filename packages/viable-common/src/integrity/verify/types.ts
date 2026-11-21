import type { TopologyDescriptor } from '../../topology/types.js'
import type {
  TargetDirLister, TargetFileCollection, TargetFileMap, TargetFileReader, TargetIntegrityPlan, TargetIntegrityReport,
  TargetIntegrityTree,
} from '../types.js'

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
   *
   * **The manifest follows the record.** A V2 tree whose topology record (`.agents/memory/topology.md`,
   * part of the read set and never reported missing) names two or more apps is verified in APPS
   * MODE: every extra app's web and api package is held to main's web and api rules (exact build
   * script, no lifecycle script, `<slug>-<app>-web|api`, module type, required and workspace
   * dependencies, entry and rollup markers), the record's app list to `app-map`, and — when `tree`
   * lists `sources/` — every package there to `workspace-package`. A tree with no record, or a record
   * of one app, gets exactly the report it always got. A caller that never read the app packages
   * (`readPlan`) gets them reported `missing`: an unmoved caller fails closed on split trees only.
   */
  verifyTargetShape: (files: TargetFileMap, tree?: TargetIntegrityTree) => TargetIntegrityReport
  /** One line per violation — what goes into a log, `slot.lastError`, or a build diagnostic. */
  formatIntegrityReport: (report: TargetIntegrityReport) => string
  /**
   * What else to read, from the files already read — pure. Split project: every extra app's
   * package files and the `sources/` listing; anything else: nothing.
   */
  readPlan: (files: TargetFileMap) => TargetIntegrityPlan
  /**
   * Read a tree for {@link verifyTargetShape} through the caller's IO, in two passes: the base set,
   * then what the record asks for (the app packages, the listing and the manifest of every listed
   * package the record does not name). `read` answers `null` for anything unreadable.
   */
  collectTargetFiles: (read: TargetFileReader, list: TargetDirLister) => Promise<TargetFileCollection>
  /**
   * The files no user-facing write may touch in this project: `TARGET_PROTECTED_FILES` plus each
   * extra app package's `package.json`, `tsconfig.json`, `rollup.config.js` and `rollup.build.mjs`.
   */
  protectedFilesOf: (record: TopologyDescriptor | null) => string[]
}
