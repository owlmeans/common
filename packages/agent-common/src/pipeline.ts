import { makePipelineSpecModel } from './models/pipeline-spec.js'
import type { PipelineSpec, PipelineStepSpec } from './types.js'

/** @deprecated compat:factory-refactor — use `makePipelineSpecModel(spec).validate()` */
export const validatePipelineSpec = (spec: PipelineSpec): void => makePipelineSpecModel(spec).validate()

/** @deprecated compat:factory-refactor — use `makePipelineSpecModel(spec).orderSteps()` */
export const orderPipelineSteps = (spec: PipelineSpec): string[] => makePipelineSpecModel(spec).orderSteps()

/** @deprecated compat:factory-refactor — use `makePipelineSpecModel(spec).descendants(…)` */
export const pipelineDescendants = (spec: PipelineSpec, step: string): string[] =>
  makePipelineSpecModel(spec).descendants(step)

/** @deprecated compat:factory-refactor — use `makePipelineSpecModel(spec).stepOf(…)` */
export const pipelineStep = (spec: PipelineSpec, step: string): PipelineStepSpec | null =>
  makePipelineSpecModel(spec).stepOf(step)
