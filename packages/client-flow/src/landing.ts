import type { ClientContext } from '@owlmeans/client'
import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientResource } from '@owlmeans/client-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import type { FlowModel, FlowPayload } from '@owlmeans/flow'
import { FLOW_STATE } from './consts.js'

/** The record id a suspended landing is stored under, in the SAME resource `EXTRA_FLOW` uses —
 * a side-band slot, never the live `FlowService.flow` and never the `?flow=` query parameter. */
export const RESUME_FLOW = 'resume-flow'

export interface SuspendedLandingRecord extends ResourceRecord {
  /** The entrypoint alias to navigate to once sign-in completes. */
  entrypoint: string
  /** The flow's payload at the moment it was suspended — carried along as the destination's query. */
  query: FlowPayload
  expiresAt: number
}

export interface SuspendedLanding {
  entrypoint: string
  query: FlowPayload
}

const landingResource = <C extends ClientConfig, T extends ClientContext<C>>(
  context: T
): ClientResource<SuspendedLandingRecord> | null =>
  context.hasResource(FLOW_STATE) ? context.resource<ClientResource<SuspendedLandingRecord>>(FLOW_STATE) : null

/**
 * Suspend a flow that is about to leave for the platform's own sign-in dispatcher, so whichever
 * sign-in method completes can send the person back to where they started instead of `HOME`.
 *
 * Driven by the flow model rather than a raw URL: `model.next()` is the flow's own answer to
 * "where does this step lead", so a caller never re-derives a destination the flow already knows,
 * and a flow whose current step offers no way forward (`next()` throws) suspends nothing rather
 * than persisting a landing that can never be reached. The persisted record is deliberately NOT a
 * serialized flow token — the destination step is always one this application can enter fresh (an
 * `initial`-marked screen reading its own `ref`/`kind` from the query), so nothing needs to
 * reconstruct the exact `FlowModel` instance on the other side of a sign-in redirect, and this
 * helper stays usable by any flow, not only one particular package's.
 *
 * Returns `false` when there is nowhere to persist this (no `FLOW_STATE` resource registered) or
 * nothing to suspend to (the current step has no forward transition, or its destination has no
 * `module`) — the caller falls back to its own default landing (ordinarily `HOME`).
 */
export const suspendFlow = async <C extends ClientConfig, T extends ClientContext<C>>(
  context: T, model: FlowModel, opts: { expiresAt: number }
): Promise<boolean> => {
  const resource = landingResource(context)
  if (resource == null) return false

  let destinationModule: string | undefined
  try {
    const transition = model.next()
    destinationModule = model.step(transition.step).module
  } catch {
    return false
  }
  if (destinationModule == null) return false

  await resource.save({
    id: RESUME_FLOW, entrypoint: destinationModule, query: model.payload(), expiresAt: opts.expiresAt,
  })

  return true
}

/**
 * Read back a suspended landing, once. Delete-on-read: the record answers exactly one sign-in,
 * because a landing a stale browser tab left behind must never resurrect on somebody else's
 * sign-in later in the same session.
 *
 * `null` covers every reason there is nothing to resume: no resource, no record, or a record
 * whose window has closed — the caller's own default landing is exactly as safe an answer.
 */
export const resumeSuspendedFlow = async <C extends ClientConfig, T extends ClientContext<C>>(
  context: T
): Promise<SuspendedLanding | null> => {
  const resource = landingResource(context)
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
