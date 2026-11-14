import type { PipelineStep } from '@owlmeans/agent'
import type { ResearchDeps } from '../../types.js'
import type { DesignState } from './types.js'

/** One step of `research:design`. */
export interface DesignStepImpl extends PipelineStep<DesignState, ResearchDeps> {}
