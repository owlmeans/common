import { TargetLayout } from '../consts.js'
import type { TargetLayoutManifest } from '../types.js'
import { V1_MANIFEST, V2_MANIFEST } from './consts.local.js'

/**
 * Every layout the platform is willing to run, keyed by its own name.
 *
 * Declared current-first, and the order is load-bearing: detection walks it and takes the first
 * probe it finds, so a half-migrated tree carrying both is verified against the layout the
 * platform generates today rather than against the frozen one.
 */
export const TARGET_LAYOUTS: Readonly<Record<TargetLayout, TargetLayoutManifest>> = {
  [TargetLayout.V2]: V2_MANIFEST,
  [TargetLayout.V1]: V1_MANIFEST,
}

/**
 * The files whose presence tells the layouts apart.
 *
 * Each layout's probe is a path the other cannot have. They are members of their own layout's
 * file list too, so a caller that reads {@link TARGET_INTEGRITY_FILES} always has both in hand —
 * which is the whole reason detection works at all. It did not before: the probe for the legacy
 * layout was declared but never read, so `detectTargetLayout` could only ever answer `V2`.
 */
export const TARGET_LAYOUT_PROBE_FILES: readonly string[] =
  Object.values(TARGET_LAYOUTS).map(manifest => manifest.probe)

/**
 * Files a caller must read and hand to `verifyTargetShape`.
 *
 * The UNION over every layout, because a caller reads before it knows which layout it is holding
 * and the probes are what settle that. The verifier reports only the files its selected layout
 * actually requires, so the extra reads cost a `stat` each and never a violation.
 *
 * The verifier is pure and does no IO of its own — the publisher reads these from the PVC, and
 * a test reads them from the template tree. A path that does not exist is passed as `null`,
 * which the verifier reports rather than skipping: absence is a violation for everything here.
 */
export const TARGET_INTEGRITY_FILES: readonly string[] = [
  ...new Set(Object.values(TARGET_LAYOUTS).flatMap(manifest => manifest.files)),
]

/**
 * Files no user-facing write may touch, through any path — the union over every layout.
 *
 * These are the ones that decide what gets EXECUTED — the build scripts, the package manifests
 * that name them, the compiler configuration that resolves them, and the install configuration.
 * The agent harness is here for the same reason: `.claude/settings.json` declares a
 * `SessionStart` hook and `.agents/scripts/link-skills.sh` is the command it spawns, so a write
 * to either runs code in the slot the next time an agent session opens, with no build and no
 * request involved. The agent's own generator already refuses the wiring sources
 * (`WIRING_SOURCES`), but that guard is LLM-scoped: it never saw a manual editor save and never
 * saw a git merge.
 *
 * The union rather than the current layout's list, because this is a path-shaped refusal with
 * nothing to gain from being narrow: a v2 path cannot exist in a v1 tree, so covering both costs
 * nothing and covers the legacy slots that were left writable.
 */
export const TARGET_PROTECTED_FILES: readonly string[] = [
  ...new Set(Object.values(TARGET_LAYOUTS).flatMap(manifest => manifest.protectedFiles)),
]

/**
 * The current layout's own rules, kept as named constants because consumers outside the verifier
 * ask about the tree the platform generates today — never about a frozen one.
 */
export const TARGET_BUILD_SCRIPTS: Readonly<Record<string, string>> = V2_MANIFEST.buildScripts

export const TARGET_REQUIRED_DEPS: Readonly<Record<string, readonly string[]>> =
  V2_MANIFEST.requiredDeps

export const TARGET_WORKSPACE_DEPS: Readonly<Record<string, readonly string[]>> =
  V2_MANIFEST.workspaceDeps

export const TARGET_ENTRY_MARKERS: Readonly<Record<string, readonly string[]>> = V2_MANIFEST.markers

export const TARGET_WORKSPACE_GLOB = V2_MANIFEST.workspaceGlob

export const TARGET_WORKSPACE_ENTRIES: readonly string[] = V2_MANIFEST.workspaceEntries
