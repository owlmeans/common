import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { AIMessageChunk, BaseMessage, BaseMessageLike, ToolCall } from '@langchain/core/messages'
import { addMessages, entrypoint, task } from '@langchain/langgraph'
import { createIdOfLength } from '@owlmeans/basic-ids'
import { makeFlowModel } from '@owlmeans/flow'
import type { FlowModel } from '@owlmeans/flow'
import { pluginFor } from '@owlmeans/llm'
import type { HelperExecution, ModelInputItem } from '@owlmeans/llm'
import {
  AgentRunStatus, AgentRunTransition, agentRunFlow, conversationFor,
} from '@owlmeans/agent-common'
import { DEFAULT_ACTION, DEFAULT_ENTRYPOINT, DEFAULT_MAX_TURNS, DEFAULT_PLUGIN_ORDER } from './consts.js'
import { AgentLoopExhaustedError, AgentMissconfiguredError } from './errors.js'
import { safeInvokeTool } from './helpers/tools.js'
import type {
  AgentModel, AgentOptions, AgentPlugin, AgentResult, AgentRun, AgentRunOutcome, AgentToolSet,
} from './types.js'

/**
 * An OwlMeans agent over the LangGraph functional API.
 *
 * The loop is deliberately the plain one: ask the model, run whatever tools it asked for, feed the
 * results back, repeat until it stops asking. No `StateGraph`, and no LangGraph checkpointer — this
 * family's recoverability lives in the OwlMeans execution and flow layers, which already own a
 * serializable state model, and adopting a second one would leave two half-truths about where a
 * crashed run stands.
 *
 * The `entrypoint` is created INSIDE `invoke()`, so nothing survives a call. What continuity a
 * conversation has comes from plugins putting it back into the prompt, not from the graph.
 */
export const makeAgentModel = (options: AgentOptions): AgentModel => {
  const {
    exec, tools, entrypoint: entrypointName = DEFAULT_ENTRYPOINT,
    maxTurns = DEFAULT_MAX_TURNS, autoFinish = true, spectate,
  } = options

  const agentModel = options.agentModel ?? (exec as HelperExecution).model
  if (agentModel == null) {
    throw new AgentMissconfiguredError('model')
  }

  const conversation = options.conversation ?? conversationFor(exec.purpose)
  const prompts = options.prompts ?? exec.prompts
  const provider = options.provider ?? pluginFor(agentModel)
  const purpose = exec.purpose

  const registry: AgentPlugin[] = [...(options.plugins ?? [])]
  const ordered = (): AgentPlugin[] => [...registry].sort((a, b) =>
    (a.order ?? DEFAULT_PLUGIN_ORDER) - (b.order ?? DEFAULT_PLUGIN_ORDER))

  const model: AgentModel = {
    conversation: () => conversation,

    use: plugin => {
      // Seat by alias, keeping the original position: registering the same plugin twice is a wiring
      // accident, and the failure it would otherwise cause — every context block emitted twice — is
      // silent and expensive rather than loud.
      const at = registry.findIndex(entry => entry.alias === plugin.alias)
      if (at < 0) {
        registry.push(plugin)
      } else {
        registry[at] = plugin
      }
    },

    invoke: async (input, args = {}) => {
      const action = args.action ?? DEFAULT_ACTION
      const opening = typeof input === 'string' ? new HumanMessage({ content: input }) : input
      const promptText = typeof input === 'string'
        ? input
        : typeof opening.content === 'string' ? opening.content : ''

      const chain = ordered()
      const flow: FlowModel = await makeFlowModel(agentRunFlow)
      const run: AgentRun = {
        id: createIdOfLength(16), conversation, exec, flow, prompt: promptText, action,
      }
      flow.updatePayload({ runId: run.id, turn: 0 })

      // --- Prepared: everything the run needs to know and to do is collected here, once. -------
      flow.transit(AgentRunTransition.Prepare, true)

      const contributed: string[] = []
      let toolSet: AgentToolSet = { ...tools }
      for (const plugin of chain) {
        try {
          const chunks = await plugin.context?.(run)
          for (const chunk of chunks ?? []) {
            if (chunk.trim() !== '') {
              contributed.push(chunk.trim())
            }
          }
          const extra = plugin.tools?.(run)
          if (extra != null) {
            toolSet = { ...toolSet, ...extra }
          }
        } catch (e) {
          // A plugin that cannot contribute must not decide the run does not happen. Memory is an
          // enhancement; losing it costs context, and throwing here would cost the work.
          console.warn(`Agent plugin ${plugin.alias} failed to contribute:`, e)
        }
      }

      const context = [...(options.context ?? []), ...(args.context ?? []), ...contributed]

      // Composed ONCE, before the loop. `files` is passed so a prompt plugin that resolves
      // knowledge from disk works on an agent run and not only on a plain model call — the
      // omission of exactly this argument is what makes such plugins silently inert.
      const composed = prompts != null
        ? await prompts().compose(
          { ...exec.prompt, context },
          [],
          { model: agentModel, provider, purpose, files: exec.files, action },
        )
        : null
      const system = composed?.system?.content
        ?? (context.length > 0 ? context.join('\n\n') : '')
      const systemMessage = new SystemMessage(
        typeof system === 'string' ? system : JSON.stringify(system),
      )

      const tooled = agentModel.bindTools?.(Object.values(toolSet)) ?? agentModel

      const ask = task('call-llm', async (messages: BaseMessageLike[]) => {
        const startedAt = Date.now()

        const stream = await tooled.stream(
          [systemMessage, ...messages],
          { runName: action, metadata: { purpose } },
        )

        let final: AIMessageChunk | undefined
        for await (const chunk of stream) {
          final = final != null ? final.concat(chunk) : chunk
        }

        const result = new AIMessage(final!)
        await spectate?.(messages as ModelInputItem[], result, action, 0, startedAt)

        return result
      })

      // A rejected task aborts the whole superstep, killing every sibling call in the same batch —
      // `safeInvokeTool` is what keeps a bad argument from costing the work the others finished.
      const call = task('call-tool', async (toolCall: ToolCall) => safeInvokeTool(toolSet, toolCall))

      const agent = entrypoint(entrypointName, async (messages: BaseMessageLike[]) => {
        let response = await ask(messages)
        let turn = 0

        while (true) {
          messages = addMessages(messages, [response])

          try {
            await Promise.all(chain.map(async plugin =>
              plugin.onTurn?.(run, messages as BaseMessage[])))
          } catch (e) {
            console.warn('Agent plugin failed on turn:', e)
          }

          if (response.tool_calls == null || response.tool_calls.length === 0) {
            break
          }

          if (++turn > maxTurns) {
            throw new AgentLoopExhaustedError(`${maxTurns}`)
          }
          flow.updatePayload({ runId: run.id, turn })

          const results = await Promise.all(response.tool_calls.map(async toolCall => {
            let output: unknown = null
            let error: string | null = null
            try {
              output = await call(toolCall)
              if (typeof output === 'object' && output != null && 'error' in output) {
                error = String((output as { error: unknown }).error)
              }
            } catch (e) {
              error = `Error during tool call: ${(e as Error).message}`
            }

            return new ToolMessage({
              tool_call_id: toolCall.id!,
              name: toolCall.name,
              content: error ?? (typeof output === 'string' ? output : JSON.stringify(output)),
              status: error != null ? 'error' : 'success',
            })
          }))

          messages = addMessages(messages, results)
          response = await ask(messages)
        }

        return messages
      })

      // --- Working -----------------------------------------------------------------------------
      flow.transit(AgentRunTransition.Work, true)

      let transcript: BaseMessage[] = [opening]
      let result: AgentResult
      let finished = false

      const finish = async (outcome: AgentRunOutcome): Promise<void> => {
        if (finished) {
          return
        }
        finished = true

        for (const plugin of chain) {
          try {
            await plugin.onFinish?.(run, result, outcome)
          } catch (e) {
            // Finalization is bookkeeping about work that is already done. A compaction that fails
            // must not turn a finished run into a failed one, nor block whatever the caller does
            // after this — unlocking, committing, reporting.
            console.warn(`Agent plugin ${plugin.alias} failed on finish:`, e)
          }
        }

        flow.transit(
          outcome.status === AgentRunStatus.Ok ? AgentRunTransition.Finish : AgentRunTransition.Fail,
          outcome.status === AgentRunStatus.Ok,
          outcome.error?.message ?? outcome.note,
        )
      }

      try {
        let last: Record<string, unknown> = {}
        for await (const step of await agent.stream([opening])) {
          last = step as Record<string, unknown>
        }

        const produced = last[entrypointName] as BaseMessage[] | undefined
        transcript = produced ?? [opening]
        const message = [...transcript].reverse().find(item => item instanceof AIMessage) as AIMessage
          ?? new AIMessage({ content: '' })

        flow.transit(AgentRunTransition.Finalize, true)

        result = { message, messages: transcript, run: { id: run.id, conversation, finish } }

        if (autoFinish) {
          await finish({ status: AgentRunStatus.Ok })
        }

        return result
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        result = {
          message: new AIMessage({ content: '' }),
          messages: transcript,
          run: { id: run.id, conversation, finish },
        }

        // A failed run is ALWAYS finalized here, `autoFinish` or not. Deferring finalization means
        // "the caller will decide the outcome once it knows it" — but a caller that never received
        // a handle, because `invoke` threw instead of returning one, has no way to. Leaving it
        // unfinished would drop the run out of the conversation entirely, and a run that vanishes
        // from the history is one the next session repeats verbatim.
        await finish({ status: AgentRunStatus.Failed, error })

        throw error
      }
    },
  }

  return model
}
