import { UnknownFlow } from '@owlmeans/flow'
import type { Flow, FlowProvider, ShallowFlow } from '@owlmeans/flow'

/**
 * The server-side flow provider `@owlmeans/flow` never shipped.
 *
 * Every driver in the monorepo is client-side and loads its flows from config records through a
 * context resource. An agent runtime has neither: its flows are code it declares itself, and they
 * must resolve in a worker with no context at all. So the provider is a plain map.
 *
 * It is needed for exactly one thing — restoring a run from its serialized state. Building a fresh
 * model from a `ShallowFlow` object needs no provider; `makeFlowModel(token, provider)` does,
 * because the token names its flow rather than carrying it.
 *
 * `Flow` adds `config` and `prefabs` to `ShallowFlow` for the benefit of UI drivers that map steps
 * onto routes. An agent run has no routes, so both are empty — supplied rather than omitted because
 * the type requires them.
 */
export const makeStaticFlowProvider = (flows: ShallowFlow[]): FlowProvider => {
  const registry = new Map<string, Flow>(
    flows.map(flow => [flow.flow, { ...flow, config: {}, prefabs: {} } as Flow]),
  )

  return async name => {
    const flow = registry.get(name)
    if (flow == null) {
      // `makeFlowModel` treats a string argument as a flow name FIRST and only re-reads it as a
      // serialized token once the provider throws — so throwing here is part of the contract, not
      // an error path. It must stay a throw.
      throw new UnknownFlow(name)
    }

    return flow
  }
}
