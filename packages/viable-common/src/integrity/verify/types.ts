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
   * part of the read set and never reported missing) names two or more apps, carries a STRUCTURE, or
   * names any package beyond the five core ones under `sources/`, is verified AGAINST THE RECORD. Each
   * recorded package is classified: a core package (its own rules, as always); an extra app's web or
   * api, or a structure part's api, web or worker package (the core api, web or worker rules: exact
   * build script, no lifecycle script, `<slug>-<dir>`, module type, required and workspace
   * dependencies, entry and rollup markers); a structure's library part (`package.json`,
   * `tsconfig.json`, `src/index.ts`, `<slug>-<dir>`, module type, exactly `tsc -b`, no lifecycle
   * script); or OTHER — an adopted or pulled package. An OTHER `library` needs its build to be exactly
   * `tsc -b` (both sides trimmed) and no lifecycle script — its name and module type are the person's;
   * its manifest is `missing` when the listing shows its directory, since a build there would run the
   * root's. An OTHER `bundle` carries no lifecycle script and is never built or run
   * ({@link buildOrderOf}). The record's app list answers to `app-map`, its structure to
   * `structure-map`, and each part's `workspace:` siblings to `part-dependency`. When `tree` lists
   * `sources/` (every V2 caller that can), each package there the record does not name is refused by
   * `workspace-package` in a tree split into apps or carrying a structure, and treated as an
   * unclassified bundle — no lifecycle script, unreadable refused — in any other V2 tree. A clean tree
   * with no record, or a record of the five core packages and one app, gets exactly the report it
   * always got. A caller that never read what `readPlan` names gets it reported `missing`: an unmoved
   * caller fails closed on record-mode trees only.
   */
  verifyTargetShape: (files: TargetFileMap, tree?: TargetIntegrityTree) => TargetIntegrityReport
  /** One line per violation — what goes into a log, `slot.lastError`, or a build diagnostic. */
  formatIntegrityReport: (report: TargetIntegrityReport) => string
  /**
   * What else to read, from the files already read — pure. Every V2 tree: the `sources/` listing (and,
   * through {@link collectTargetFiles}, the manifest of every listed package the record does not
   * name); a tree verified against its record also every extra app's and structure part's package
   * files and every OTHER recorded package's manifest. A V1 tree: nothing.
   */
  readPlan: (files: TargetFileMap) => TargetIntegrityPlan
  /**
   * Read a tree for {@link verifyTargetShape} through the caller's IO, in two passes: the base set,
   * then what `readPlan` asks for (the record's packages, the listing and the manifest of every listed
   * package the record does not name). `read` answers `null` for anything unreadable.
   */
  collectTargetFiles: (read: TargetFileReader, list: TargetDirLister) => Promise<TargetFileCollection>
  /**
   * The files no user-facing write may touch in this project: `TARGET_PROTECTED_FILES` plus each
   * extra app package's and structure api, web or worker part's `package.json`, `tsconfig.json`,
   * `rollup.config.js` and `rollup.build.mjs`, and each structure library part's `package.json` and
   * `tsconfig.json` — what the core packages protect.
   */
  protectedFilesOf: (record: TopologyDescriptor | null) => string[]
  /**
   * The packages of a V2 record the platform builds, in dependency order: the record's build order
   * without a bundle that is neither core, nor an extra app pair's (`apps`), nor a structure part's (a
   * valid `structure`) — an adopted one, which nothing ever runs. Every library builds, a structure's
   * library parts included. A record of the five core packages answers its build order unchanged.
   */
  buildOrderOf: (record: TopologyDescriptor) => string[]
}
