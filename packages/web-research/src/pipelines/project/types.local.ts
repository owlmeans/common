import type { PipelineStep } from '@owlmeans/agent'
import type { ResearchDeps } from '../../types.js'
import type { ProjectState } from './types.js'

/** One step of `research:project`. */
export interface ProjectStepImpl extends PipelineStep<ProjectState, ResearchDeps> {}
