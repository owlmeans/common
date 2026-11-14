import type { BaseCheckpointSaver } from '@langchain/langgraph'
import type { PipelineModel, PipelineRunStore } from '@owlmeans/agent'
import type { PipelineProgress } from '@owlmeans/agent-common'
import type { LlmSpectator, WebSearch } from '@owlmeans/llm'
import type { LlmReader, PageRenderer } from '@owlmeans/llm-reader'
import type { PackageInspector } from '@owlmeans/package-inspector'
import type { ResearchModels } from '../models/types.js'
import type { InjectionSignalKind } from '../screen/consts.js'
import type { ResearchScreen } from '../screen/types.js'
import type { ResearchStore } from '../store/types.js'
import type { ResearchDeps, ResearchLimits } from '../types.js'
import type { DesignState } from './design/types.js'
import type { ImplementationState } from './implementation/types.js'
import type { PackagesState } from './packages/types.js'
import type { ProjectState } from './project/types.js'
import type { SkillState } from './skill/types.js'

/** Provider-hosted web search — exactly `@owlmeans/llm`'s `WebSearch['search']` (`llm.webSearch(alias)` is one). */
export interface ResearchSearch extends Pick<WebSearch, 'search'> {}

/** The collaborators every research pipeline closes over. */
export interface ResearchWiring {
  models: ResearchModels
  store: ResearchStore
  /** Clones and crawls; its guard, proxies and injected fetch govern every request. */
  reader: LlmReader
  /** Absent: implementation research records `search-unavailable` and writes no report. */
  search?: ResearchSearch | null
  /** Handed to every web search (`WebSearchOptions.spectator`) — what bills and traces a search. */
  spectator?: LlmSpectator
  /** Required by `research:packages` (and `research:skill` without notes). */
  inspector?: PackageInspector | null
  /** The model judgement over flagged sources; `makeResearchJudge(models)` is the shipped one. */
  screen?: ResearchScreen | null
  /** Renders a design bundle offline (borrowed, never closed). */
  renderer?: PageRenderer
  /** The signals that drop a source when no judge decides; `STRONG_SIGNAL_KINDS` by default. */
  strongSignals?: readonly InjectionSignalKind[]
  limits?: Partial<ResearchLimits>
  /** Where run rows live — without it a run is not resumable. */
  runs?: PipelineRunStore
  checkpointer?: BaseCheckpointSaver
  fatal?: (e: unknown) => boolean
  maxStateChars?: number
  trace?: (line: string) => void
  onProgress?: (progress: PipelineProgress) => void
}

/** Every research pipeline, built over one wiring. */
export interface ResearchPipelines {
  implementation: PipelineModel<ImplementationState, ResearchDeps>
  project: PipelineModel<ProjectState, ResearchDeps>
  design: PipelineModel<DesignState, ResearchDeps>
  packages: PipelineModel<PackagesState, ResearchDeps>
  skill: PipelineModel<SkillState, ResearchDeps>
}
