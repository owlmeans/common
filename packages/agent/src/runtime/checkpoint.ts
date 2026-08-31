import type { Execution, ExecutionPlugin } from '@owlmeans/llm'
import type { ExecutionState } from '@owlmeans/llm-common'
import type { AgentRunState } from '@owlmeans/agent-common'
import type { AgentRunStateStore } from '../stores/types.js'
import type { AgentTransport } from './transport.js'

export interface AgentCheckpointOptions {
  store: AgentRunStateStore
  /** Dispatched after a successful save, so a queue-backed runner can pick the run up. */
  transport?: AgentTransport
  /**
   * Refuse to persist a state larger than this, in serialized characters.
   *
   * A project-level execution carries the whole project specification in `state.project`, so an
   * unguarded checkpoint writes tens of kilobytes on every call. The guard drops the write and
   * says so, which is a recoverable gap; silently writing them is a storage problem that surfaces
   * much later and much worse.
   */
  maxStateChars?: number
  /** How a run id is recovered from the key a caller checkpoints under. Defaults to the key. */
  runId?: (key: string | undefined, exec: Execution) => string
  /** How a conversation id is recovered. Defaults to the execution's dedication. */
  conversationId?: (exec: Execution) => string
}

export const DEFAULT_MAX_STATE_CHARS = 64_000

/**
 * The first implementation of `@owlmeans/llm`'s `ExecutionPlugin`.
 *
 * That seam has shipped unimplemented since it was designed: `ExecutionService.checkpoint()` is a
 * no-op with no plugin registered, and applications call it at their lock boundaries in the
 * expectation that one day something will listen. This is that something — it turns a checkpoint
 * into an `AgentRunState` row, and a restore into a state a run can be rebuilt from.
 *
 * It persists the EXECUTION state only. The flow string belongs to a run and is written by the run
 * itself; a checkpoint taken from an execution has no run to ask, so `flow` is left empty and the
 * run's own save fills it in. Reading a state back with an empty `flow` means "a checkpoint exists
 * but no run had started" — resume from the beginning, not from a step.
 */
export const makeAgentExecutionPlugin = (options: AgentCheckpointOptions): ExecutionPlugin => {
  const {
    store, transport,
    maxStateChars = DEFAULT_MAX_STATE_CHARS,
    runId = key => key ?? '',
    conversationId = exec => exec.purpose?.dedication ?? '',
  } = options

  return {
    onCheckpoint: async (state: ExecutionState, exec: Execution, key?: string) => {
      const id = runId(key, exec)
      if (id === '') {
        console.warn('Agent checkpoint skipped: no run id could be resolved from the key')
        return
      }

      let serialized: string
      try {
        serialized = JSON.stringify(state)
      } catch (e) {
        // A state that will not serialize is a collaborator that leaked into it — report the fact
        // rather than the exception, because the caller cannot act on a cycle in someone's object.
        console.warn('Agent checkpoint skipped: execution state is not serializable:', e)
        return
      }

      if (serialized.length > maxStateChars) {
        console.warn(
          `Agent checkpoint skipped: state is ${serialized.length} chars, over the `
          + `${maxStateChars} limit — narrow what the execution carries before checkpointing it`,
        )
        return
      }

      const record: AgentRunState = {
        id,
        conversationId: conversationId(exec),
        flow: '',
        state,
        updatedAt: new Date().toISOString(),
      }

      await store.save(record)
      await transport?.dispatch({ id, conversationId: record.conversationId, flow: '', stateRef: id })
    },

    onRestore: async (key: string) => (await store.load(key))?.state ?? null,
  }
}
