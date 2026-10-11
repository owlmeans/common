import type { CumulativeResults, ExecutionState, TaskExecutionState } from '@owlmeans/llm-common'
import type { Execution, TaskExecution } from '../types.js'

/** An execution's immutability and its JSON-safe state. */
export interface ExecutionStateHelper {
  freeze: <T extends object>(o: T) => Readonly<T>
  /**
   * A private, deep-frozen copy of a results view.
   *
   * Deep because the view is shared by reference down the whole execution chain — every task and
   * helper derived from the execution carrying it — and one caller editing a section in place would
   * change the prompt of every other.
   */
  freezeResults: (results: CumulativeResults) => CumulativeResults
  /**
   * Project an execution down to its JSON-safe state: every own field except the declared
   * collaborators. Domain fields added by a consumer are carried through automatically,
   * which is what lets an extended execution be persisted without extra wiring.
   */
  composeExecState: (exec: Execution, collaboratorKeys: string[]) => ExecutionState
  /**
   * Same as {@link ExecutionStateHelper.composeExecState}, plus the resumable task fields carried
   * over from the execution's PRIOR state (they live only there — `phase`/`cursor`/`completed`/`data`
   * are advanced by the workflow, not by refinement).
   */
  composeTaskState: (exec: TaskExecution, collaboratorKeys: string[]) => TaskExecutionState
}
