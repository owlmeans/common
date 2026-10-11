import fs from 'fs-extra'
import p from 'node:path'

import { CONNECT_MARKER_DIR, CONNECT_MARKER_FILE, type ConnectMarker } from '@owlmeans/viable-common'

import { integrityHelper } from '../executor/integrity.js'
import type { DiscoveredProject } from './types.js'
import type { MarkerHelper } from './marker/types.js'

/**
 * What a local project keeps so a later session knows which platform project it is.
 *
 * No secrets: an id, a slug and the API it belongs to. A connector attaching to a directory has
 * nothing else to go on — the tree itself is a generated application like any other, and asking
 * the platform "which of my projects is this" needs an id the tree already carries.
 */
export const makeMarkerHelper = (dir: string): MarkerHelper => {
  const markerAt = async (at: string): Promise<ConnectMarker | null> => {
    const content = await fs.readFile(p.join(at, CONNECT_MARKER_FILE), 'utf-8').catch(() => null)
    if (content == null) return null

    try {
      const parsed: unknown = JSON.parse(content)

      return typeof parsed === 'object' && parsed !== null ? parsed as ConnectMarker : null
    } catch {
      // A half-written or hand-edited marker is the same as none: the connector re-attaches by
      // slug and writes a fresh one, which is strictly better than refusing to open the project.
      return null
    }
  }

  const readMarker = async (): Promise<ConnectMarker | null> => await markerAt(dir)

  const writeMarker = async (marker: ConnectMarker): Promise<void> => {
    await fs.ensureDir(p.join(dir, CONNECT_MARKER_DIR))
    await fs.writeFile(
      p.join(dir, CONNECT_MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`
    )
  }

  const discoverProject = async (): Promise<DiscoveredProject | null> => {
    let at = p.resolve(dir)
    for (;;) {
      const marker = await markerAt(at)
      if (marker != null) {
        return { dir: at, marker }
      }

      const parent = p.dirname(at)
      if (parent === at) {
        return null
      }
      at = parent
    }
  }

  const isViableTree = async (): Promise<boolean> =>
    (await integrityHelper.verifyTarget(dir)).ok

  return { readMarker, writeMarker, discoverProject, isViableTree }
}

/** @deprecated compat:factory-refactor — use `makeMarkerHelper(startDir).discoverProject()` */
export const discoverProject = async (startDir: string): Promise<DiscoveredProject | null> =>
  await makeMarkerHelper(startDir).discoverProject()
