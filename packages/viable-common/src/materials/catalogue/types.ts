import type { MaterialIndexEntry, MaterialRelevanceQuery, ProjectMaterialRecord } from '../types.js'

/**
 * The materials catalogue as a TARGET document (`docs/materials/index.md`): a JSON frontmatter that
 * carries the machine entries, and a table a person (and a model) reads.
 *
 * Pure and deterministic — no clock, no locale: the same entries, in any order, render to the same
 * bytes, so a re-render that changed nothing changes no file and no git history.
 */
export interface MaterialIndexHelper {
  /**
   * The index entry of a record (or of an entry read back): the platform ids, the storage scope and
   * the timestamps dropped, unset and `null` fields omitted, keys in one fixed order.
   */
  entryOf: (record: ProjectMaterialRecord | MaterialIndexEntry) => MaterialIndexEntry
  /** The whole document, entries sorted by path. */
  render: (entries: Array<ProjectMaterialRecord | MaterialIndexEntry>) => string
  /**
   * The entries a document carries. Total: no frontmatter, unparsable JSON or an entry without its
   * required fields gives fewer entries (none at worst), never an exception — a reader treats an
   * unreadable index as no index.
   */
  parse: (markdown: string) => MaterialIndexEntry[]
  /**
   * The usable entries (received, catalogued, placed) a reader wants, in index order. With no
   * purposes and no mentions every usable entry; otherwise an entry classified with one of
   * `purposes` OR whose name or path occurs (case-insensitively, as a whole name) in one of `mentions`.
   */
  relevant: (entries: MaterialIndexEntry[], query?: MaterialRelevanceQuery) => MaterialIndexEntry[]
  /**
   * Whether a file's own bytes are text a reader may decode as UTF-8 — by its inspected kind
   * (`MATERIAL_TEXT_KINDS`), its media type (`text/*`, `MATERIAL_TEXT_MIMES`) or, failing both, its
   * extension (`MATERIAL_TEXT_EXTENSIONS`). A document (a PDF, a Word file) is not: its text is its
   * transcript.
   */
  textual: (entry: ProjectMaterialRecord | MaterialIndexEntry) => boolean
}
