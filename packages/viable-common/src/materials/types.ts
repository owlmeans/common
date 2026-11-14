import type {
  MATERIAL_PLATFORM_KEYS, MaterialGeneratedKind, MaterialLinkIntent, MaterialPurpose, MaterialRemoval, MaterialStatus,
  MaterialUseBy, ReferenceLinkStatus, ReferenceOrigin, ReferencePackageStatus, ReferencePackageVerdict,
  ReferenceResearchStatus,
} from './consts.js'

/** The upload limits — see `MATERIALS_LIMITS`. */
export interface MaterialsLimits {
  /** Files in the expanded set. */
  files: number
  /** Raw bytes of one file. */
  fileBytes: number
  /** Raw bytes of the whole expanded set. */
  totalBytes: number
}

/** The references budget of one project — see `MATERIALS_LINK_LIMITS`. */
export interface MaterialsLinkLimits extends MaterialsLimits {
  /** Links admitted (a folder counts as one). */
  links: number
  /** Online research requests. */
  research: number
  /** Results opened per research request. */
  researchResults: number
  /** Package skills written. */
  skills: number
}

/**
 * Where a fetched file came from — `details.link` of its catalogue row. Ownership decides what a
 * file may become: a file that is not the person's own is never a brand mark or a hero, and is
 * placed with the originals, never among the public assets.
 */
export interface MaterialLinkDetails {
  /** The URL the file was fetched from (the file's own, not the link's, for a bundle part). */
  url: string
  /** The ledger id of the link it was fetched for. */
  linkId: string
  intent: MaterialLinkIntent
  /** The person's own (a Drive/S3/direct file, or a page the prompt calls theirs). */
  own: boolean
  /** The page the design follows first among several. */
  primaryDesign?: boolean
  /** The html path an asset was fetched to complete — it inherits that page's ownership. */
  completes?: string
}

/** One link of `references.json`. */
export interface ReferenceLink {
  /** Stable: a digest of the normalized URL (`referencesLedgerHelper.linkIdOf`). */
  id: string
  /** As the person wrote it. */
  url: string
  /** `referenceScanHelper.normalize(url)`. */
  normalized: string
  intents: MaterialLinkIntent[]
  /** The person's own — see `MaterialLinkDetails.own`. */
  own: boolean
  /** The person's words about it, quoted. */
  instruction?: string
  origin: ReferenceOrigin.Prompt | ReferenceOrigin.Specification
  status: ReferenceLinkStatus
  /** Why it was skipped, refused or failed — short and safe to show. */
  reason?: string
  /** Its `links/<nn>-<slug>` folder in the materials scope. */
  folder?: string
  /** Files kept for it. */
  files?: number
  /** Their raw bytes. */
  bytes?: number
  /** The workload paths of the documents written from it. */
  docs?: string[]
}

/** One online research request of `references.json`. */
export interface ReferenceResearch {
  /** Stable: a digest of the normalized query (`referencesLedgerHelper.researchIdOf`). */
  id: string
  query: string
  /** The person's words, quoted. */
  instruction?: string
  origin: ReferenceOrigin.Prompt | ReferenceOrigin.Specification
  status: ReferenceResearchStatus
  reason?: string
  /** The workload path of its report. */
  doc?: string
  /** Pages the report cites. */
  sources?: number
  /** What the research could not establish. */
  gap?: string
}

/** One named package of `references.json`, keyed by its name. */
export interface ReferencePackage {
  /** The npm name (`@tanstack/react-query`). */
  name: string
  origin: ReferenceOrigin
  verdict?: ReferencePackageVerdict
  /** Why the verdict, short phrases. */
  reasons?: string[]
  /** The far more popular package this one imitates. */
  lookalikeOf?: string
  /** Its skill name (`materialPathHelper.skillNameOf`). */
  skill?: string
  status: ReferencePackageStatus
  reason?: string
}

/**
 * `docs/materials/references.json` — every link, research request and named package of a project
 * with where it stands. Written by the links pipeline; the source of the remaining budget.
 */
export interface ReferencesLedger {
  version: number
  links: ReferenceLink[]
  research: ReferenceResearch[]
  packages: ReferencePackage[]
  /** ISO time of the last write. */
  updatedAt?: string
}

/** Rows merged into a ledger — see `ReferencesLedgerHelper.merge`. */
export interface ReferencesLedgerPatch {
  links?: ReferenceLink[]
  research?: ReferenceResearch[]
  packages?: ReferencePackage[]
  updatedAt?: string
}

/** What the files fetched for links actually hold, counted from the catalogue rows. */
export interface ReferenceStored {
  files: number
  bytes: number
}

/** A references budget — what is used, or what remains of `MATERIALS_LINK_LIMITS`. */
export interface ReferenceUsage {
  links: number
  files: number
  bytes: number
  research: number
  skills: number
}

/** What `referenceScanHelper.scan` found in a text. */
export interface ReferenceScan {
  /** Distinct normalized http(s) and `s3://` URLs, in order of appearance. */
  links: string[]
  /** A research cue is present ("search online", "найди в интернете", …). */
  research: boolean
}

/** One generated document listed by `docs/materials/index.md`. */
export interface MaterialGeneratedDoc {
  /** Its workload path (`docs/materials/research/lead-scoring.md`). */
  path: string
  title: string
  kind: MaterialGeneratedKind
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
  /** Where a fetched file came from — read it with `materialLinkOf`. */
  link?: MaterialLinkDetails
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
  /** Present only when the index lists generated documents. */
  generated?: MaterialGeneratedDoc[]
}

/** Which entries a reader wants — see `MaterialIndexHelper.relevant`. */
export interface MaterialRelevanceQuery {
  /** Entries classified with one of these purposes. */
  purposes?: MaterialPurpose[]
  /** Texts (a message, a prompt) — an entry whose name or path occurs in one of them is wanted. */
  mentions?: string[]
}
