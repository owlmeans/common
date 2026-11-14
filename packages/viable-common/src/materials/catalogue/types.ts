import type { MaterialGeneratedDoc, MaterialIndexEntry, MaterialRelevanceQuery, ProjectMaterialRecord } from '../types.js'

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
  /**
   * The whole document, entries sorted by path. With `generated` (non-empty) the frontmatter gains a
   * `generated` list and the document a "Generated documents" table, both sorted by path, one per
   * path; without it the bytes are exactly those of an index that never had the section.
   */
  render: (entries: Array<ProjectMaterialRecord | MaterialIndexEntry>, generated?: MaterialGeneratedDoc[]) => string
  /**
   * The entries a document carries. Total: no frontmatter, unparsable JSON or an entry without its
   * required fields gives fewer entries (none at worst), never an exception — a reader treats an
   * unreadable index as no index.
   */
  parse: (markdown: string) => MaterialIndexEntry[]
  /**
   * The generated documents a document lists, as `render` writes them. Total like `parse`: no
   * section gives none; an item without a path or with an unknown kind is dropped, one without a
   * title is titled by its path.
   */
  parseGenerated: (markdown: string) => MaterialGeneratedDoc[]
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
