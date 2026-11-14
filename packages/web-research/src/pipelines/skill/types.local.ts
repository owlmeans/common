import type { PipelineStep } from '@owlmeans/agent'
import type { ResearchDeps, ResearchGap } from '../../types.js'
import type { SkillState } from './types.js'

/** One step of `research:skill`. */
export interface SkillStepImpl extends PipelineStep<SkillState, ResearchDeps> {}

/** What the composed packages run hands back before its gaps move to the step record. */
export interface SkillNotesPatch extends Partial<SkillState> {
  childGaps?: ResearchGap[]
}
