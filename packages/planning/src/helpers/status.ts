import { ANY_STATUS, INTRINSIC_ORDER, IntrinsicPolicy, IntrinsicStatus } from '../consts.js'
import { PlanningError, UnknownStatusFlow } from '../errors.js'
import type { AnyTypeSchema, StatusDefinition, StatusFlowSchema, StatusTransitionRule } from '../types.js'
import type { StatusHelper } from './status/types.js'
import type { FlowLookup } from './types.local.js'

export const createStatusHelper = (): StatusHelper => {
  const primaryFlowOf = (type: AnyTypeSchema): string => {
    const primary = type.flows[0]
    if (primary == null) {
      throw new UnknownStatusFlow(`${type.type}:primary`)
    }

    return primary
  }

  const flowIdsOf = (type: AnyTypeSchema): string[] => [...type.flows]

  const statusDefinitionOf = (flow: StatusFlowSchema, status: string): StatusDefinition | undefined =>
    flow.statuses.find(definition => definition.key === status)

  const intrinsicOf = (flow: StatusFlowSchema, status: string): IntrinsicStatus | undefined =>
    statusDefinitionOf(flow, status)?.intrinsic

  const initialStatusOf = (flow: StatusFlowSchema): string => {
    const status = flow.statuses.find(definition => definition.initial === true) ?? flow.statuses[0]
    if (status == null) {
      throw new PlanningError(`flow-empty:${flow.id}`)
    }

    return status.key
  }

  const isTerminal = (flow: StatusFlowSchema, status: string): boolean =>
    statusDefinitionOf(flow, status)?.terminal === true

  const fromMatches = (rule: StatusTransitionRule, status: string): boolean =>
    rule.from === ANY_STATUS || (Array.isArray(rule.from) && rule.from.includes(status))

  const ruleOf = (
    flow: StatusFlowSchema, transition: string, from: string
  ): StatusTransitionRule | undefined => {
    const named = flow.transitions.filter(rule => rule.name === transition)

    return named.find(rule => rule.from !== ANY_STATUS && fromMatches(rule, from))
      ?? named.find(rule => rule.from === ANY_STATUS)
      ?? (statusDefinitionOf(flow, from) == null ? named[0] : undefined)
  }

  const canTransit = (flow: StatusFlowSchema, transition: string, from: string): boolean =>
    ruleOf(flow, transition, from) != null

  const transitionsFrom = (
    flow: StatusFlowSchema, status: string, opts?: { explicit?: boolean }
  ): StatusTransitionRule[] => {
    const names = [...new Set(flow.transitions.map(rule => rule.name))]

    return names.map(name => ruleOf(flow, name, status))
      .filter((rule): rule is StatusTransitionRule => rule != null)
      .filter(rule => opts?.explicit !== true || rule.explicit === true)
  }

  const initialFlowsOf = (
    type: AnyTypeSchema, registry: FlowLookup, status?: string
  ): Record<string, string> => {
    const primary = primaryFlowOf(type)

    return Object.fromEntries(type.flows.map(id => [
      id, id === primary && status != null ? status : initialStatusOf(registry.flow(id)),
    ]))
  }

  const resolveIntrinsic = (
    type: AnyTypeSchema, flows: Record<string, string>, registry: FlowLookup
  ): IntrinsicStatus => {
    const read = (id: string): IntrinsicStatus => {
      const status = flows[id]
      return status == null
        ? IntrinsicStatus.Planned
        : intrinsicOf(registry.flow(id), status) ?? IntrinsicStatus.Planned
    }

    if (type.intrinsic !== IntrinsicPolicy.All) {
      return read(primaryFlowOf(type))
    }

    return type.flows.map(read).reduce<IntrinsicStatus>(
      (least, intrinsic) => INTRINSIC_ORDER[intrinsic] < INTRINSIC_ORDER[least] ? intrinsic : least,
      IntrinsicStatus.Closed
    )
  }

  return {
    primaryFlowOf, flowIdsOf, statusDefinitionOf, intrinsicOf, initialStatusOf, isTerminal, ruleOf, canTransit,
    transitionsFrom, initialFlowsOf, resolveIntrinsic,
  }
}

export const statusHelper = createStatusHelper()

/** @deprecated compat:factory-refactor — use `statusHelper.primaryFlowOf(…)` */
export const primaryFlowOf = (type: AnyTypeSchema): string => statusHelper.primaryFlowOf(type)

/** @deprecated compat:factory-refactor — use `statusHelper.flowIdsOf(…)` */
export const flowIdsOf = (type: AnyTypeSchema): string[] => statusHelper.flowIdsOf(type)

/** @deprecated compat:factory-refactor — use `statusHelper.statusDefinitionOf(…)` */
export const statusDefinitionOf = (flow: StatusFlowSchema, status: string): StatusDefinition | undefined =>
  statusHelper.statusDefinitionOf(flow, status)

/** @deprecated compat:factory-refactor — use `statusHelper.intrinsicOf(…)` */
export const intrinsicOf = (flow: StatusFlowSchema, status: string): IntrinsicStatus | undefined =>
  statusHelper.intrinsicOf(flow, status)

/** @deprecated compat:factory-refactor — use `statusHelper.initialStatusOf(…)` */
export const initialStatusOf = (flow: StatusFlowSchema): string => statusHelper.initialStatusOf(flow)

/** @deprecated compat:factory-refactor — use `statusHelper.isTerminal(…)` */
export const isTerminal = (flow: StatusFlowSchema, status: string): boolean => statusHelper.isTerminal(flow, status)

/** @deprecated compat:factory-refactor — use `statusHelper.ruleOf(…)` */
export const ruleOf = (flow: StatusFlowSchema, transition: string, from: string): StatusTransitionRule | undefined =>
  statusHelper.ruleOf(flow, transition, from)

/** @deprecated compat:factory-refactor — use `statusHelper.canTransit(…)` */
export const canTransit = (flow: StatusFlowSchema, transition: string, from: string): boolean =>
  statusHelper.canTransit(flow, transition, from)

/** @deprecated compat:factory-refactor — use `statusHelper.transitionsFrom(…)` */
export const transitionsFrom = (
  flow: StatusFlowSchema, status: string, opts?: { explicit?: boolean }
): StatusTransitionRule[] => statusHelper.transitionsFrom(flow, status, opts)

/** @deprecated compat:factory-refactor — use `statusHelper.initialFlowsOf(…)` */
export const initialFlowsOf = (type: AnyTypeSchema, registry: FlowLookup, status?: string): Record<string, string> =>
  statusHelper.initialFlowsOf(type, registry, status)

/** @deprecated compat:factory-refactor — use `statusHelper.resolveIntrinsic(…)` */
export const resolveIntrinsic = (
  type: AnyTypeSchema, flows: Record<string, string>, registry: FlowLookup
): IntrinsicStatus => statusHelper.resolveIntrinsic(type, flows, registry)
