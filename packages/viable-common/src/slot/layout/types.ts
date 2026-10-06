import type { TargetLayout } from '../../integrity/consts.js'
import type { SubProject } from '../consts.js'
import type { TargetPaths } from '../types.js'

/** Where a target's roles live, per layout — read off {@link LAYOUTS} and {@link ROLE_DIRS}. */
export interface SlotLayoutHelper {
  /**
   * Resolve a wire-level role to the directory it names in a given layout.
   *
   * An unknown value — a role from a sender newer than this reader — falls back to the role's own
   * name, which is the honest guess for a layout whose packages are named after their roles, and
   * which fails visibly rather than resolving to some other package's directory.
   */
  subprojectDirOf: (layout: TargetLayout, role: SubProject) => string
  /** Where every role lives, for a layout already decided. */
  pathsOf: (layout: TargetLayout) => TargetPaths
}
