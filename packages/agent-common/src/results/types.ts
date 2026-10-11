import type { ResourceRecord } from '@owlmeans/resource'
import { RESULTS_EVERY_STEP, CumulativeResultSource } from '../consts.js'

/**
 * ONE authoritative fact about what a step produced, small enough to be one line of a prompt.
 *
 * Every field is optional past `kind` and `name`, because facts differ in what matters about them:
 * a type has a shape and an import specifier, an endpoint an alias, a method, a path and a guard, a
 * resource a table and an accessor, a file only its path. Put scalars that have no field of their
 * own into `attrs`.
 */
export interface CumulativeResultFact {
  /** What the fact is about — see {@link CumulativeFactKind}. */
  kind: string
  /** The name to use VERBATIM. */
  name: string
  /** The file it lives in, relative to the project root. */
  path?: string
  /** The module specifier it is imported from. */
  specifier?: string
  /** Its shape or signature, on one line. */
  signature?: string
  /** Fields, parameters or columns, when there is no signature to say it. */
  members?: string[]
  /** Another fact's name this one points at — a returned type, a mapped table. */
  ref?: string
  /** Scalars without a field of their own — `method`, `path`, `guard`, `table`. */
  attrs?: Record<string, string>
}

/**
 * One step's contribution to a ledger.
 *
 * Keyed by `(ledger, runId, step)`. `order` places it in the ledger: the topological index of the
 * step in its own pipeline, preceded by the index path of every step it was composed under, so a
 * run composed as a step of another sorts inside that step, ahead of the composing step's own
 * entry. A single number cannot say that: two pipelines' indexes are not comparable.
 *
 * `full` and `compact` are rendered once, when the entry is written, and never contain a timestamp,
 * a run id or anything else a model would copy without meaning to.
 */
export interface CumulativeResultEntry extends ResourceRecord {
  /** What entries can see each other — by default the root run of the composition. */
  ledger: string
  pipeline: string
  runId: string
  step: string
  /** How the entry is headed in a prompt: the step, behind the path of the steps it runs under. */
  label: string
  order: number[]
  /** Bumped every time the entry is re-extracted after a later step rewrote one of its files. */
  revision: number
  source: CumulativeResultSource
  /** An `optional` step that failed: whatever it left behind, and a heading that says so. */
  partial?: boolean
  facts: CumulativeResultFact[]
  /** The files the facts were read from — what a later rewrite is matched against. */
  files: string[]
  /** A model's summary, rendered and capped. NOT verified, and always labelled so. */
  summary?: string
  full: string
  compact: string
  /** Consumers that always get the full entry, by step name, or every later step. */
  fullFor?: string[] | typeof RESULTS_EVERY_STEP
  /** Consumers that never see the entry in their prompt. */
  omitFor?: string[]
  /** How many edges back the entry is still rendered in full by default. */
  window?: number
  updatedAt: string
}

/**
 * The optional model-written summary of a step. OFF unless a step declares one.
 *
 * Facts are the product; a summary is for what code cannot extract — an intent, a decision taken.
 * It is bounded by `maxChars` in code after the model answers, rendered deterministically from the
 * schema-shaped answer, and always labelled as unverified wherever it is shown.
 */
export interface ResultSummarySpec {
  /** Which model — interpreted by the caller's summarize callback (a model role, typically). */
  role?: string
  instructions: string
  /** JSON schema of the answer. Absent means `{ summary: string }`. */
  schema?: Record<string, unknown>
  /** Defaults to `DEFAULT_RESULT_SUMMARY_CHARS`. */
  maxChars?: number
}

/**
 * What one step contributes, and to whom. JSON-safe, so a declaration can live in data.
 *
 * Extractors are named, never inlined: a declaration names what runs, and the runtime holds the
 * code. A consumer not named in `full` or `omit` gets the full entry within `window` edges and the
 * names only beyond it.
 */
export interface StepResultsSpec {
  /** Named deterministic extractors, run in this order. */
  extractors?: string[]
  /** Later steps that get the FULL entry wherever they sit, or `'*'` for all of them. */
  full?: string[] | typeof RESULTS_EVERY_STEP
  /** Later steps that are never shown the entry. */
  omit?: string[]
  /** Overrides {@link CumulativeResultsSpec.window} for this entry. */
  window?: number
  /** Cap on the full rendering; facts are dropped whole, never cut. */
  maxChars?: number
  /** Cap on the names-only rendering. */
  maxCompactChars?: number
  /** Re-extract this entry when a later step rewrites one of its files. Defaults to the spec's. */
  refresh?: boolean
  summary?: ResultSummarySpec
}

/** The pipeline-level declaration — merged from a pipeline's own and any overlay with {@link CumulativeResultsHelper.mergeResultsSpecs}. */
export interface CumulativeResultsSpec {
  /** Per step, by step name. A step with no entry contributes only what it records itself. */
  steps?: Record<string, StepResultsSpec>
  /** Default {@link DEFAULT_RESULTS_WINDOW}. */
  window?: number
  /** Total characters of one view. Default `DEFAULT_RESULTS_MAX_CHARS`. */
  maxChars?: number
  /** Default cap of one full entry. Default {@link DEFAULT_RESULT_ENTRY_CHARS}. */
  maxEntryChars?: number
  /** Default cap of one names-only entry. Default {@link DEFAULT_RESULT_COMPACT_CHARS}. */
  maxCompactChars?: number
  /** Default for {@link StepResultsSpec.refresh}. Defaults to `true`. */
  refresh?: boolean
}

/** What a facts query may narrow by. Every field is an exact match. */
export interface ResultFactQuery {
  kind?: string
  name?: string
  /** A producing step, by its name or by its label. */
  step?: string
}

/** What {@link CumulativeResultsHelper.renderResultEntry} needs of an entry. */
export interface RenderableResultEntry extends Pick<
  CumulativeResultEntry, 'label' | 'source' | 'partial' | 'facts' | 'summary'
> {}

export interface ResultRenderCaps {
  /** Cap on the full rendering. Default {@link DEFAULT_RESULT_ENTRY_CHARS}. */
  maxChars?: number
  /** Cap on the names-only rendering. Default {@link DEFAULT_RESULT_COMPACT_CHARS}. */
  maxCompactChars?: number
}

/** An entry's two renderings. */
export interface RenderedResultEntry {
  full: string
  compact: string
}

/**
 * CUMULATIVE PIPELINE RESULTS — the contracts.
 *
 * After a step of a pipeline finishes, code reads what it produced — a type's shape, a file, an
 * endpoint's method, path and parameters, a resource's table — into a small list of FACTS, and the
 * later steps are told those facts instead of re-deriving them from the files. A later step that is
 * handed the authoritative names does not invent a second spelling of them, and that is the whole
 * point: it removes the class of errors that live BETWEEN steps.
 *
 * Everything here is data and pure functions. The runtime that extracts, stores and cuts the views
 * is `@owlmeans/agent`'s `cumulativeResultsPlugin`; the prompt block it lands in is
 * `@owlmeans/llm`'s. A backend or a browser bundle reads an entry without either.
 */
export interface CumulativeResultsHelper {
  /**
   * The identity of a fact inside a ledger: what it is, what it is called and where it comes from.
   * Two facts with one key are one fact, owned by whichever entry produced it first.
   */
  factKey: (fact: CumulativeResultFact) => string
  /**
   * Facts in the one order they are ever rendered in: by kind (file facts last), name and location,
   * with a code-unit comparison so every host sorts them alike.
   */
  sortFacts: (facts: readonly CumulativeResultFact[]) => CumulativeResultFact[]
  /** One fact as one prompt line: kind and name, shape, scalars, pointer, and where it comes from. */
  renderResultFact: (fact: CumulativeResultFact) => string
  /**
   * An entry's two renderings — in full, and as names only — or two empty strings when it has
   * nothing to say.
   *
   * Deterministic and free of anything that varies between two renderings of the same facts: no
   * timestamp, no run id, no revision. Over its cap an entry DROPS whole facts, in render order, and
   * says how many it dropped; it never cuts one fact's line, because half a signature is a wrong
   * signature. An empty entry that is not partial renders to nothing, so it costs a view nothing.
   */
  renderResultEntry: (entry: RenderableResultEntry, caps?: ResultRenderCaps) => RenderedResultEntry
  /**
   * Ledger order: element by element, and where one key is a prefix of the other, the LONGER one
   * first — an entry of a run composed under a step sorts ahead of that step's own entry, which is
   * written only once the composed run has finished.
   */
  compareResultOrder: (a: readonly number[], b: readonly number[]) => number
  /** The root run of a composition — what a composed run's id (`<parent>/<step>`) starts with. */
  rootRunOf: (runId: string) => string
  /**
   * How an entry is headed: the step, behind the path of composing steps between the ledger's root
   * run and the run that produced it. A root-run step is headed by its bare name.
   */
  resultLabel: (ledger: string, runId: string, step: string) => string
  /**
   * A model's schema-shaped summary as one capped line, the same bytes for the same answer.
   *
   * An object renders as `key: value` pairs in key order; one with a single key renders as that
   * value alone, so the default `{ summary }` answer reads as prose. The cap is applied here, after
   * the model answered — a cap in a prompt is a request.
   */
  renderResultSummary: (answer: unknown, maxChars?: number) => string
  /**
   * Several declarations as one — a pipeline's own, then any overlay (a variant, a deployment).
   *
   * Later declarations win field by field, except the lists: extractors, `full` consumers and `omit`
   * consumers ACCUMULATE, the way skills do down an execution chain, because an overlay that adds an
   * extractor is not asking to lose the ones the pipeline declared. `'*'` in `full` absorbs names.
   */
  mergeResultsSpecs: (...specs: Array<CumulativeResultsSpec | null | undefined>) => CumulativeResultsSpec
}
