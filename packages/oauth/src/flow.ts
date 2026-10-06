import { UnknownFlow, type Flow, type FlowProvider } from '@owlmeans/flow'
import { OAUTH_FLOW, oauthFlow } from './consts.js'

/**
 * A minimal `FlowProvider` for exactly one flow.
 *
 * `makeFlowModel(token, provider)` needs a provider to restore a serialized state, because the
 * token names its flow rather than carrying it — and a browser's own flow service resolves flows
 * from config records, which this side-band flow deliberately never becomes one of (see
 * `oauthFlow`'s comment in `consts.ts`). This is the same shape as `@owlmeans/agent`'s `makeStaticFlowProvider`,
 * copied rather than depended on: pulling in the whole LLM/agent stack for one map lookup would be
 * a strange price for a browser bundle to pay.
 */
export const oauthFlowProvider: FlowProvider = async name => {
  if (name !== OAUTH_FLOW) {
    // `makeFlowModel` treats a string argument as a flow name first and only re-reads it as a
    // token once the provider throws — the throw is part of the contract.
    throw new UnknownFlow(name)
  }

  return { ...oauthFlow, config: {}, prefabs: {} } as Flow
}
