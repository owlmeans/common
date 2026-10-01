import type { ResourceRecord } from '@owlmeans/resource'
import {
  DEFAULT_RESULT_COMPACT_CHARS, DEFAULT_RESULT_ENTRY_CHARS, DEFAULT_RESULT_SUMMARY_CHARS,
  RESULTS_EVERY_STEP,
} from './consts.js'
import { truncateAt } from './helpers/conversation.js'

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

/** Where the facts of an entry came from. */
export enum CumulativeResultSource {
  /** Read by code from what the step left behind, when the step finished. */
  Extracted = 'extracted',
  /**
   * Read by code from the step's DURABLE inputs, after the fact — on a resume that found no stored
   * entry, or for a step whose guard skipped it. The same facts an extraction would have found.
   */
  Rebuilt = 'rebuilt',
  /** Supplied before any step of the run ran — the caller already knew them. */
  Seeded = 'seeded',
  /** No facts at all; only a model's summary, which nothing has checked. */
  Summarized = 'summarized',
}

/** How one entry appears in a view cut for a given step. */
export enum ResultViewMode {
  Full = 'full',
  /** Names only, grouped by kind. */
  Compact = 'compact',
  /** Not in the prompt. Still answered by a programmatic facts query. */
  Omitted = 'omitted',
}

/**
 * Kinds an extractor is encouraged to use. `CumulativeResultFact.kind` is an open string — declare
 * your own — but two extractors naming the same thing differently split one fact into two.
 */
export enum CumulativeFactKind {
  Type = 'type',
  Symbol = 'symbol',
  Endpoint = 'endpoint',
  Resource = 'resource',
  File = 'file',
}

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

/** The pipeline-level declaration — merged from a pipeline's own and any overlay with {@link mergeResultsSpecs}. */
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

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

/**
 * The identity of a fact inside a ledger: what it is, what it is called and where it comes from.
 * Two facts with one key are one fact, owned by whichever entry produced it first.
 */
export const factKey = (fact: CumulativeResultFact): string =>
  `${fact.kind}\u0000${fact.name}\u0000${fact.specifier ?? fact.path ?? ''}`

/** File facts last — a location is the first thing a budget can spare, a shape the last. */
const kindRank = (kind: string): number => kind === CumulativeFactKind.File ? 1 : 0

/**
 * Facts in the one order they are ever rendered in: by kind (file facts last), name and location,
 * with a code-unit comparison so every host sorts them alike.
 */
export const sortFacts = (facts: readonly CumulativeResultFact[]): CumulativeResultFact[] =>
  [...facts].sort((a, b) =>
    kindRank(a.kind) - kindRank(b.kind)
    || compare(a.kind, b.kind)
    || compare(a.name, b.name)
    || compare(a.specifier ?? a.path ?? '', b.specifier ?? b.path ?? ''))

/** One fact as one prompt line: kind and name, shape, scalars, pointer, and where it comes from. */
export const renderResultFact = (fact: CumulativeResultFact): string => {
  let line = `- ${fact.kind} \`${oneLine(fact.name)}\``
  const shape = fact.signature != null && fact.signature.trim() !== ''
    ? oneLine(fact.signature)
    : fact.members != null && fact.members.length > 0
      ? `{ ${fact.members.map(oneLine).join(', ')} }`
      : ''
  if (shape !== '') {
    line += `: ${shape}`
  }
  const attrs = Object.keys(fact.attrs ?? {}).sort(compare)
    .map(key => `${key}: ${oneLine(fact.attrs![key]!)}`)
  if (attrs.length > 0) {
    line += ` (${attrs.join(', ')})`
  }
  if (fact.ref != null && fact.ref !== '') {
    line += ` → \`${oneLine(fact.ref)}\``
  }
  if (fact.specifier != null && fact.specifier !== '') {
    line += ` — import from \`${fact.specifier}\``
  }
  if (fact.path != null && fact.path !== '' && fact.path !== fact.name) {
    line += fact.specifier != null && fact.specifier !== ''
      ? ` (file \`${fact.path}\`)`
      : ` — file \`${fact.path}\``
  }

  return line
}

/** What {@link renderResultEntry} needs of an entry. */
export type RenderableResultEntry = Pick<
  CumulativeResultEntry, 'label' | 'source' | 'partial' | 'facts' | 'summary'
>

export interface ResultRenderCaps {
  /** Cap on the full rendering. Default {@link DEFAULT_RESULT_ENTRY_CHARS}. */
  maxChars?: number
  /** Cap on the names-only rendering. Default {@link DEFAULT_RESULT_COMPACT_CHARS}. */
  maxCompactChars?: number
}

const PARTIAL_WITH_FACTS = 'partial: the step failed part-way; only what it left in the files is listed'
const PARTIAL_EMPTY = 'partial: the step failed part-way and left nothing that could be read'
const SEEDED = 'known before this run'
const NOT_VERIFIED = 'not verified'
const NAMES_ONLY = 'names only'
const SUMMARY_LEFT_OUT = 'summary left out for space'
const SUMMARY_WITH_FACTS = 'Summary (not verified — written by a model, never checked against the files):'
const SUMMARY_ALONE = 'Summary written by a model, never checked against the files:'

const moreFacts = (count: number): string =>
  `- … and ${count} more not listed here for space. They exist: check the files before creating anything similar.`

const moreNames = (count: number): string => `- … and ${count} more`

const heading = (entry: RenderableResultEntry, compact: boolean): string => {
  const notes: string[] = []
  const hasFacts = entry.facts.length > 0
  if (entry.partial === true) {
    notes.push(hasFacts ? PARTIAL_WITH_FACTS : PARTIAL_EMPTY)
  }
  if (entry.source === CumulativeResultSource.Seeded) {
    notes.push(SEEDED)
  }
  if (!hasFacts && entry.summary != null) {
    notes.push(NOT_VERIFIED)
  }
  if (compact && (hasFacts || entry.summary != null)) {
    notes.push(hasFacts ? NAMES_ONLY : SUMMARY_LEFT_OUT)
  }

  return `### ${entry.label}${notes.length > 0 ? ` (${notes.join('; ')})` : ''}`
}

/** Lines under `head`, as many as fit in `max`, with `more(n)` saying how many did not. */
const fit = (
  head: string[], lines: string[], tail: string[], max: number, more: (count: number) => string,
): string => {
  const total = (parts: string[]): number => parts.join('\n').length
  if (total([...head, ...lines, ...tail]) <= max) {
    return [...head, ...lines, ...tail].join('\n')
  }

  // Room for the "more" line is reserved at its widest, so adding it can never break the cap.
  const reserve = more(lines.length).length + 1
  const kept: string[] = []
  for (const line of lines) {
    if (total([...head, ...kept, line, ...tail]) + reserve > max) {
      break
    }
    kept.push(line)
  }

  return [...head, ...kept, more(lines.length - kept.length), ...tail].join('\n')
}

/**
 * An entry's two renderings — in full, and as names only — or two empty strings when it has
 * nothing to say.
 *
 * Deterministic and free of anything that varies between two renderings of the same facts: no
 * timestamp, no run id, no revision. Over its cap an entry DROPS whole facts, in render order, and
 * says how many it dropped; it never cuts one fact's line, because half a signature is a wrong
 * signature. An empty entry that is not partial renders to nothing, so it costs a view nothing.
 */
export const renderResultEntry = (
  entry: RenderableResultEntry, caps: ResultRenderCaps = {},
): { full: string, compact: string } => {
  const maxChars = caps.maxChars ?? DEFAULT_RESULT_ENTRY_CHARS
  const maxCompactChars = caps.maxCompactChars ?? DEFAULT_RESULT_COMPACT_CHARS
  const facts = sortFacts(entry.facts)
  if (facts.length === 0 && entry.summary == null && entry.partial !== true) {
    return { full: '', compact: '' }
  }

  const summary = entry.summary != null && entry.summary.trim() !== ''
    ? [`${facts.length > 0 ? SUMMARY_WITH_FACTS : SUMMARY_ALONE} ${oneLine(entry.summary)}`]
    : []
  const full = fit([heading(entry, false)], facts.map(renderResultFact), summary, maxChars, moreFacts)

  const byKind = new Map<string, string[]>()
  for (const fact of facts) {
    const names = byKind.get(fact.kind) ?? []
    if (!names.includes(fact.name)) {
      names.push(fact.name)
    }
    byKind.set(fact.kind, names)
  }
  // One line per kind while the names fit; the rest are counted, never cut.
  const compactHead = heading(entry, true)
  const namesWithin = (reserve: number): { lines: string[], left: number } => {
    const lines: string[] = []
    let left = 0
    for (const [kind, names] of byKind) {
      let line = `- ${kind}:`
      let taken = 0
      for (const name of names) {
        const next = `${line}${taken > 0 ? ',' : ''} \`${oneLine(name)}\``
        if (left > 0 || [compactHead, ...lines, next].join('\n').length + reserve > maxCompactChars) {
          left += 1
          continue
        }
        line = next
        taken += 1
      }
      if (taken > 0) {
        lines.push(line)
      }
    }

    return { lines, left }
  }
  let names = namesWithin(0)
  if (names.left > 0) {
    // Room for the "more" line is reserved at its widest, so adding it can never break the cap.
    names = namesWithin(moreNames(facts.length).length + 1)
  }
  const compact = [
    compactHead, ...names.lines, ...(names.left > 0 ? [moreNames(names.left)] : []),
  ].join('\n')

  return { full, compact }
}

/**
 * Ledger order: element by element, and where one key is a prefix of the other, the LONGER one
 * first — an entry of a run composed under a step sorts ahead of that step's own entry, which is
 * written only once the composed run has finished.
 */
export const compareResultOrder = (a: readonly number[], b: readonly number[]): number => {
  for (let i = 0; i < Math.min(a.length, b.length); ++i) {
    if (a[i] !== b[i]) {
      return a[i]! - b[i]!
    }
  }

  return b.length - a.length
}

/** The root run of a composition — what a composed run's id (`<parent>/<step>`) starts with. */
export const rootRunOf = (runId: string): string => {
  const at = runId.indexOf('/')

  return at < 0 ? runId : runId.slice(0, at)
}

/**
 * How an entry is headed: the step, behind the path of composing steps between the ledger's root
 * run and the run that produced it. A root-run step is headed by its bare name.
 */
export const resultLabel = (ledger: string, runId: string, step: string): string => {
  const path = runId === ledger
    ? ''
    : runId.startsWith(`${ledger}/`)
      ? runId.slice(ledger.length + 1)
      : runId.slice(rootRunOf(runId).length + 1)

  return path !== '' ? `${path}/${step}` : step
}

const flatten = (value: unknown): string => {
  if (value == null) {
    return ''
  }
  if (typeof value === 'string') {
    return oneLine(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map(flatten).filter(part => part !== '').join(', ')
  }
  if (typeof value === 'object') {
    return Object.keys(value).sort(compare)
      .map(key => [key, flatten((value as Record<string, unknown>)[key])] as const)
      .filter(([, text]) => text !== '')
      .map(([key, text]) => `${key}: ${text}`)
      .join('; ')
  }

  return ''
}

/**
 * A model's schema-shaped summary as one capped line, the same bytes for the same answer.
 *
 * An object renders as `key: value` pairs in key order; one with a single key renders as that
 * value alone, so the default `{ summary }` answer reads as prose. The cap is applied here, after
 * the model answered — a cap in a prompt is a request.
 */
export const renderResultSummary = (
  answer: unknown, maxChars: number = DEFAULT_RESULT_SUMMARY_CHARS,
): string => {
  const single = typeof answer === 'object' && answer != null && !Array.isArray(answer)
    && Object.keys(answer).length === 1
    ? (answer as Record<string, unknown>)[Object.keys(answer)[0]!]
    : answer

  return truncateAt(flatten(single), maxChars)
}

const union = (left: readonly string[] | undefined, right: readonly string[] | undefined): string[] | undefined =>
  left == null && right == null ? undefined : [...new Set([...(left ?? []), ...(right ?? [])])]

const mergeStep = (base: StepResultsSpec | undefined, patch: StepResultsSpec): StepResultsSpec => {
  const extractors = union(base?.extractors, patch.extractors)
  const omit = union(base?.omit, patch.omit)
  const full = base?.full === RESULTS_EVERY_STEP || patch.full === RESULTS_EVERY_STEP
    ? RESULTS_EVERY_STEP
    : union(base?.full as string[] | undefined, patch.full as string[] | undefined)

  return {
    ...base,
    ...patch,
    ...(extractors != null ? { extractors } : {}),
    ...(omit != null ? { omit } : {}),
    ...(full != null ? { full } : {}),
  }
}

/**
 * Several declarations as one — a pipeline's own, then any overlay (a variant, a deployment).
 *
 * Later declarations win field by field, except the lists: extractors, `full` consumers and `omit`
 * consumers ACCUMULATE, the way skills do down an execution chain, because an overlay that adds an
 * extractor is not asking to lose the ones the pipeline declared. `'*'` in `full` absorbs names.
 */
export const mergeResultsSpecs = (
  ...specs: Array<CumulativeResultsSpec | null | undefined>
): CumulativeResultsSpec => {
  const merged: CumulativeResultsSpec = {}
  for (const spec of specs) {
    if (spec == null) {
      continue
    }
    const { steps, ...scalars } = spec
    Object.assign(merged, scalars)
    if (steps != null) {
      const into: Record<string, StepResultsSpec> = { ...merged.steps }
      for (const name of Object.keys(steps)) {
        into[name] = mergeStep(into[name], steps[name]!)
      }
      merged.steps = into
    }
  }

  return merged
}
