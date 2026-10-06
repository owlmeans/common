import type { ConnectMarker } from '@owlmeans/viable-common'
import type { DiscoveredProject } from '../types.js'

/**
 * What a local project keeps so a later session knows which platform project it is — read and
 * written for ONE directory.
 *
 * No secrets: an id, a slug and the API it belongs to. A connector attaching to a directory has
 * nothing else to go on — the tree itself is a generated application like any other, and asking
 * the platform "which of my projects is this" needs an id the tree already carries.
 */
export interface MarkerHelper {
  /** The marker this directory carries, or `null` when it carries none or an unreadable one. */
  readMarker: () => Promise<ConnectMarker | null>
  writeMarker: (marker: ConnectMarker) => Promise<void>
  /**
   * Find the project this directory belongs to, by walking up from it.
   *
   * An agent is started wherever its user happened to be — usually several levels inside the tree —
   * and every tool that acts on "this project" has to mean the same one whichever of those
   * directories it was asked from. The walk stops at the filesystem root; a machine with no marker
   * anywhere above answers `null`, which is how a connector knows to offer attaching rather than
   * assuming.
   */
  discoverProject: () => Promise<DiscoveredProject | null>
  /**
   * Whether this directory holds the generated application.
   *
   * Asked before a connector offers to drive a directory, so a person who pointed it at the wrong
   * folder learns that from a sentence rather than from a build that refuses everything.
   */
  isViableTree: () => Promise<boolean>
}
