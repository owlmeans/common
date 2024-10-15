import type { ResourceRecord } from '@owlmeans/resource'
import type { FLOW_RECORD } from './consts.js'

export interface Flow extends ShallowFlow {
  config: FlowConfig
  prefabs: { [step: string]: string }
}

export interface ShallowFlow {
  flow: string
  initialStep: string
  steps: { [key: string]: FlowStep }
}

export interface FlowConfig {
  queryParam?: string
  services?: { [ref: string]: string }
  modules?: { [ref: string]: string }
  pathes?: { [ref: string]: string }
  defaultFlow?: string
}

export interface FlowStep {
  index: number
  step: string
  service: string
  path?: string
  module?: string
  initial?: boolean
  payloadMap?: { [key: string]: number }
  transitions: { [key: string]: FlowTransition }
}

export interface FlowTransition {
  transition: string
  step: string
  /**
   * Whether user can choose this transition as one of possibilities
   */
  explicit?: boolean
  /**
   * Whether user may get back
   */
  reversible?: boolean
}

export interface FlowState {
  flow: string
  step: string
  // Previous step if reversible
  previous?: string
  entityId?: string | null
  service: string
  payload?: FlowPayload
  message?: string
  ok: boolean
}

export interface FlowPayload extends Record<symbol | string, string | number | null> { }

export interface SerializedFlow {
  // {flow}:{step}:{prev setp}
  f: string
  // Entity
  e?: string
  // Target service
  s: string
  // Payload serialized according to transition palyoadMap
  p?: string
  // Message
  m?: string
  // Is everything ok (true) or error false
  o: number
}

export interface FlowModel {
  target: (service: string) => FlowModel
  entity: (entityId: string) => FlowModel
  enter: (step?: string) => FlowModel
  steps: (enter?: boolean) => FlowStep[]
  state: () => FlowState
  setState: (state: FlowState | null) => FlowModel
  payload: <T extends FlowPayload>() => T
  step: (step?: string) => FlowStep
  transitions: (explicit?: boolean) => FlowTransition[]
  transition: (transition: string) => FlowTransition
  next: () => FlowTransition
  transit: (transition: string, ok: boolean, message?: string | FlowPayload, payload?: FlowPayload) => string
  serialize: () => string
}

export interface FlowProvider {
  (flow: string): Promise<Flow>
}

export interface WithFlowConfig {
  flowConfig?: FlowConfig
}

export interface FlowConfigRecord extends ResourceRecord, ShallowFlow {
  id: string
  recordType: typeof FLOW_RECORD
}
