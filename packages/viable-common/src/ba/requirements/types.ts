import type { RequirementPart } from '../consts.js'
import type {
  MergedStoryDraft, RequestedStoryDraft, RequirementsDocument, StatedRequirement,
} from '../types.js'

/** One story's own requirements, as `docs/requirements.md` lists them. */
export interface RequirementsFileStory {
  code: string
  title: string
  items: StatedRequirement[]
}

/**
 * The stated requirements of a project and its stories: ordering, slicing and every rendering of
 * them a person or a model reads.
 *
 * Pure and deterministic — no clock, no path, no locale — so equal input renders byte-identical
 * output, and a rendering that sits in a cached prompt prefix stays cached.
 */
export interface RequirementsHelper {
  /** `R` ids before `S` ids, then numerically: `R2` before `R10`. */
  compareIds: (a: string, b: string) => number
  /** The items that carry a non-empty text for any of `parts`, sorted by id. */
  partsOf: (items: readonly StatedRequirement[], parts: readonly RequirementPart[]) => StatedRequirement[]
  /**
   * The markdown card a stage's model reads: one `##` per requested part (in the order of
   * `parts`), one line per requirement with its quote, packages under the technical part only.
   *
   * `''` when no item carries any of `parts`. Every `@owlmeans/` scope is stripped from the
   * rendered text, so a package-detection prompt plugin never derives a block from a card.
   */
  card: (items: readonly StatedRequirement[], parts: readonly RequirementPart[]) => string
  /**
   * Sections 5–9 of the project specification — requested capabilities, business rules,
   * technical, UX and UI, provided by the platform — each line marked `**R<n>**`.
   *
   * Starts with a blank-line separator so it can be appended to a specification text; a section
   * with no line is omitted; `''` when no section has one.
   */
  specificationSections: (items: readonly StatedRequirement[]) => string
  /** The ids marked `**R<n>**` / `**S<n>**` in a specification text. */
  idsInSpecification: (spec: string) => Set<string>
  /**
   * The items whose marker is still in a (person-edited, confirmed) specification, sorted by id.
   *
   * None of the markers left means the person removed the sections: the answer is `[]`.
   */
  retained: (items: readonly StatedRequirement[], spec: string) => StatedRequirement[]
  /** A story's slice of the project document: the items assigned to `code`, without `stories`. */
  sliceFor: (doc: RequirementsDocument, code: string) => StatedRequirement[]
  /** The ids per part a target story file's frontmatter carries; a part with none is omitted. */
  frontmatterOf: (items: readonly StatedRequirement[]) => Partial<Record<RequirementPart, string[]>>
  /** The markdown body of the target's `docs/requirements.md`. */
  requirementsFile: (project: RequirementsDocument, stories: readonly RequirementsFileStory[]) => string
  /** A stable hash of the items — the `requirementsHash` a design's provenance records. */
  digest: (items: readonly StatedRequirement[]) => string
  /**
   * Insert the requested stories into the merged flow.
   *
   * Each lands right after the LAST entry that belongs to flow story `after` (the flow entry and
   * the entries that follow it before the next flow entry), as a `requested` entry carrying the
   * clamped anchor; a draft with no anchor goes to the end and carries none. A draft that repeats
   * an existing entry's text (case and whitespace collapsed) is dropped, and at most
   * `REQUESTED_STORY_CAP` are kept, in input order. The flow and connective entries are never
   * moved relative to each other, so every connective `after` stays valid.
   */
  mergeRequested: (merged: readonly MergedStoryDraft[], requested: readonly RequestedStoryDraft[]) => MergedStoryDraft[]
}
