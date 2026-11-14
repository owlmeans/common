import type { PipelineStep } from '@owlmeans/agent'
import type { ResearchDeps } from '../../types.js'
import type { PackagesState } from './types.js'

/** One step of `research:packages`. */
export interface PackagesStepImpl extends PipelineStep<PackagesState, ResearchDeps> {}
