import { makeLlmModel } from '@owlmeans/llm'
import type { Execution, HelperExecution, LlmModel, LlmSpectator } from '@owlmeans/llm'
import { DEFAULT_READER_ROLE, type ReaderTask } from './consts.js'
import type { ReaderModels, ReaderModelsOptions } from './execution/types.js'

/** A sink that keeps nothing — a reader with no spectator still satisfies the model's contract. */
const silent: LlmSpectator = {
  log: async arg => ({ id: '', kind: 'general', model: arg.model ?? '', purpose: { type: 'llm-reader' }, timestamp: Date.now(), ...arg }),
}

/**
 * Reader models bound to the caller's execution: one helper execution per reader task, refined from it — so every reader
 * call runs on the model policy, prompt policy and spectator of the run it belongs to. Built on
 * first use and kept.
 */
export const makeReaderModels = (exec: Execution, options: ReaderModelsOptions): ReaderModels => {
  const helpers = new Map<ReaderTask, HelperExecution>()
  const models = new Map<ReaderTask, LlmModel>()

  const helper = (task: ReaderTask): HelperExecution => {
    let found = helpers.get(task)
    if (found == null) {
      found = options.executions.forHelper(exec, {
        role: options.roles?.[task] ?? DEFAULT_READER_ROLE, dedication: `reader:${task}`,
      }) as HelperExecution
      helpers.set(task, found)
    }
    return found
  }

  const model = (task: ReaderTask): LlmModel => {
    let found = models.get(task)
    if (found == null) {
      // A helper execution is itself a complete set of model options: model, purpose, prompt policy.
      found = makeLlmModel(helper(task), options.spectator ?? silent)
      models.set(task, found)
    }
    return found
  }

  return { model, helper }
}
