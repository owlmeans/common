/**
 * What a conversion knows about ONE file of the origin, read whole.
 *
 * The taxonomy, the proof sheets and the origin advisor used to see a file's first 2,400
 * characters, and a page exported low in a large file, a nested route or a DELETE handler at the
 * bottom of a router was simply never seen. A summary is written from the WHOLE file — paged in
 * windows a model call can hold, the prose rolled forward from window to window — so what a later
 * pass reads stands for every line of the file rather than for its head.
 *
 * Stored one document per top-level package (`docs/conversion/summaries/<package>.md`), keyed by
 * the origin-relative path and guarded by the content `hash`: an entry whose hash matches the file
 * on the volume is never paid for twice.
 */
export interface FileSummary {
  /** Origin-relative, as the census names it. */
  path: string
  /** sha256 of the content the summary was written from. */
  hash: string
  /** Characters read. Below the census size when the read budget cut the file. */
  chars: number
  lines: number
  /** What the file IS in its application, in a few words: `page`, `route handler`, `zod schemas`. */
  role: string
  /** What the file does, written from every window of it. Empty on a failed summary. */
  summary: string
  /** Every exported name — scanned without a model, completed by the model's reading. */
  exports: string[]
  /** The named declarations a reader of the file needs: types, classes, functions, constants. */
  declarations: string[]
  routes: FileSummaryRoute[]
  schemas: FileSummarySchema[]
  ui: FileSummaryUi[]
  /**
   * What the file imports — scanned, never asked of a model. An import that resolves to a file of
   * the origin is its origin-relative path; anything else (a package) is the specifier as written.
   */
  imports: string[]
  /** Where the file scopes data or access by a tenant: a `teamId` filter, an org guard, … */
  tenancySignals: FileSummaryTenancySignal[]
  /**
   * The model could not summarize the file: the scanned fields stand and `summary` is empty.
   * A reader shows such a file RAW instead.
   */
  failed?: boolean
}

/** One HTTP route the file declares. `line` is 1-based, in the whole file. */
export interface FileSummaryRoute {
  method: string
  path: string
  handler: string
  guards: string[]
  line: number
}

/** One data schema the file declares — a zod object, a model class, a table, a type. */
export interface FileSummarySchema {
  name: string
  line: number
  fields: FileSummaryField[]
}

/** One field of a schema, closed lists and defaults included. */
export interface FileSummaryField {
  name: string
  type: string
  required: boolean
  /** The closed list of values the field takes, when it takes one. */
  enum?: string[]
  default?: string
  /** The schema or entity the field points at, when it is a reference. */
  ref?: string
}

/** One screen or component the file renders. */
export interface FileSummaryUi {
  component: string
  line: number
  routeParams: string[]
  /** The inputs a person fills or picks on it. */
  inputs: string[]
}

export interface FileSummaryTenancySignal {
  signal: string
  line: number
}

/**
 * What ONE model call answers about one file.
 *
 * The model-facing twin of {@link FileSummary}: it carries only what is read from the lines shown,
 * and names no property after a JSON-schema keyword — a provider strips a property called
 * `required` or `default` from what the model is shown, so it could never be answered. The field
 * says `mandatory` and `defaultValue`, and the summarizer maps both onto {@link FileSummaryField}.
 */
export interface FileSummaryAnswer {
  path: string
  role: string
  summary: string
  exports: string[]
  declarations: string[]
  routes: FileSummaryRoute[]
  schemas: FileSummaryAnswerSchema[]
  ui: FileSummaryUi[]
  tenancySignals: FileSummaryTenancySignal[]
}

export interface FileSummaryAnswerSchema {
  name: string
  line: number
  fields: FileSummaryAnswerField[]
}

export interface FileSummaryAnswerField {
  name: string
  type: string
  mandatory: boolean
  enum?: string[]
  defaultValue?: string
  ref?: string
}

/** One call's answer: one entry per file it was shown. */
export interface FileSummaryBatch {
  files: FileSummaryAnswer[]
}
