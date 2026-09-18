import fs from 'fs-extra'
import p from 'node:path'

import { formatIntegrityReport, TARGET_INTEGRITY_FILES, verifyTargetShape } from '@owlmeans/viable-common'
import type { TargetFileMap, TargetIntegrityReport } from '@owlmeans/viable-common'

/**
 * Whether this directory still holds the generated application.
 *
 * The publisher is authoritative for a slot because it is the only process holding the volume at
 * the moment of a spawn; on a developer's machine the connector is in exactly that position. What
 * gets EXECUTED comes out of the tree — `bun run build` reads `scripts.build` from a
 * `package.json` on disk, `bun install` runs whatever lifecycle hooks it declares, and
 * `bun dist/index.js` runs whatever the build emitted — and here it runs as the developer, with
 * their environment and their credentials in scope. So the check sits in front of every spawn,
 * not in front of the callers somebody remembered to guard.
 *
 * Deliberately structural and model-free: thirty-odd file reads and a list of exact strings. The
 * question is not whether a program is good; it is whether this tree is the one we generated.
 */

/**
 * How long a clean verdict is reused.
 *
 * Short on purpose. The check runs before every spawn — the build, the backend start, the boot
 * check, every `bun` invocation — and several of those run back to back inside one operation. A
 * longer window would let a write land between the check and the spawn it was meant to guard, so
 * this is a de-duplication of one burst, not a cache.
 */
const VERDICT_TTL_MS = 2_000

let _cached: { at: number, root: string, report: TargetIntegrityReport } | null = null

/** Read the manifest's files from a tree; a path that cannot be read comes back as `null`. */
export const readTargetFiles = async (dir: string): Promise<TargetFileMap> => {
  const entries = await Promise.all(TARGET_INTEGRITY_FILES.map(async file =>
    [file, await fs.readFile(p.join(dir, file), 'utf-8').catch(() => null)] as const))

  return Object.fromEntries(entries)
}

/** Verify the tree, reusing a verdict from the last couple of seconds. */
export const verifyTarget = async (dir: string): Promise<TargetIntegrityReport> => {
  if (_cached != null && _cached.root === dir && Date.now() - _cached.at < VERDICT_TTL_MS) {
    return _cached.report
  }

  const report = verifyTargetShape(await readTargetFiles(dir))
  _cached = { at: Date.now(), root: dir, report }

  return report
}

/** Drop the memoized verdict — called wherever the connector itself changes the tree. */
export const forgetIntegrity = (): void => { _cached = null }

/**
 * The refusal text a build or shell command answers with, or `null` when the tree is fine.
 *
 * Text and not an exception, because "error text or null" is the contract every shell command
 * already answers with — a caller needs no new branch to notice a refusal, and the diagnostics
 * reach the person whose tree they belong to through the channel that already carries a failed
 * build.
 */
export const integrityRefusal = async (dir: string, prefix = 'Refused'): Promise<string | null> => {
  const report = await verifyTarget(dir)

  return report.ok
    ? null
    : `${prefix}: the project in this directory is not a Viable application\n`
      + formatIntegrityReport(report)
}
