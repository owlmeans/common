import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { AIMessageChunk, BaseMessage, BaseMessageLike, MessageFieldWithRole, ToolCall } from '@langchain/core/messages'
import { addMessages, entrypoint, task } from '@langchain/langgraph'
import { createIdOfLength } from '@owlmeans/basic-ids'
import { makeFlowModel } from '@owlmeans/flow'
import type { FlowModel } from '@owlmeans/flow'
import { PromptRegion } from '@owlmeans/llm-common'
import { cacheHelper, llmPluginRegistry } from '@owlmeans/llm'
import type { HelperExecution, LlmLoopCacheHints, ModelInputItem } from '@owlmeans/llm'
import { logger } from '@owlmeans/log'
import {
  AgentRunStatus, AgentRunTransition, agentRunFlow, conversationFor,
} from '@owlmeans/agent-common'
import { DEFAULT_ACTION, DEFAULT_ENTRYPOINT, DEFAULT_MAX_TURNS, DEFAULT_PLUGIN_ORDER } from './consts.js'
import { AgentLoopExhaustedError, AgentMissconfiguredError } from './errors.js'
import type {
  AgentModel, AgentOptions, AgentPlugin, AgentResult, AgentRun, AgentRunOutcome, AgentToolSet,
} from './types.js'
import { toolHelper } from './helpers/tools.js'

const log = logger('agent')

/**
 * A copy of the opening with the per-call tail after its payload — a string stays a string. The
 * opening itself stays in the transcript untouched; only the wire carries the tail.
 */
const withTail = (opening: BaseMessage, tail: string): BaseMessage[] => {
  if (opening.getType() !== 'human') {
    return [opening, new HumanMessage({ content: tail })]
  }
  const content = typeof opening.content === 'string'
    ? `${opening.content}\n\n${tail}`
    : [...opening.content, { type: 'text', text: tail }]

  return [new HumanMessage({
    content, id: opening.id, name: opening.name, additional_kwargs: opening.additional_kwargs,
  } as ConstructorParameters<typeof HumanMessage>[0])]
}

/** The provider's id of the model a run talks to, for billing — the config's, else the client's own. */
const modelIdOf = (model: unknown): string | undefined => {
  const typed = model as { metadata?: { config?: { model?: string } }, model?: unknown, modelName?: unknown }
  const id = typed.metadata?.config?.model ?? typed.model ?? typed.modelName
  return typeof id === 'string' ? id : undefined
}

/**
 * An OwlMeans agent over the LangGraph functional API.
 *
 * The loop is deliberately the plain one: ask the model, run whatever tools it asked for, feed the
 * results back, repeat until it stops asking.
 *
 * The `entrypoint` is created INSIDE `invoke()` and takes no checkpointer, and that is not for want
 * of one — `makePipeline` in this same package is a checkpointed `StateGraph`. **A ReAct run is not
 * a resumable unit.** Its state is an unbounded message list whose tool results are side effects
 * already applied to the world: re-entering a turn re-applies them, and the identity a functional
 * replay would key on is the positional call ordinal, which renumbers on any edit to the loop. What
 * IS resumable is a pipeline, whose steps are named, whose state is scalars, and whose side effects
 * are guarded per step — and an agent run belongs INSIDE one of those steps.
 *
 * So nothing survives a call here. What continuity a conversation has comes from plugins putting it
 * back into the prompt, not from the graph.
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
  const provider = options.provider ?? llmPluginRegistry.resolveFor(agentModel)
  const modelId = modelIdOf(agentModel)
  const purpose = exec.purpose

  const registry: AgentPlugin[] = []
  const ordered = (): AgentPlugin[] => [...registry].sort((a, b) =>
    (a.order ?? DEFAULT_PLUGIN_ORDER) - (b.order ?? DEFAULT_PLUGIN_ORDER))

  /**
   * Seat by alias, keeping the original position.
   *
   * Registering the same plugin twice is a wiring accident, and the failure it causes — every
   * context block emitted twice — is silent and expensive rather than loud. The options list goes
   * through this same path, which is the whole point: a service composes its plugins ahead of an
   * agent's own precisely so the agent's can REPLACE one by alias, and a constructor that simply
   * spread the array made "replace" mean "run both".
   */
  const seat = (plugin: AgentPlugin): void => {
    const at = registry.findIndex(entry => entry.alias === plugin.alias)
    if (at < 0) {
      registry.push(plugin)
    } else {
      registry[at] = plugin
    }
  }

  for (const plugin of options.plugins ?? []) {
    seat(plugin)
  }

  const model: AgentModel = {
    conversation: () => conversation,

    use: seat,

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
          log.warn('Agent plugin failed to contribute', { plugin: plugin.alias, error: e })
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
          {
            model: agentModel, provider, purpose, files: exec.files, utility: options.utility, action,
            results: exec.results,
          },
        )
        : null
      // The opening of every round: the system (a persona, stable across runs), the project
      // message (this run's facts), and the caller's opening carrying the per-call tail. The system
      // goes out as real text — its cache blocks are the provider plugin's, never a stringified array.
      const system = composed != null ? composed.system ?? '' : context.join('\n\n')
      const head: BaseMessage[] = [
        ...(system !== '' ? [new SystemMessage(system)] : []),
        ...(composed?.project != null ? [new HumanMessage(composed.project)] : []),
      ]
      const hints: LlmLoopCacheHints = {
        system: composed?.blocks.filter(block => block.region === PromptRegion.System),
        ...(composed?.project != null ? { project: head.length - 1 } : {}),
        ...(composed != null ? { ttl: composed.cache.ttl } : {}),
      }
      const cached = composed?.cache.enabled !== false

      const tooled = agentModel.bindTools?.(Object.values(toolSet)) ?? agentModel

      const ask = task('call-llm', async ({ messages, turn }: { messages: BaseMessageLike[], turn: number }) => {
        const startedAt = Date.now()

        const [first, ...rest] = messages as BaseMessage[]
        const opening = composed?.tail != null && first != null ? withTail(first, composed.tail) : [first]
        const wire = [...head, ...opening, ...rest].filter(message => message != null)
        // Each round strips and re-marks copies: the system and project message once, and the
        // growing conversation read back from the round before.
        const patch = cached
          ? provider?.loopCache?.(wire as unknown as MessageFieldWithRole[], agentModel, hints)
          : undefined

        const stream = await tooled.stream(
          (patch?.messages ?? wire) as BaseMessageLike[],
          { ...patch?.options, runName: action, metadata: { purpose } } as Parameters<typeof tooled.stream>[1],
        )

        let final: AIMessageChunk | undefined
        for await (const chunk of stream) {
          final = final != null ? final.concat(chunk) : chunk
        }

        const result = new AIMessage(cacheHelper.withCacheTiers(final!))
        await spectate?.(messages as ModelInputItem[], result, action, turn, startedAt, modelId)

        return result
      })

      // A rejected task aborts the whole superstep, killing every sibling call in the same batch —
      // `safeInvokeTool` is what keeps a bad argument from costing the work the others finished.
      const call = task(
        'call-tool',
        async (toolCall: ToolCall) => toolHelper.safeInvokeTool(toolSet, toolCall, options.fatal),
      )

      const agent = entrypoint(entrypointName, async (messages: BaseMessageLike[]) => {
        let response = await ask({ messages, turn: 0 })
        let turn = 0

        while (true) {
          messages = addMessages(messages, [response])

          try {
            await Promise.all(chain.map(async plugin =>
              plugin.onTurn?.(run, messages as BaseMessage[])))
          } catch (e) {
            log.warn('Agent plugin failed on turn', e)
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
          response = await ask({ messages, turn })
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
            log.warn('Agent plugin failed on finish', { plugin: plugin.alias, error: e })
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
