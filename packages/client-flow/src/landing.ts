import type { ClientContext } from '@owlmeans/client'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientResource } from '@owlmeans/client-resource'
import { memoHelper } from '@owlmeans/context'
import type { FlowModel } from '@owlmeans/flow'
import { FLOW_STATE, RESUME_FLOW } from './consts.js'
import type { SuspendedLanding, SuspendedLandingRecord } from './types.js'
import type { FlowLandingHelper } from './landing/types.js'

export const makeFlowLandingHelper = <C extends ClientConfig, T extends ClientContext<C>>(
  context: T
): FlowLandingHelper => {
  const landingResource = (): ClientResource<SuspendedLandingRecord> | null =>
    context.hasResource(FLOW_STATE) ? context.resource<ClientResource<SuspendedLandingRecord>>(FLOW_STATE) : null

  const suspendFlow = async (model: FlowModel, opts: { expiresAt: number }): Promise<boolean> => {
    const resource = landingResource()
    if (resource == null) return false

    let destinationModule: string | undefined
    try {
      const transition = model.next()
      destinationModule = model.step(transition.step).module
    } catch {
      return false
    }
    if (destinationModule == null) return false

    return await suspendLanding({ entrypoint: destinationModule, query: model.payload() }, opts)
  }

  const suspendLanding = async (landing: SuspendedLanding, opts: { expiresAt: number }): Promise<boolean> => {
    const resource = landingResource()
    if (resource == null) return false

    await resource.save({
      id: RESUME_FLOW, entrypoint: landing.entrypoint, query: landing.query, expiresAt: opts.expiresAt,
    })

    return true
  }

  const discardSuspendedLanding = async (): Promise<void> => {
    const resource = landingResource()
    if (resource == null) return

    await resource.delete(RESUME_FLOW).catch(() => undefined)
  }

  const resumeSuspendedFlow = async (): Promise<SuspendedLanding | null> => {
    const resource = landingResource()
    if (resource == null) return null

    let record: SuspendedLandingRecord | null
    try {
      record = await resource.load(RESUME_FLOW)
    } catch {
      return null
    }
    if (record == null) return null

    await resource.delete(RESUME_FLOW).catch(() => undefined)
    if (record.expiresAt < Date.now()) return null

    return { entrypoint: record.entrypoint, query: record.query }
  }

  return { suspendFlow, suspendLanding, discardSuspendedLanding, resumeSuspendedFlow }
}

export const flowLandingOf = memoHelper.oncePer(makeFlowLandingHelper)

/** @deprecated compat:factory-refactor — use `flowLandingOf(context).suspendFlow(…)` */
export const suspendFlow = <C extends ClientConfig, T extends ClientContext<C>>(
  context: T, model: FlowModel, opts: { expiresAt: number }
): Promise<boolean> => flowLandingOf(context).suspendFlow(model, opts)

/** @deprecated compat:factory-refactor — use `flowLandingOf(context).resumeSuspendedFlow()` */
export const resumeSuspendedFlow = <C extends ClientConfig, T extends ClientContext<C>>(
  context: T
): Promise<SuspendedLanding | null> => flowLandingOf(context).resumeSuspendedFlow()
