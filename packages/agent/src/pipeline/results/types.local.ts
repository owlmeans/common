import { type CumulativeResultEntry, type CumulativeResultFact, type CumulativeResultsSpec, type PipelineSpec, type StepResultsSpec, CumulativeResultSource, ResultViewMode } from '@owlmeans/agent-common'
import type { StepResults, VisibleResultEntry } from './types.js'

export interface Recorded {
  files: Set<string>
  facts: CumulativeResultFact[]
}

export interface Item {
  entry: CumulativeResultEntry
  mode: ResultViewMode
  /** Named as a full consumer by its producer — the last thing a budget touches. */
  explicit: boolean
  dropped: boolean
}

export interface RunLedger<C> {
  results: CumulativeResultsSpec
  spec: PipelineSpec
  runId: string
  ledger: string
  trail: number[]
  index: Map<string, number>
  entries: Map<string, CumulativeResultEntry>
  upstream: readonly VisibleResultEntry[]
  seeds: CumulativeResultEntry[]
  views: Map<string, StepResults>
  recorded: Map<string, Recorded>
  deps: C
}

export interface EntryParts {
  facts: CumulativeResultFact[]
  files: string[]
  source: CumulativeResultSource
  order: number[]
  spec?: StepResultsSpec
  partial?: boolean
  summary?: string
}
