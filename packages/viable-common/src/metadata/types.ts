
import type { SpecCategory } from '../ba/consts.js'

export interface MetadataFile<T extends Record<string, unknown> = Record<string, unknown>> {
  path: string
  data: T
  body: string
}

export interface MetadataWriteInput<T extends Record<string, unknown> = Record<string, unknown>> {
  data?: Partial<T>
  body: string
}

export enum MetadataKind {
  Project = 'project',
  Story = 'story',
  Source = 'source',
  History = 'history',
}

export enum MetadataListKind {
  Stories = 'stories',
  Meta = 'meta',
  // All metadata: the docs/ and .agents/ trees + co-located *.spec/.ux/.ui.md beside sources
  All = 'all',
}

/**
 * Identifies a single metadata document to read:
 * - Project:  kind=Project, no ref/category needed
 * - Story:    kind=Story,   ref=story-code
 * - Source:   kind=Source,  ref=source-path, category=SpecCategory
 */
export interface MetadataRef {
  kind: MetadataKind
  ref?: string
  category?: SpecCategory
}

/**
 * Identifies a list of metadata documents to enumerate:
 * - Stories: kind=Stories  → returns story codes
 * - Meta:    kind=Meta     → returns co-located *.spec/.ux/.ui.md paths;
 *                            category narrows to one suffix
 */
export interface MetadataListRef {
  kind: MetadataListKind
  category?: SpecCategory
}

// ─── Typed frontmatter shapes (Platform: drives ProjectMetadataStore serialisation) ────

/** Frontmatter for docs/project.md */
export interface ProjectMeta extends Record<string, unknown> {
  name: string
  alias: string
  /**
   * The language every piece of generated UI text is written in — labels, headings, empty
   * states, validation messages, i18n values.
   *
   * Recorded on the project rather than asked per pass, because a screen scaffolded in one
   * language and extended in another is a mixed interface that nothing reports: the code
   * compiles, the tests pass, and only a reader of the running app can see it. An IETF tag
   * (`en`, `pl`, `pt-BR`).
   */
  language: string
}

/**
 * Frontmatter for `.agents/memory/history.md`.
 *
 * `lastEvent` is written verbatim on every record and rendered as the first line of the history
 * block. That is what makes "the summary always names the most recent event" a property of the
 * file rather than a hope about the model that folded it.
 */
export interface HistoryMeta extends Record<string, unknown> {
  version: number
  updatedAt: string
  lastEvent: string
}

/** Frontmatter for docs/entities/<name>.md */
export interface EntityMeta extends Record<string, unknown> {
  name: string
  attributes: Array<{ name: string; description: string }>
}

/** Ref to a screen inside a docs/stories/<code>.md index */
export interface StoryScreenRef {
  name: string
  path: string
  /** Top-menu group this screen renders under. A label, never a URL segment. */
  section?: string
  components: StoryComponentRef[]
}

/** Ref to a component inside a docs/stories/<code>.md index */
export interface StoryComponentRef {
  name: string
  path: string
}

/** Frontmatter for docs/stories/<code>.md */
export interface StoryMeta extends Record<string, unknown> {
  code: string
  status: string
  primary: boolean
  /** The audience this story serves; its screens live under that area's entrypoint. */
  area: string
  /**
   * The top-menu section the scaffold reserved for this story, inside its area.
   *
   * Assigned before any of the story's code exists, so that the stub screen drawn at
   * initialization and the real screen developed later land in the SAME menu group — a story
   * that moves section when it is implemented leaves its own dashboard behind.
   */
  section?: string
  entity: string
  entities: string[]
  screens: StoryScreenRef[]
  transitions: Array<{
    from: string
    to: string
    initiator: string
    action: string
    type: string
  }>
}

/** Frontmatter for co-located <screen>.spec.md */
export interface ScreenMeta extends Record<string, unknown> {
  name: string
  stories: string[]
  area?: string
  section?: string
  components: string[]
}

/** Frontmatter for co-located <component>.spec.md */
export interface ComponentMeta extends Record<string, unknown> {
  name: string
  stories: string[]
  entities: string[]
}

/**
 * Payload the agent passes to store.writeStory — all data the developer
 * collected during one develop run.
 */
export interface StoryWriteInput {
  code: string
  narrative: string
  status: string
  primary: boolean
  /** Carried through a develop run so the rewrite does not drop the scaffold's assignment. */
  section?: string
  /** Likewise the reserved screen name. */
  screen?: string
  userStory: import('../ba/types.js').UserStory
  /** Each entry maps a StoryScreen to its source path in the target project */
  screenPaths: Record<string, string>
  /** Each entry maps a StoryComponent to its source path in the target project */
  componentPaths: Record<string, string>
  transitions: Array<{
    from: string
    to: string
    initiator: string
    action: string
    type: string
  }>
}

// ─── Name registry (.agents/memory/registry.md) ───────────────────────────────────────

/**
 * What a registry entry names.
 *
 * One entry per artifact the pipeline can generate, so that "where does this live" and "what is
 * it called" have exactly one answer for the whole life of the project.
 */
export enum RegistryKind {
  /** The single directory segment an entity owns across models/, resources/ and backend models/ */
  EntityDir = 'entity-dir',
  ModelType = 'model-type',
  Resource = 'resource',
  BackendModel = 'backend-model',
  ApiHandlers = 'api-handlers',
  Service = 'service',
  Layout = 'layout',
  Screen = 'screen',
  Component = 'component',
  ViewModel = 'view-model',
  State = 'state',
  /** Alias-only entry for one endpoint — carries no source path of its own */
  ApiEntrypoint = 'api-entrypoint',
}

/**
 * One allocated name.
 *
 * `name` is the lookup key — the entity name for entity-scoped kinds, the definition otherwise.
 * Everything else is what generated code must use verbatim: a coder that writes a different
 * directory, and a fixer that renames a reference instead of declaring the missing thing, are the
 * two failure modes this record exists to make impossible.
 */
export interface RegistryAllocation extends Record<string, unknown> {
  kind: RegistryKind
  name: string
  /** Repo-relative source path; empty for alias-only kinds */
  path: string
  /** Resource alias (also the physical table name) or entrypoint alias */
  alias?: string
  /** Dotted `app.*` reference the generated code uses to reach the alias */
  appRef?: string
  /** Exported symbol — screen/layout/component/handler */
  symbol?: string
  /**
   * The FULL assembled route, recorded when an entrypoint is declared — area prefix included.
   *
   * The declaration that produces it carries only the tail, because a child path is appended to
   * its parent's; `areaSegment` is what shortens this value when a declaration is written back.
   */
  url?: string
  /** Parent entrypoint alias — for a screen that is its AREA, for an endpoint its group */
  parent?: string
  /** The area a screen belongs to — one of the four {@link ProjectArea} values. */
  area?: string
  /** Top-menu group of a screen. A label, never a URL segment. */
  section?: string
  /**
   * A SCAFFOLD placeholder — drawn at initialization, replaced or deleted later.
   *
   * The flag is what makes cleanup deterministic instead of a judgement call. It survives until
   * either the story behind the artifact is implemented (the file is rewritten in place and the
   * flag is cleared) or something else edits the file, which clears the flag as well: whoever
   * edited it meant it, so nothing may delete it afterwards.
   */
  stub?: boolean
  /**
   * SHA-256 of the file exactly as the scaffold wrote it.
   *
   * Compared against the file on disk before a stub is deleted. A mismatch means the file is no
   * longer the placeholder that was written — free flight, the editor or a story implementation
   * has been in it — so it is kept, and only the `stub` flag is dropped.
   */
  hash?: string
  /** This widget is on its area home's shortlist and renders there in `compact` mode too. */
  home?: boolean
  /** Story code that OWNS the allocation — the one its file is named after. */
  story: string
  /**
   * Every story this one artifact stands in for, the owner included.
   *
   * A preview widget is drawn per user story only when each story genuinely needs its own; two
   * steps of one flow that act on the same record through the same shape share ONE widget, and
   * then the widget belongs to a SET. `story` stays the code the file is named after, because
   * `widgetDefinition(code)` derives the filename from exactly one; this is what lets
   * `byStory` answer to every member, and what stops a departing member from retiring an
   * artifact the others still name.
   *
   * Absent on an artifact nobody shares — the ordinary case, and the shape every slot drawn
   * before sharing existed carries.
   */
  stories?: string[]
}

/** Frontmatter for .agents/memory/registry.md */
export interface RegistryMeta extends Record<string, unknown> {
  version: number
  entries: RegistryAllocation[]
}

// ─── Layout deviations (.agents/memory/layout.md) ─────────────────────────────────────

/**
 * One place the repository no longer matches the layout the pipeline derives paths from.
 *
 * `expected` is what `naming.ts` would build; `actual` is what is on disk. Both are recorded
 * because a later run has to do two different things with them — address the file where it is,
 * and stop proposing to move it back.
 */
export interface LayoutDeviation {
  /** What the pipeline would have derived — a repo-relative path or a directory. */
  expected: string
  /** Where the thing actually is. Empty when it was removed outright. */
  actual: string
  /** Why it moved, in one sentence, as the run that observed it understood it. */
  reason: string
}

/**
 * Frontmatter for `.agents/memory/layout.md`.
 *
 * A generated target IS-A `@owlmeans/create-app` project, and every path the pipeline writes is
 * derived from that. The volume is the user's, though: they rename, they move, they merge a pull
 * request. Recording the divergence is what keeps the next run from fighting it — an agent that
 * re-derives a path it was already told is wrong recreates the file in the old place, and the
 * project then has two.
 *
 * `layout` is which of the two generated shapes the tree started as, so that a slot published
 * before the `create-app` adoption is still addressed in its own vocabulary.
 */
export interface LayoutMeta extends Record<string, unknown> {
  version: number
  /** `v1` (packages/{common,backend,frontend}) or `v2` (sources/*). */
  layout: string
  updatedAt: string
  deviations: LayoutDeviation[]
}
