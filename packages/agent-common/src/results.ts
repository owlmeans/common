import { DEFAULT_RESULT_COMPACT_CHARS, DEFAULT_RESULT_ENTRY_CHARS, DEFAULT_RESULT_SUMMARY_CHARS, RESULTS_EVERY_STEP, CumulativeFactKind, CumulativeResultSource } from './consts.js'
import { truncateAt } from './helpers/truncate.js'
import { NAMES_ONLY, NOT_VERIFIED, PARTIAL_EMPTY, PARTIAL_WITH_FACTS, SEEDED, SUMMARY_ALONE, SUMMARY_LEFT_OUT, SUMMARY_WITH_FACTS } from './consts.local.js'
import type {
  CumulativeResultFact, CumulativeResultsHelper, CumulativeResultsSpec, RenderableResultEntry, RenderedResultEntry,
  ResultRenderCaps, StepResultsSpec,
} from './results/types.js'

export const createCumulativeResultsHelper = (): CumulativeResultsHelper => {
  const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

  const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

  const factKey = (fact: CumulativeResultFact): string =>
    `${fact.kind}\u0000${fact.name}\u0000${fact.specifier ?? fact.path ?? ''}`

  /** File facts last — a location is the first thing a budget can spare, a shape the last. */
  const kindRank = (kind: string): number => kind === CumulativeFactKind.File ? 1 : 0

  const sortFacts = (facts: readonly CumulativeResultFact[]): CumulativeResultFact[] =>
    [...facts].sort((a, b) =>
      kindRank(a.kind) - kindRank(b.kind)
      || compare(a.kind, b.kind)
      || compare(a.name, b.name)
      || compare(a.specifier ?? a.path ?? '', b.specifier ?? b.path ?? ''))

  const renderResultFact = (fact: CumulativeResultFact): string => {
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

  const renderResultEntry = (
    entry: RenderableResultEntry, caps: ResultRenderCaps = {},
  ): RenderedResultEntry => {
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

  const compareResultOrder = (a: readonly number[], b: readonly number[]): number => {
    for (let i = 0; i < Math.min(a.length, b.length); ++i) {
      if (a[i] !== b[i]) {
        return a[i]! - b[i]!
      }
    }

    return b.length - a.length
  }

  const rootRunOf = (runId: string): string => {
    const at = runId.indexOf('/')

    return at < 0 ? runId : runId.slice(0, at)
  }

  const resultLabel = (ledger: string, runId: string, step: string): string => {
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

  const renderResultSummary = (
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

  const mergeResultsSpecs = (
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

  return {
    factKey, sortFacts, renderResultFact, renderResultEntry, compareResultOrder, rootRunOf, resultLabel,
    renderResultSummary, mergeResultsSpecs,
  }
}

export const cumulativeResultsHelper = createCumulativeResultsHelper()
