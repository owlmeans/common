import fs from 'fs-extra'
import p from 'node:path'

import { CONNECT_MARKER_DIR, CONNECT_MARKER_FILE } from '@owlmeans/viable-common'
import type { ConnectMarker } from '@owlmeans/viable-common'

import { verifyTarget } from '../executor/integrity.js'

/**
 * What a local project keeps so a later session knows which platform project it is.
 *
 * No secrets: an id, a slug and the API it belongs to. A connector attaching to a directory has
 * nothing else to go on — the tree itself is a generated application like any other, and asking
 * the platform "which of my projects is this" needs an id the tree already carries.
 */

export interface DiscoveredProject {
  /** The directory holding `.viable/connect.json` — the project root, not where the search began. */
  dir: string
  marker: ConnectMarker
}

/** The marker this directory carries, or `null` when it carries none or an unreadable one. */
export const readMarker = async (dir: string): Promise<ConnectMarker | null> => {
  const content = await fs.readFile(p.join(dir, CONNECT_MARKER_FILE), 'utf-8').catch(() => null)
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

export const writeMarker = async (dir: string, marker: ConnectMarker): Promise<void> => {
  await fs.ensureDir(p.join(dir, CONNECT_MARKER_DIR))
  await fs.writeFile(
    p.join(dir, CONNECT_MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`
  )
}

/**
 * Find the project a directory belongs to, by walking up.
 *
 * An agent is started wherever its user happened to be — usually several levels inside the tree —
 * and every tool that acts on "this project" has to mean the same one whichever of those
 * directories it was asked from. The walk stops at the filesystem root; a machine with no marker
 * anywhere above answers `null`, which is how a connector knows to offer attaching rather than
 * assuming.
 */
export const discoverProject = async (startDir: string): Promise<DiscoveredProject | null> => {
  let dir = p.resolve(startDir)
  for (;;) {
    const marker = await readMarker(dir)
    if (marker != null) {
      return { dir, marker }
    }

    const parent = p.dirname(dir)
    if (parent === dir) {
      return null
    }
    dir = parent
  }
}

/**
 * Whether this directory holds the generated application.
 *
 * Asked before a connector offers to drive a directory, so a person who pointed it at the wrong
 * folder learns that from a sentence rather than from a build that refuses everything.
 */
export const isViableTree = async (dir: string): Promise<boolean> =>
  (await verifyTarget(dir)).ok
