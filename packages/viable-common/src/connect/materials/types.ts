import type { MaterialGeneratedDoc, MaterialIndexEntry, ReferencesLedger } from '../../materials/types.js'
import type { ConnectMaterialTextSource } from '../consts.js'
import type { ConnectCreateBody } from '../project/types.js'

/**
 * What a connector is about to upload with a NEW project, announced with its create: the files its
 * precheck accepted (an archive counted as one file of its own size) and their raw bytes. The
 * expanded set's own limits (`MATERIALS_LIMITS`) are enforced on the upload itself.
 */
export interface ConnectMaterialsAnnouncement {
  files: number
  bytes: number
}

/**
 * `connect.project.createWithMaterials`: the create body (`prompt`, `target`, the delegated
 * `sessionId`) plus the announcement. A body of its own — `ConnectCreateBody` is closed and an older
 * platform refuses a field it does not know.
 */
export interface ConnectCreateWithMaterialsBody extends ConnectCreateBody {
  materials: ConnectMaterialsAnnouncement
}

/** One material of a project, addressed by its original relative path (folders kept). */
export interface ConnectMaterialQuery {
  path: string
}

/** The drafting asked again: `force` drafts an upload still open (Continue with what arrived) or a draft that failed (Retry). */
export interface ConnectMaterialsDraftBody {
  force?: boolean
}

/**
 * Where a project's files stand — what `connect.project.materials.draft` answers. `state` is the
 * platform's upload state (`uploading`, `sealed`, `drafting`, `drafted`, `placing`, `placed`,
 * `purged`, `failed`), open on purpose: a newer platform may name one this package has never seen.
 * `null` for a project created without files.
 */
export interface ConnectMaterialsState {
  state: string | null
  /** Files usable (stored, catalogued or placed). */
  files: number
  /** Their raw bytes. */
  bytes: number
  /** Files the upload refused. */
  rejected: number
  /** Why the processing of the files failed, as the platform phrased it. */
  lastError?: string
}

/**
 * `connect.project.materials.catalogue`: every file of a project — accepted, rejected and removed
 * alike — as the target's catalogue entry (purpose, description, status and reason, uses), by path,
 * and where the files stand. A project created without files answers no entries and `state: null`.
 * Files fetched for a link are entries too, under `links/<nn>-<slug>/…` (`details.link` names the URL).
 */
export interface ConnectMaterialCatalogue extends ConnectMaterialsState {
  entries: MaterialIndexEntry[]
  /**
   * `docs/materials/references.json` — every link, online research request and named npm package the
   * project's prompt and confirmed specification pointed at, with where each stands (fetched, researched,
   * skipped or refused, and why); absent when the project has no ledger (yet).
   */
  references?: ReferencesLedger
  /**
   * The documents the platform generated from those references and lists in its materials index — the
   * research reports, reference summaries and package skills — each readable through
   * `connect.project.materials.read` by its path; absent when none.
   */
  generated?: MaterialGeneratedDoc[]
}

/**
 * `connect.project.materials.read`: one material's text — its markdown transcript when the analysis
 * wrote one, else a textual file's own text, or a generated document's (`source: generated`, addressed
 * by the path `ConnectMaterialCatalogue.generated` lists) — cut at `CONNECT_MATERIAL_TEXT_MAX` characters.
 * `source: null` (and an empty `text`) is a material without text: an image, a font, a video the
 * analysis wrote no transcript of; its catalogue entry describes it.
 */
export interface ConnectMaterialText {
  path: string
  source: ConnectMaterialTextSource | null
  text: string
  /** The whole text's length in characters, before the cut. */
  length: number
  /** The text was cut at `CONNECT_MATERIAL_TEXT_MAX` characters. */
  truncated?: boolean
}
