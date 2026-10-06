import type { FlowProvider, FlowState, ShallowFlow } from '../../types.js'

/** The compact, URL-safe wire form of a flow state. */
export interface FlowUtils {
  /** The flow state as a base64url token: step indexes, service, ok flag, entity, message and mapped payload. */
  serializeState: (flow: ShallowFlow, state: FlowState) => string
  /**
   * The flow state a token carries, its flow looked up through `flowProvider`.
   *
   * @throws {UnknownFlowStep} when the token names a step index the flow does not have
   */
  unserializeState: (token: string, flowProvider: FlowProvider) => Promise<FlowState>
}
