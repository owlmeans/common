import {
  ExecutionLevel, type CumulativeResults, type ExecutionState, type TaskExecutionState,
} from '@owlmeans/llm-common'
import type { Execution, TaskExecution } from './types.js'
import type { ExecutionStateHelper } from './state/types.js'

export const createExecutionStateHelper = (): ExecutionStateHelper => {
  const freeze = <T extends object>(o: T): Readonly<T> => Object.freeze(o)

  const freezeResults = (results: CumulativeResults): CumulativeResults => Object.freeze({
    ...results,
    sections: Object.freeze(results.sections.map(section => Object.freeze({ ...section }))),
    omitted: Object.freeze([...results.omitted]),
  }) as CumulativeResults

  const composeExecState = (exec: Execution, collaboratorKeys: string[]): ExecutionState => {
    const state: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(exec)) {
      if (!collaboratorKeys.includes(key)) {
        state[key] = value
      }
    }
    return state as unknown as ExecutionState
  }

  const composeTaskState = (exec: TaskExecution, collaboratorKeys: string[]): TaskExecutionState => {
    const base = composeExecState(exec, collaboratorKeys) as TaskExecutionState
    const prior = exec.state ?? ({} as TaskExecutionState)
    return {
      ...base,
      level: ExecutionLevel.Task,
      phase: prior.phase,
      completed: prior.completed,
      cursor: prior.cursor,
      data: prior.data,
    }
  }

  return { freeze, freezeResults, composeExecState, composeTaskState }
}

export const executionStateHelper = createExecutionStateHelper()
