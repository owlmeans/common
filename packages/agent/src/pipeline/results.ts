import { CumulativeResultSource, DEFAULT_RESULT_SUMMARY_CHARS, DEFAULT_RESULTS_MAX_CHARS, DEFAULT_RESULTS_WINDOW, RESULTS_EVERY_STEP, ResultViewMode, cumulativeResultsHelper, makePipelineSpecModel, type CumulativeResultEntry, type CumulativeResultFact, type PipelineState, type ResultSummarySpec, type StepResultsSpec } from '@owlmeans/agent-common'
import { promptRenderHelper } from '@owlmeans/llm'
import { logger } from '@owlmeans/log'
import type { CumulativeResults } from '@owlmeans/llm-common'
import { createMemoryCumulativeResultStore } from '../stores/memory.js'
import type { PipelinePlugin, PipelineRunContext } from './runner/types.js'
import type { StepResults, VisibleResultEntry, CumulativeResultsPluginOptions, ResultExtractFn, ResultExtractor, ResultsRunInfo } from './results/types.js'
import { SEPARATOR } from './consts.local.js'
import { CUMULATIVE_RESULTS_PLUGIN, DEFAULT_RESULT_SUMMARY_SCHEMA } from './consts.js'
import type { EntryParts, Item, Recorded, RunLedger } from './results/types.local.js'

const log = logger('agent:pipeline:results')

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

const keyOf = (runId: string, step: string): string => `${runId}\u0000${step}`

const normalizePath = (path: string): string =>
  path.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/{2,}/g, '/')

const uniqueSorted = (paths: Iterable<string>): string[] =>
  [...new Set([...paths].map(normalizePath).filter(path => path !== ''))].sort(compare)

const pathsOf = (facts: readonly CumulativeResultFact[]): string[] =>
  facts.flatMap(fact => fact.path != null && fact.path !== '' ? [fact.path] : [])

/** First occurrence of each fact key wins — a step's own recorded facts come first. */
const dedupe = (facts: readonly CumulativeResultFact[]): CumulativeResultFact[] => {
  const seen = new Set<string>()

  return facts.filter(fact => {
    const key = cumulativeResultsHelper.factKey(fact)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)

    return true
  })
}

const copyFact = (fact: CumulativeResultFact): CumulativeResultFact => ({
  ...fact,
  ...(fact.members != null ? { members: [...fact.members] } : {}),
  ...(fact.attrs != null ? { attrs: { ...fact.attrs } } : {}),
})

/**
 * Deep-frozen, because an entry is handed out by reference — to every view that shows it and to
 * every caller of `entries()` — and one caller editing it in place would edit all of them.
 */
const freezeEntry = (entry: CumulativeResultEntry): CumulativeResultEntry => Object.freeze({
  ...entry,
  order: Object.freeze([...entry.order]),
  files: Object.freeze([...entry.files]),
  facts: Object.freeze(entry.facts.map(fact => Object.freeze(copyFact(fact)))),
  ...(Array.isArray(entry.fullFor) ? { fullFor: Object.freeze([...entry.fullFor]) } : {}),
  ...(entry.omitFor != null ? { omitFor: Object.freeze([...entry.omitFor]) } : {}),
}) as CumulativeResultEntry

const hasExtractors = (spec: StepResultsSpec | undefined): boolean =>
  (spec?.extractors?.length ?? 0) > 0

const extractFn = <S extends PipelineState, C>(extractor: ResultExtractor<S, C>): ResultExtractFn<S, C> =>
  typeof extractor === 'function' ? extractor : extractor.extract

const summaryPrompt = (
  spec: ResultSummarySpec, label: string, facts: readonly CumulativeResultFact[],
  files: readonly string[], maxChars: number,
): string => [
  spec.instructions.trim(),
  `The step "${label}" has just finished. For the later steps of the same work, summarize what it `
  + 'decided or produced that the facts below do not already say. Do not repeat the facts and do not '
  + `guess at anything not shown. At most ${maxChars} characters.`,
  `# Facts read from the files after the step finished\n${facts.map(cumulativeResultsHelper.renderResultFact).join('\n') || '(none)'}`,
  `# Files the step answers for\n${files.map(file => `- ${file}`).join('\n') || '(none)'}`,
].join(SEPARATOR)

/**
 * CUMULATIVE PIPELINE RESULTS: every step is told, in its prompt and through a typed query, what
 * the steps before it produced — read from the files by code, not recalled by a model.
 *
 * - `enter` decides the LEDGER the run's entries belong to (its parent's for a composed run, else
 *   the root run's id). A fresh start or a restart forgets the run's own earlier entries; a
 *   continuation loads them and silently REBUILDS any that are missing from the finished steps'
 *   durable inputs — so a resume never depends on the ledger having survived, only the quality
 *   of what the next step is told does.
 * - `beforeStep` cuts the step's VIEW once: every predecessor's entry, full within the window or
 *   when the producer names the step, names only otherwise, inside a character budget that drops
 *   the oldest entries to names only and then out — never cutting an entry's own text.
 * - `afterStep` extracts the step's entry from its durable scope and what it recorded, leaves any
 *   fact an earlier entry already owns to that entry, re-extracts earlier entries whose files the
 *   step rewrote, and persists — all before the runner marks the step complete.
 * - `passStep` gives a skipped step the entry its files still support, and an optional step that
 *   failed a partial one.
 *
 * Everything here is an enhancement. A store that fails, an extractor that throws or a summary
 * that cannot be had costs a step some context and is logged; it never fails the run.
 */
export const cumulativeResultsPlugin = <S extends PipelineState, C>(
  options: CumulativeResultsPluginOptions<S, C>,
): PipelinePlugin<S, C> => {
  const alias = options.alias ?? CUMULATIVE_RESULTS_PLUGIN
  const store = options.store ?? createMemoryCumulativeResultStore()
  const trace = options.trace ?? (() => undefined)
  const runs = new Map<string, RunLedger<C>>()

  const warn = (what: string, e?: unknown): void => {
    log.warn('Cumulative results warning', { plugin: alias, what, ...(e != null ? { error: e } : {}) })
  }

  const say = (run: RunLedger<C>, line: string): void => {
    trace(`[results:${run.spec.alias}:${run.runId}] ${line}`)
  }

  const orderOf = (run: RunLedger<C>, step: string): number[] =>
    [...run.trail, run.index.get(step) ?? 0]

  /**
   * The ledger as the store holds it — except this run's own entries, which only this plugin writes
   * and whose in-memory copy is therefore never older than the stored one (a failed `put` leaves
   * the store behind, never ahead). A store that cannot be read leaves what is held untouched.
   */
  const reload = async (run: RunLedger<C>): Promise<void> => {
    let listed: CumulativeResultEntry[]
    try {
      listed = await store.list(run.ledger)
    } catch (e) {
      warn(`could not read ledger ${run.ledger}`, e)
      return
    }
    const next = new Map<string, CumulativeResultEntry>()
    for (const entry of listed) {
      next.set(keyOf(entry.runId, entry.step), freezeEntry(entry))
    }
    for (const [key, entry] of run.entries) {
      if (entry.runId === run.runId) {
        next.set(key, entry)
      }
    }
    run.entries = next
  }

  const persist = async (run: RunLedger<C>, entry: CumulativeResultEntry): Promise<void> => {
    run.entries.set(keyOf(entry.runId, entry.step), entry)
    try {
      // A plain copy: a store adapter may annotate what it is given (an `_id`), and the held entry
      // is frozen.
      await store.put(JSON.parse(JSON.stringify(entry)) as CumulativeResultEntry)
    } catch (e) {
      warn(`could not store ${entry.label}; a resume will rebuild it`, e)
    }
  }

  /** The step of THIS run an entry belongs to: its own step, or the step a composed run ran under. */
  const anchorOf = (run: RunLedger<C>, entry: CumulativeResultEntry): string | null => {
    if (entry.runId === run.runId) {
      return entry.step
    }
    if (entry.runId.startsWith(`${run.runId}/`)) {
      return entry.runId.slice(run.runId.length + 1).split('/')[0] ?? null
    }

    return null
  }

  const modeFor = (
    run: RunLedger<C>, entry: CumulativeResultEntry, consumer: string, depth: number,
  ): Pick<Item, 'mode' | 'explicit'> => {
    if (entry.omitFor?.includes(consumer) === true) {
      return { mode: ResultViewMode.Omitted, explicit: false }
    }
    if (entry.fullFor === RESULTS_EVERY_STEP) {
      return { mode: ResultViewMode.Full, explicit: false }
    }
    if (Array.isArray(entry.fullFor) && entry.fullFor.includes(consumer)) {
      return { mode: ResultViewMode.Full, explicit: true }
    }
    const window = entry.window ?? run.results.window ?? DEFAULT_RESULTS_WINDOW

    return { mode: depth <= window ? ResultViewMode.Full : ResultViewMode.Compact, explicit: false }
  }

  /**
   * Every entry a step can see, oldest first, as its producer's declaration shows it: what the run
   * was handed by the step it is composed under, the seeds, then every predecessor's entry and the
   * entries of runs composed under a predecessor. Nothing else — a sibling branch has not
   * necessarily run, so what it says cannot be what a step relies on.
   */
  const visibleTo = (run: RunLedger<C>, step: string): Item[] => {
    const depths = new Map(makePipelineSpecModel(run.spec).ancestry(step).map(({ step: name, depth }) => [name, depth]))
    const items: Item[] = [
      ...run.upstream.map(visible => ({
        entry: visible.entry, mode: visible.mode, explicit: false, dropped: visible.dropped === true,
      })),
      ...run.seeds.map(entry => ({ entry, mode: ResultViewMode.Full, explicit: false, dropped: false })),
    ]
    for (const entry of run.entries.values()) {
      const anchor = anchorOf(run, entry)
      const depth = anchor != null ? depths.get(anchor) : undefined
      if (depth != null) {
        items.push({ entry, ...modeFor(run, entry, step, depth), dropped: false })
      }
    }

    return items.sort((a, b) =>
      cumulativeResultsHelper.compareResultOrder(a.entry.order, b.entry.order) || compare(a.entry.label, b.entry.label))
  }

  const textOf = (item: Item): string =>
    item.mode === ResultViewMode.Full
      ? item.entry.full
      : item.mode === ResultViewMode.Compact ? item.entry.compact : ''

  /** The step's view, inside the budget. See the plugin's own description for the order of cuts. */
  const cut = (run: RunLedger<C>, step: string): StepResults => {
    const items = visibleTo(run, step)
    const maxChars = run.results.maxChars ?? DEFAULT_RESULTS_MAX_CHARS
    const measure = (): number =>
      items.map(textOf).filter(text => text !== '').join(SEPARATOR).length

    let total = measure()
    const downgrade = (explicit: boolean, from: ResultViewMode): void => {
      for (const item of items) {
        if (total <= maxChars) {
          return
        }
        if (item.explicit !== explicit || item.mode !== from || textOf(item) === '') {
          continue
        }
        if (from === ResultViewMode.Full) {
          item.mode = ResultViewMode.Compact
        } else {
          item.mode = ResultViewMode.Omitted
          item.dropped = true
        }
        total = measure()
      }
    }
    // Oldest first, and whatever a producer has not named this step for goes before what it has.
    downgrade(false, ResultViewMode.Full)
    downgrade(false, ResultViewMode.Compact)
    downgrade(true, ResultViewMode.Full)
    downgrade(true, ResultViewMode.Compact)

    const sections = items
      .filter(item => textOf(item) !== '')
      .map(item => Object.freeze({ step: item.entry.label, text: textOf(item) }))
    const omitted = items
      .filter(item => item.mode === ResultViewMode.Omitted && item.dropped && item.entry.full !== '')
      .map(item => item.entry.label)
    const joined = sections.map(section => section.text).join(SEPARATOR)
    const view: CumulativeResults = Object.freeze({
      step: cumulativeResultsHelper.resultLabel(run.ledger, run.runId, step),
      sections: Object.freeze(sections) as CumulativeResults['sections'],
      omitted: Object.freeze(omitted) as string[],
      chars: joined.length,
      digest: promptRenderHelper.prefixHash(`${joined}\u0000${omitted.join('\u0000')}`),
    })
    const visible: readonly VisibleResultEntry[] = Object.freeze(items.map(item => Object.freeze({
      entry: item.entry, mode: item.mode, ...(item.dropped ? { dropped: true } : {}),
    })))

    say(run, `${step} view · sections=${sections.length} chars=${view.chars}`
      + ` omitted=${omitted.length} digest=${view.digest}`)

    const results: StepResults = {
      ledger: run.ledger,
      order: Object.freeze(orderOf(run, step)),
      view,
      entries: () => visible,
      facts: (query = {}) => visible.flatMap(({ entry }) =>
        query.step == null || entry.step === query.step || entry.label === query.step
          ? entry.facts
            .filter(fact => (query.kind == null || fact.kind === query.kind)
              && (query.name == null || fact.name === query.name))
            .map(copyFact)
          : []),
      record: input => {
        const buffer = run.recorded.get(step) ?? { files: new Set<string>(), facts: [] }
        for (const file of input.files ?? []) {
          buffer.files.add(normalizePath(file))
        }
        buffer.facts.push(...(input.facts ?? []).map(copyFact))
        run.recorded.set(step, buffer)
      },
    }

    return Object.freeze(results)
  }

  const take = (run: RunLedger<C>, step: string): Recorded => {
    const buffer = run.recorded.get(step) ?? { files: new Set<string>(), facts: [] }
    run.recorded.delete(step)

    return buffer
  }

  const scopeOf = async (run: RunLedger<C>, step: string, state: Readonly<S>): Promise<string[]> => {
    const files: string[] = []
    for (const name of run.results.steps?.[step]?.extractors ?? []) {
      const extractor = options.extractors?.[name]
      if (extractor == null || typeof extractor === 'function' || extractor.scope == null) {
        continue
      }
      try {
        files.push(...await extractor.scope({
          pipeline: run.spec.alias, runId: run.runId, step, state, deps: run.deps,
        }))
      } catch (e) {
        warn(`scope of extractor ${name} failed for ${step}`, e)
      }
    }

    return uniqueSorted(files)
  }

  const extract = async (
    run: RunLedger<C>, step: string, state: Readonly<S>,
    files: readonly string[], changed: readonly string[],
  ): Promise<CumulativeResultFact[]> => {
    const facts: CumulativeResultFact[] = []
    for (const name of run.results.steps?.[step]?.extractors ?? []) {
      const extractor = options.extractors?.[name]
      if (extractor == null) {
        warn(`step ${step} names an extractor nobody registered: ${name}`)
        continue
      }
      try {
        facts.push(...(await extractFn(extractor)({
          pipeline: run.spec.alias, runId: run.runId, step, state, deps: run.deps, files, changed,
        }) ?? []))
      } catch (e) {
        warn(`extractor ${name} failed for ${step}`, e)
      }
    }

    return facts
  }

  /**
   * Facts no earlier entry already owns. "Earlier" is what the step can see, plus the runs composed
   * under the step itself, whose entries are written before the step's own.
   */
  const unowned = (
    run: RunLedger<C>, step: string, facts: readonly CumulativeResultFact[],
  ): CumulativeResultFact[] => {
    const owned = new Set<string>()
    for (const item of visibleTo(run, step)) {
      for (const fact of item.entry.facts) {
        owned.add(cumulativeResultsHelper.factKey(fact))
      }
    }
    for (const entry of run.entries.values()) {
      if (entry.runId.startsWith(`${run.runId}/${step}`) && anchorOf(run, entry) === step) {
        for (const fact of entry.facts) {
          owned.add(cumulativeResultsHelper.factKey(fact))
        }
      }
    }

    return facts.filter(fact => !owned.has(cumulativeResultsHelper.factKey(fact)))
  }

  /** A step's facts and files, from its durable scope, what it recorded, and its extractors. */
  const collect = async (
    run: RunLedger<C>, step: string, state: Readonly<S>,
    changed: readonly string[], recorded: readonly CumulativeResultFact[],
  ): Promise<{ facts: CumulativeResultFact[], files: string[] }> => {
    const files = uniqueSorted([...await scopeOf(run, step, state), ...changed])
    const facts = unowned(run, step, dedupe([...recorded, ...await extract(run, step, state, files, changed)]))

    return { facts, files: uniqueSorted([...files, ...pathsOf(facts)]) }
  }

  const compose = (run: RunLedger<C>, step: string, parts: EntryParts): CumulativeResultEntry => {
    const previous = run.entries.get(keyOf(run.runId, step))
    const label = cumulativeResultsHelper.resultLabel(run.ledger, run.runId, step)
    const source = parts.facts.length === 0 && parts.summary != null
      ? CumulativeResultSource.Summarized
      : parts.source
    const facts = cumulativeResultsHelper.sortFacts(parts.facts)
    const rendered = cumulativeResultsHelper.renderResultEntry(
      { label, source, facts, ...(parts.partial === true ? { partial: true } : {}), ...(parts.summary != null ? { summary: parts.summary } : {}) },
      {
        maxChars: parts.spec?.maxChars ?? run.results.maxEntryChars,
        maxCompactChars: parts.spec?.maxCompactChars ?? run.results.maxCompactChars,
      },
    )

    return freezeEntry({
      ledger: run.ledger,
      pipeline: run.spec.alias,
      runId: run.runId,
      step,
      label,
      order: parts.order,
      revision: (previous?.revision ?? 0) + 1,
      source,
      ...(parts.partial === true ? { partial: true } : {}),
      facts,
      files: parts.files,
      ...(parts.summary != null ? { summary: parts.summary } : {}),
      full: rendered.full,
      compact: rendered.compact,
      ...(parts.spec?.full != null ? { fullFor: parts.spec.full } : {}),
      ...(parts.spec?.omit != null ? { omitFor: parts.spec.omit } : {}),
      ...(parts.spec?.window != null ? { window: parts.spec.window } : {}),
      updatedAt: new Date().toISOString(),
    })
  }

  /**
   * Re-read every earlier entry of this run whose files the step just rewrote — a repair of an
   * earlier step's output would otherwise leave that step's entry describing a file that no longer
   * says it. The refreshed entry keeps what its extractors find now, plus its earlier facts about
   * files the step did not touch.
   */
  const refreshEarlier = async (
    run: RunLedger<C>, step: string, changed: readonly string[], state: Readonly<S>,
  ): Promise<void> => {
    if (changed.length === 0) {
      return
    }
    const mine = orderOf(run, step)
    const earlier = [...run.entries.values()]
      .filter(entry => entry.runId === run.runId && entry.step !== step
        && cumulativeResultsHelper.compareResultOrder(entry.order, mine) < 0)
      .sort((a, b) => cumulativeResultsHelper.compareResultOrder(a.order, b.order))

    for (const entry of earlier) {
      const spec = run.results.steps?.[entry.step]
      if (!hasExtractors(spec) || (spec?.refresh ?? run.results.refresh ?? true) === false) {
        continue
      }
      const overlap = entry.files.filter(file => changed.includes(file))
      if (overlap.length === 0) {
        continue
      }
      const fresh = await extract(run, entry.step, state, entry.files, overlap)
      const freshKeys = new Set(fresh.map(cumulativeResultsHelper.factKey))
      const kept = entry.facts.filter(fact => !freshKeys.has(cumulativeResultsHelper.factKey(fact))
        && (fact.path == null || !overlap.includes(normalizePath(fact.path))))
      const facts = unowned(run, entry.step, dedupe([...fresh, ...kept]))
      const refreshed = compose(run, entry.step, {
        facts,
        files: uniqueSorted([...entry.files, ...pathsOf(facts)]),
        source: entry.source === CumulativeResultSource.Summarized
          ? CumulativeResultSource.Extracted
          : entry.source,
        order: [...entry.order],
        ...(spec != null ? { spec } : {}),
        ...(entry.partial === true ? { partial: true } : {}),
        ...(entry.summary != null ? { summary: entry.summary } : {}),
      })
      await persist(run, refreshed)
      say(run, `${step} rewrote ${overlap.length} file(s) of ${entry.label} · revision=${refreshed.revision}`)
    }
  }

  const summaryOf = async (
    run: RunLedger<C>, step: string, ctx: PipelineRunContext<S, C>, state: Readonly<S>,
    facts: readonly CumulativeResultFact[], files: readonly string[],
  ): Promise<string | undefined> => {
    const spec = run.results.steps?.[step]?.summary
    if (spec == null || options.summarize == null) {
      return undefined
    }
    const maxChars = spec.maxChars ?? DEFAULT_RESULT_SUMMARY_CHARS
    const label = cumulativeResultsHelper.resultLabel(run.ledger, run.runId, step)
    try {
      const answer = await options.summarize({
        ...spec,
        schema: spec.schema ?? DEFAULT_RESULT_SUMMARY_SCHEMA,
        maxChars,
        pipeline: run.spec.alias,
        runId: run.runId,
        step,
        label,
        facts,
        files,
        state,
        deps: run.deps,
        signal: ctx.signal,
        prompt: summaryPrompt(spec, label, facts, files, maxChars),
      })
      const text = cumulativeResultsHelper.renderResultSummary(answer, maxChars)

      return text !== '' ? text : undefined
    } catch (e) {
      // A summary is the unverified extra. Without it the step's facts still stand.
      warn(`summary of ${step} failed; the entry goes without one`, e)
      return undefined
    }
  }

  return {
    alias,
    ...(options.order != null ? { order: options.order } : {}),

    enter: async event => {
      runs.delete(event.runId)
      const info: ResultsRunInfo<S, C> = {
        pipeline: event.spec.alias,
        spec: event.spec,
        runId: event.runId,
        scope: event.scope,
        ...(event.entityId != null ? { entityId: event.entityId } : {}),
        deps: event.deps,
        state: event.state,
        mode: event.mode,
        ...(event.parent != null ? { parent: event.parent } : {}),
      }
      const declared = typeof options.spec === 'function' ? await options.spec(info) : options.spec
      if (declared == null || declared === false) {
        return
      }

      const parent = event.parent?.results
      const ledger = options.ledger?.(info) ?? parent?.ledger ?? cumulativeResultsHelper.rootRunOf(event.runId)
      const run: RunLedger<C> = {
        results: declared,
        spec: event.spec,
        runId: event.runId,
        ledger,
        trail: parent != null ? [...parent.order] : [],
        index: new Map(makePipelineSpecModel(event.spec).orderSteps().map((step, at) => [step, at + 1])),
        entries: new Map(),
        upstream: parent != null ? parent.entries() : [],
        seeds: [],
        views: new Map(),
        recorded: new Map(),
        deps: event.deps,
      }

      if (event.mode !== 'continue') {
        try {
          await store.clear(ledger, event.runId)
        } catch (e) {
          warn(`could not clear the earlier entries of ${event.runId}`, e)
        }
      }
      await reload(run)

      for (const name of Object.keys(options.seeds ?? {}).sort(compare)) {
        try {
          const facts = dedupe(await options.seeds![name]!(info))
          run.seeds.push(compose(run, name, {
            facts, files: uniqueSorted(pathsOf(facts)), source: CumulativeResultSource.Seeded,
            order: [...run.trail, 0],
          }))
        } catch (e) {
          warn(`seed ${name} failed`, e)
        }
      }
      runs.set(event.runId, run)

      // A continuation's finished steps must have their entries, whether or not the ledger kept
      // them — a store outage, an expiry, a crash between a fact and its `put`. They are read again
      // from the steps' DURABLE inputs; never from what a step once recorded, which is gone.
      let rebuilt = 0
      for (const step of event.inherited) {
        if (run.entries.has(keyOf(run.runId, step)) || !hasExtractors(run.results.steps?.[step])) {
          continue
        }
        const collected = await collect(run, step, event.state, [], [])
        await persist(run, compose(run, step, {
          ...collected, source: CumulativeResultSource.Rebuilt, order: orderOf(run, step),
          ...(run.results.steps?.[step] != null ? { spec: run.results.steps[step] } : {}),
        }))
        rebuilt += 1
      }
      say(run, `enter ${event.mode} · ledger=${ledger} entries=${run.entries.size} rebuilt=${rebuilt}`)
    },

    beforeStep: async ({ step, ctx }) => {
      const run = runs.get(ctx.runId)
      if (run == null) {
        return
      }
      const memo = run.views.get(step)
      if (memo != null) {
        return { results: memo }
      }
      // A run composed under an earlier step wrote its entries through its own plugin instance.
      await reload(run)
      const results = cut(run, step)
      run.views.set(step, results)

      return { results }
    },

    afterStep: async ({ step, ctx, state }) => {
      const run = runs.get(ctx.runId)
      if (run == null) {
        return
      }
      const buffer = take(run, step)
      const spec = run.results.steps?.[step]
      if (spec == null && buffer.files.size === 0 && buffer.facts.length === 0
        && !run.entries.has(keyOf(run.runId, step))) {
        return
      }
      await reload(run)
      const changed = uniqueSorted(buffer.files)
      await refreshEarlier(run, step, changed, state)
      const collected = await collect(run, step, state, changed, buffer.facts)
      const summary = await summaryOf(run, step, ctx, state, collected.facts, collected.files)
      const entry = compose(run, step, {
        ...collected, source: CumulativeResultSource.Extracted, order: orderOf(run, step),
        ...(spec != null ? { spec } : {}), ...(summary != null ? { summary } : {}),
      })
      await persist(run, entry)
      say(run, `${step} entry · facts=${entry.facts.length} files=${entry.files.length} revision=${entry.revision}`)
    },

    passStep: async ({ step, ctx, state, reason }) => {
      const run = runs.get(ctx.runId)
      if (run == null) {
        return
      }
      const buffer = take(run, step)
      const spec = run.results.steps?.[step]
      await reload(run)

      if (reason === 'skipped') {
        // A guard that skips is saying the work is already there. What its files support is what
        // the step's entry is; what a real earlier run stored stands as it is.
        if (run.entries.has(keyOf(run.runId, step)) || !hasExtractors(spec)) {
          return
        }
        const collected = await collect(run, step, state, [], [])
        await persist(run, compose(run, step, {
          ...collected, source: CumulativeResultSource.Rebuilt, order: orderOf(run, step),
          ...(spec != null ? { spec } : {}),
        }))
        return
      }

      if (spec == null && buffer.files.size === 0 && buffer.facts.length === 0) {
        return
      }
      const changed = uniqueSorted(buffer.files)
      await refreshEarlier(run, step, changed, state)
      const collected = await collect(run, step, state, changed, buffer.facts)
      await persist(run, compose(run, step, {
        ...collected, source: CumulativeResultSource.Extracted, order: orderOf(run, step),
        partial: true, ...(spec != null ? { spec } : {}),
      }))
    },

    exit: async ({ runId }) => {
      runs.delete(runId)
    },
  }
}
