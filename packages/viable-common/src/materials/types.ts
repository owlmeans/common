import type { MATERIAL_PLATFORM_KEYS, MaterialPurpose, MaterialRemoval, MaterialStatus, MaterialUseBy } from './consts.js'

/** The upload limits — see `MATERIALS_LIMITS`. */
export interface MaterialsLimits {
  /** Files in the expanded set. */
  files: number
  /** Raw bytes of one file. */
  fileBytes: number
  /** Raw bytes of the whole expanded set. */
  totalBytes: number
}

/** One use the project makes of a material. */
export interface MaterialUse {
  /**
   * Where it is used — a `MaterialUseTarget` value (`logo`, `favicon`, `hero-image`, `theme`, …) or
   * a newer one; open on purpose, see `MaterialUseTarget`.
   */
  target: string
  by: MaterialUseBy
  /** What established the use: `'prompt'` or the path of the material that cites this one. */
  source?: string
  note?: string
}

/**
 * What the analysis found out about one file. Open: a field nobody declared yet is kept, so a newer
 * agent's finding survives an older platform. Numbers are plain numbers (a stored number is a double).
 */
export interface MaterialDetails {
  width?: number
  height?: number
  pages?: number
  language?: string
  /** Seconds. */
  duration?: number
  /** Colours in CSS notation, most prominent first. */
  palette?: string[]
  [key: string]: unknown
}

/**
 * One catalogued file, as the platform's `project-material` resource stores it.
 *
 * Platform ids are plain strings here: this package is runtime-free and the browser imports it.
 */
export interface ProjectMaterialRecord {
  id?: string
  projectId: string
  /** The organization's record id — never on the wire. */
  entityId: string
  slotId: string
  /**
   * The storage scope claimed for the upload (`<entitySlug>/<slotId>/new-project`). Claimed once,
   * stored on the slot and on every record, read back — never recomputed.
   */
  scope: string
  /** The original relative path, folders kept (`brand/logo.svg`). */
  path: string
  /** The file name (the last segment of `path`). */
  name: string
  /** Raw bytes. */
  size: number
  mime?: string
  /** The `@owlmeans/file-inspector` `FileKind` value the bytes were verified as. */
  kind?: string
  /** Hex SHA-256 of the bytes. */
  digest?: string
  /** The archive path this file was unpacked from. */
  from?: string
  status: MaterialStatus
  /** Why it was removed or rejected. */
  reason?: MaterialRemoval
  purpose?: MaterialPurpose
  /** One or two sentences about the content, written by the analysis. */
  description?: string
  details?: MaterialDetails
  uses?: MaterialUse[]
  /** The path of its markdown analogue under `docs/materials/`, when one was written. */
  transcript?: string
  /** The workload path it was placed at. */
  placedAt?: string
  createdAt: Date
  updatedAt?: Date
}

/** Kept as a type: a union of the record keys that belong to the platform. */
export type MaterialPlatformKey = typeof MATERIAL_PLATFORM_KEYS[number]

/**
 * A catalogue entry in the target's `docs/materials/index.md`: the record without the platform's
 * ids, storage scope and timestamps.
 */
export interface MaterialIndexEntry extends Omit<ProjectMaterialRecord, MaterialPlatformKey> {}

/** The JSON frontmatter of `docs/materials/index.md`. */
export interface MaterialIndexDocument {
  version: number
  entries: MaterialIndexEntry[]
}

/** Which entries a reader wants — see `MaterialIndexHelper.relevant`. */
export interface MaterialRelevanceQuery {
  /** Entries classified with one of these purposes. */
  purposes?: MaterialPurpose[]
  /** Texts (a message, a prompt) — an entry whose name or path occurs in one of them is wanted. */
  mentions?: string[]
}
