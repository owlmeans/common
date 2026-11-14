import type {
  ReferenceLink, ReferencePackage, ReferenceResearch, ReferencesLedger, ReferencesLedgerPatch, ReferenceStored,
  ReferenceUsage,
} from '../types.js'

/**
 * `docs/materials/references.json` as data: built, read, written and counted against
 * `MATERIALS_LINK_LIMITS`.
 *
 * Pure and deterministic — no clock: the caller stamps `updatedAt`. Every member returns a new
 * ledger and never changes the one it was given.
 */
export interface ReferencesLedgerHelper {
  /** A ledger with nothing in it, at `REFERENCES_VERSION`. */
  empty: () => ReferencesLedger
  /**
   * The ledger a text holds. Total: unparsable JSON or a non-object gives an empty ledger, a row
   * without its required fields or with an unknown status is dropped, unknown keys and mistyped
   * optionals are dropped, each list is cut at its `REFERENCE_*_MAX` — never an exception.
   */
  parse: (text: string) => ReferencesLedger
  /**
   * The file's text: two-space JSON, keys in one fixed order, unset and `null` fields omitted, rows in
   * ledger order (a link's ordinal is its place), a final newline. `render(parse(text)) === text` for
   * every rendered text.
   */
  render: (ledger: ReferencesLedger) => string
  /** A link's stable id: 16 hex digits digesting its normalized URL (the trimmed text when it is none). */
  linkIdOf: (url: string) => string
  /** A research request's stable id: 16 hex digits digesting its query, case and spacing folded. */
  researchIdOf: (query: string) => string
  findLink: (ledger: ReferencesLedger, id: string) => ReferenceLink | undefined
  findResearch: (ledger: ReferencesLedger, id: string) => ReferenceResearch | undefined
  /** By npm name, exactly. */
  findPackage: (ledger: ReferencesLedger, name: string) => ReferencePackage | undefined
  /**
   * Rows merged in: a link or a research request by `id`, a package by `name`. A known row keeps its
   * place and takes the patch's fields over its own — a key the patch sets to `undefined` clears
   * that field, a key it leaves out keeps it; a new row is appended. `updatedAt` from the patch wins.
   */
  merge: (ledger: ReferencesLedger, patch: ReferencesLedgerPatch) => ReferencesLedger
  /**
   * What the references use: admitted links (`REFERENCE_LINK_ADMITTED`), the files and bytes of every
   * link (or `stored`, counted from the catalogue rows, when given), admitted research requests
   * (`REFERENCE_RESEARCH_ADMITTED`) and skilled packages.
   */
  usage: (ledger: ReferencesLedger, stored?: ReferenceStored) => ReferenceUsage
  /** What remains of `MATERIALS_LINK_LIMITS` after {@link usage} — never below zero. */
  remaining: (ledger: ReferencesLedger, stored?: ReferenceStored) => ReferenceUsage
}
