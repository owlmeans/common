import type { PipelineStep } from '@owlmeans/agent'
import type { ResearchDeps } from '../../types.js'
import type { ImplementationState } from './types.js'

/** One step of `research:implementation`. */
export interface ImplementationStepImpl extends PipelineStep<ImplementationState, ResearchDeps> {}
