import type { PipelineOptions } from '@owlmeans/agent'
import type { PipelineState } from '@owlmeans/agent-common'
import type { ResearchDeps, ResearchLimits } from '../types.js'
import type { RunArea } from './area/types.js'
import type { SourceCloner } from './clone/types.js'
import type { SourceScreener } from './screening/types.js'
import type { SourcesHelper } from './sources/types.js'
import type { ResearchWiring } from './types.js'

/** The runner options every pipeline shares — none depends on the state shape. */
export interface ResearchRunnerOptions
  extends Pick<PipelineOptions<PipelineState, ResearchDeps>, 'runs' | 'checkpointer' | 'fatal' | 'maxStateChars' | 'trace' | 'onProgress'> {}

/** What each pipeline factory is built from. */
export interface ResearchKit {
  wiring: ResearchWiring
  limits: ResearchLimits
  runner: ResearchRunnerOptions
  sources: SourcesHelper
  area: (runId: string) => RunArea
  cloner: (area: RunArea) => SourceCloner
  screener: (area: RunArea, purpose: string) => SourceScreener
}

