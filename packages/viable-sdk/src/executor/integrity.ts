import fs from 'fs-extra'
import p from 'node:path'

import { targetIntegrityHelper, type TargetFileCollection, type TargetFileMap, type TargetIntegrityReport } from '@owlmeans/viable-common'
import { VERDICT_TTL_MS } from './consts.local.js'
import type { IntegrityHelper } from './integrity/types.js'

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

// Process-wide on purpose: every executor of this process shares the verdict, and every one of them
// forgets it when it changes the tree.
let _cached: { at: number, root: string, report: TargetIntegrityReport } | null = null

export const createIntegrityHelper = (): IntegrityHelper => {
  // The manifest follows the record, exactly as the publisher reads it: the base set first, then what
  // the topology record of a project split into apps asks for — its extra app packages and the
  // `sources/` listing. A one-pass reader sees a split tree's app packages as missing and refuses it.
  const collectTargetFiles = async (dir: string): Promise<TargetFileCollection> =>
    await targetIntegrityHelper.collectTargetFiles(
      async file => await fs.readFile(p.join(dir, file), 'utf-8').catch(() => null),
      async sub => await fs.readdir(p.join(dir, sub)).catch(() => [] as string[]),
    )

  const readTargetFiles = async (dir: string): Promise<TargetFileMap> => (await collectTargetFiles(dir)).files

  const verifyTarget = async (dir: string): Promise<TargetIntegrityReport> => {
    if (_cached != null && _cached.root === dir && Date.now() - _cached.at < VERDICT_TTL_MS) {
      return _cached.report
    }

    const { files, workspaceDirs } = await collectTargetFiles(dir)
    // The listing exists only for a split tree; any other tree is verified exactly as before.
    const report = workspaceDirs != null
      ? targetIntegrityHelper.verifyTargetShape(files, { workspaceDirs })
      : targetIntegrityHelper.verifyTargetShape(files)
    _cached = { at: Date.now(), root: dir, report }

    return report
  }

  const forgetIntegrity = (): void => { _cached = null }

  const integrityRefusal = async (dir: string, prefix = 'Refused'): Promise<string | null> => {
    const report = await verifyTarget(dir)

    return report.ok
      ? null
      : `${prefix}: the project in this directory is not a Viable application\n`
        + targetIntegrityHelper.formatIntegrityReport(report)
  }

  return { readTargetFiles, collectTargetFiles, verifyTarget, forgetIntegrity, integrityRefusal }
}

export const integrityHelper = createIntegrityHelper()

/** @deprecated compat:factory-refactor — use `integrityHelper.readTargetFiles(…)` */
export const readTargetFiles = async (dir: string): Promise<TargetFileMap> => await integrityHelper.readTargetFiles(dir)
