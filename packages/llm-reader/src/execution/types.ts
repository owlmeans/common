import type { ExecutionService, HelperExecution, LlmModel, LlmSpectator } from '@owlmeans/llm'
import type { ModelRole } from '@owlmeans/llm-common'
import type { ReaderTask } from '../consts.js'

/**
 * Where a reader's model calls run. Text mode needs a model; DOM mode needs a helper execution,
 * because the agent it runs (`@owlmeans/agent`) is built over one.
 */
export interface ReaderModels {
  model: (task: ReaderTask) => LlmModel
  /** `undefined` when the reader was given a bare model — DOM mode is then unavailable. */
  helper: (task: ReaderTask) => HelperExecution | undefined
}

export interface ReaderModelsOptions {
  /** The service that refines the execution into helpers. */
  executions: ExecutionService
  /** Model role per task; {@link DEFAULT_READER_ROLE} for any not named. */
  roles?: Partial<Record<ReaderTask, ModelRole>>
  /** Records every call; a silent sink when omitted. */
  spectator?: LlmSpectator
}
