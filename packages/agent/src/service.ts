import { createService } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { AGENTS_SERVICE, agentFlows } from '@owlmeans/agent-common'
import type { ConversationRef } from '@owlmeans/agent-common'
import { DEFAULT_EVENT_WINDOW } from '@owlmeans/agent-common'
import { DEFAULT_PLUGIN_ORDER } from './consts.js'
import { makeAgentModel } from './model.js'
import { makePipeline } from './pipeline/runner.js'
import { makeStaticFlowProvider } from './runtime/provider.js'
import { inProcessTransport } from './runtime/transport.js'
import type {
  AgentModel, AgentPlugin, AgentService, AgentServiceOptions, ConversationApi, WithAgentsService,
} from './types.js'

export type AgentServiceApi = Pick<
  AgentService, 'agent' | 'use' | 'plugins' | 'flow' | 'transport' | 'conversation' | 'pipeline'
>

/**
 * The service body, without context registration.
 *
 * Split out the way `@owlmeans/llm` splits its own so that an application which specialises the
 * agent service can spread this into its own object rather than wrapping it — `self` is late-bound
 * for exactly that case.
 */
export const agentServiceApi = (
  options: AgentServiceOptions,
  self: () => AgentService,
): AgentServiceApi => {
  const registry: AgentPlugin[] = [...(options.plugins ?? [])]
  const transport = options.transport ?? inProcessTransport()
  const provider = makeStaticFlowProvider([...agentFlows, ...(options.flows ?? [])])

  const api: AgentServiceApi = {
    flow: provider,

    transport: () => transport,

    plugins: () => [...registry].sort((a, b) =>
      (a.order ?? DEFAULT_PLUGIN_ORDER) - (b.order ?? DEFAULT_PLUGIN_ORDER)),

    use: plugin => {
      const at = registry.findIndex(entry => entry.alias === plugin.alias)
      if (at < 0) {
        registry.push(plugin)
      } else {
        registry[at] = plugin
      }
    },

    agent: agentOptions => makeAgentModel({
      ...agentOptions,
      // The service's plugins come first so that an agent's own can override one by alias.
      plugins: [...self().plugins(), ...(agentOptions.plugins ?? [])],
    }) as AgentModel,

    pipeline: async (spec, pipelineOptions) => {
      const chain = self().plugins()
      // The FIRST plugin that answers owns durability for this scope. Several answering is a
      // wiring accident, and picking the last would make which one wins depend on registration
      // order — silently, and differently per process.
      let runs = pipelineOptions.runs
      for (const plugin of chain) {
        if (runs != null) break
        runs = plugin.runs?.(pipelineOptions.scope)
      }

      let checkpointer = pipelineOptions.checkpointer
      for (const plugin of chain) {
        if (checkpointer != null) break
        try {
          checkpointer = await plugin.checkpointer?.(pipelineOptions.scope)
        } catch (e) {
          // A checkpointer that cannot be built costs replay, never the work.
          console.warn(`Agent plugin ${plugin.alias} could not supply a checkpointer:`, e)
        }
      }

      return makePipeline(spec, {
        ...pipelineOptions,
        ...(runs != null ? { runs } : {}),
        ...(checkpointer != null ? { checkpointer } : {}),
      })
    },

    conversation: (ref: ConversationRef): ConversationApi => ({
      // No store bound is not an error: an application that has not wired persistence still runs
      // agents, it just has no memory. The empty answer is what every reader already handles.
      last: async (limit = DEFAULT_EVENT_WINDOW) =>
        await options.conversations?.last(ref, limit) ?? [],

      append: async event => {
        if (options.conversations == null) {
          throw new Error('agents: no conversation store is bound')
        }

        return await options.conversations.append(event)
      },
    }),
  }

  return api
}

export const makeAgentsService = (
  options: AgentServiceOptions = {},
  alias: string = AGENTS_SERVICE,
): AgentService => {
  const service: AgentService = createService<AgentService>(
    alias, agentServiceApi(options, () => service) as AgentService,
  )

  return service
}

export const appendAgentsService = <C extends BasicConfig, T extends BasicContext<C>>(
  ctx: T,
  options: AgentServiceOptions = {},
  alias: string = AGENTS_SERVICE,
): T & WithAgentsService => {
  const context = ctx as T & WithAgentsService

  context.registerService(makeAgentsService(options, alias))
  context.agents = () => context.service<AgentService>(alias)

  return context
}
