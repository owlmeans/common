import type { FlowProvider, FlowState, SerializedFlow, ShallowFlow } from '../types.js'
import { FLOW_SEP, PAYLOAD_SEP } from '../consts.js'
import { utf8, base64urlnopad } from '@scure/base'
import { UnknownFlowStep } from '../errors.js'

export const serializeState = (flow: ShallowFlow, state: FlowState): string => {
  const flowBlock = [
    state.flow,
    flow.steps[state.step].index.toString()
  ]
  if (state.previous != null) {
    flowBlock.push(flow.steps[state.previous].index.toString())
  }
  const serialized: SerializedFlow = {
    f: flowBlock.join(FLOW_SEP),
    s: state.service,
    o: state.ok ? 1 : 0,
  }
  if (state.entityId != null) {
    serialized.e = state.entityId
  } else if (state.entityId === null) {
    serialized.e = ''
  }
  if (state.message != null) {
    serialized.m = state.message
  }
  if (state.payload != null) {
    const step = flow.steps[state.step]
    if (step.payloadMap != null) {
      serialized.p = Object.entries(step.payloadMap).reduce<string[]>((list, [key, index]) => {
        list[index] = state.payload![key] != null ? state.payload![key].toString() : ''
        return list
      }, Array<string>(Object.keys(step.payloadMap).length)).join(PAYLOAD_SEP)
    }
  }

  return base64urlnopad.encode(utf8.decode(JSON.stringify(serialized)))
}

export const unserializeState = async (token: string, flowProvider: FlowProvider): Promise<FlowState> => {
  const serialized: SerializedFlow = JSON.parse(utf8.encode(base64urlnopad.decode(token)))
  const [flowAlias, stepIndex, previousIdx] = serialized.f.split(FLOW_SEP, 3)
  const flow = await flowProvider(flowAlias)
  const step = Object.values(flow.steps).find(step => step.index === parseInt(stepIndex))
  if (step == null) {
    throw new UnknownFlowStep(stepIndex)
  }
  const previous = previousIdx != null ? Object.values(flow.steps).find(step => step.index === parseInt(previousIdx)) : undefined

  const state: FlowState = {
    flow: flow.flow,
    step: step.step,
    previous: previous?.step,
    service: serialized.s,
    ok: serialized.o === 1,
  }

  if (serialized.m != null) {
    state.message = serialized.m
  }

  if (serialized.e != null) {
    state.entityId = serialized.e !== '' ? serialized.e : null
  }

  if (serialized.p != null && step.payloadMap != null) {
    const list = serialized.p.split(PAYLOAD_SEP)
    state.payload = Object.fromEntries(Object.entries(step.payloadMap).map(
      ([key, index]) => [key, list[index] != null ? list[index] : null]
    ))
  }

  return state
}
