import path from 'node:path'

import { CENSUS_SKIP_DIRS, CONNECT_MARKER_DIR, LAYOUT_MARKERS, type TargetLayout } from '@owlmeans/viable-common'

export const STARTUP_LOG_CAP = 16_384

/**
 * Outer bound on one boot-check job.
 *
 * `runBootCheck` caps its own ready poll but not the build in front of it, so this is the only
 * thing that guarantees a poller eventually reads `running: false` — a check that outlives it is
 * abandoned, not awaited.
 */
export const WATCHDOG_MS = 600_000

/** Keys the frontend build injects on its own, so they are never announced as extras. */
export const FRONTEND_STANDARD_KEYS = new Set([
  'FRONTEND_PORT', 'FRONTEND_HOST', 'BACKEND_HOST', 'BACKEND_PORT', 'BACKEND_BASE_URL',
  'BASE_URL', 'FRONTEND_ENV_KEYS', 'SOURCEMAP',
])

/**
 * What a tree walk never descends into.
 *
 * {@link CENSUS_SKIP_DIRS} is the shared half — the two directories that are never the repository
 * in any tree, spread from `@owlmeans/viable-common` rather than restated, because the publisher
 * and the library-local helper walk the SAME question and a caller cannot tell which executor
 * produced the listing it is holding. This one used to add `dist`, `build` and `.next` on top,
 * which are ordinary directory names an origin may keep sources in: the same repository then had
 * one `total` here and another one in the slot.
 *
 * {@link CONNECT_MARKER_DIR} is added for a reason that belongs to this executor alone: it is THIS
 * CONNECTOR's directory, not the origin's. It holds the local key pair and the run record and
 * never a line of the application, while a census exists to be followed by a `readHead` of what it
 * listed — and nothing downstream knows which of the two wrote a path.
 */
export const WALK_SKIP = new Set([...CENSUS_SKIP_DIRS, CONNECT_MARKER_DIR])

/**
 * The git half of the local executor, over the `git` CLI.
 *
 * The platform's own implementation is `@owlmeans/git`, which is private and carries `simple-git`
 * and a GitHub client — neither of which may reach a package a developer installs to drive their
 * own machine. So the semantics are ported and the two constants below are copied, with this
 * comment as the record of where they came from: a connector that invented its own author name
 * would produce a history that does not match what the platform writes for the same project in a
 * slot.
 */
export const DEFAULT_BRANCH = 'main'

export const DEFAULT_GIT_USER_NAME = 'OwlMeans Viable'

export const DEFAULT_GIT_USER_EMAIL = 'agent@owlmeans.com'

export const LOG_LIMIT = 20

export const STATUS_FILES_CAP = 50

// Unit separator: it cannot appear in any of the fields, so a subject with tabs or spaces in it
// still parses.
export const LOG_FORMAT = '--format=%H%x1f%h%x1f%an%x1f%ae%x1f%cI%x1f%s'

/**
 * How long a clean verdict is reused.
 *
 * Short on purpose. The check runs before every spawn — the build, the backend start, the boot
 * check, every `bun` invocation — and several of those run back to back inside one operation. A
 * longer window would let a write land between the check and the spawn it was meant to guard, so
 * this is a de-duplication of one burst, not a cache.
 */
export const VERDICT_TTL_MS = 2_000

/** How long a port may stay bound after the process holding it was told to die. */
export const PORT_FREE_TIMEOUT = 10_000

export const PORT_POLL_MS = 200

export const TERM_TIMEOUT = 5_000

export const KILL_TIMEOUT = 2_000

/** What every target process runs; the marker is what tells the three of them apart. */
export const TARGET_SCRIPT = 'dist/index.js'

/** Each layout's marker file, as a path of this platform — the probe `detectLayout` runs per call. */
export const LAYOUT_MARKER_PATHS: Array<[TargetLayout, string]> = LAYOUT_MARKERS.map(
  ([layout, marker]) => [layout, path.join(...marker.split('/'))]
)
