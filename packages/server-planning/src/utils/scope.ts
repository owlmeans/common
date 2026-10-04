import { requireEntityKey } from '@owlmeans/auth-common'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { PLANNING_SERVICE, PlanningForbidden } from '@owlmeans/planning'
import type { PlanningFacade, PlanningScope, PlanningService, TransitionActor, Workcard } from '@owlmeans/planning'
import type {
  PlanningAccess, PlanningAccessGrants, PlanningHandlerOptions, PlanningHostService,
} from '../types.js'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value != null && value !== '')) as T

/** The authenticated subject of a request, as a transition names it. */
export const actorOf = (req: AbstractRequest): TransitionActor => clean({
  profileId: req.auth?.profileId,
  userId: req.auth?.userId,
})

const scopeWith = (req: AbstractRequest, entityId: string, extra?: Partial<PlanningScope>): PlanningScope => {
  const subject = actorOf(req)
  const channel = extra?.channel ?? extra?.actor?.channel

  return clean({
    ...extra,
    ...subject,
    entityId,
    channel,
    actor: clean({ ...extra?.actor, ...subject, channel }),
  }) as PlanningScope
}

/**
 * The scope a request reads and writes as.
 *
 * `entityId` is `requireEntityKey(req)` — the resolved organization id, never a value from the
 * body or the query — and `extra` cannot replace it; `extra` adds what the deployment derives
 * (a `channel`, a `service`). The actor is the authenticated subject plus that channel.
 *
 * @throws {AuthorizationError} when the request carries no organization
 */
export const scopeOf = (req: AbstractRequest, extra?: Partial<PlanningScope>): PlanningScope =>
  scopeWith(req, requireEntityKey(req), extra)

/**
 * The scope of a request under a resolved {@link PlanningAccess}: the organization is the
 * resolver's — never the token's, never `extra`'s — and `projects` narrows it.
 */
export const accessScopeOf = (
  req: AbstractRequest, access: PlanningAccess, extra?: Partial<PlanningScope>
): PlanningScope => {
  const { projects: _projects, entityId: _entityId, ...rest } = extra ?? {}
  const scope = scopeWith(req, access.entityId, rest)

  return access.projects != null ? { ...scope, projects: [...access.projects] } : scope
}

export const planningServiceOf = (
  ctx: BasicContext<BasicConfig>, opts?: Pick<PlanningHandlerOptions, 'service'>
): PlanningService => ctx.service<PlanningHostService>(opts?.service ?? PLANNING_SERVICE)

export interface HandlerScope {
  facade: PlanningFacade
  /** The resolver's answer, when the handler options carry one. */
  access?: PlanningAccess
}

/**
 * The facade a handler works through, and the access it was resolved under.
 *
 * Without `opts.access` it is exactly the request's scope plus what `opts.scope` derives. With it,
 * the resolver names the organization and the visible projects; a throw from the resolver is the
 * request's error.
 */
export const handlerScopeOf = async (
  ctx: BasicContext<BasicConfig>, req: AbstractRequest, opts?: PlanningHandlerOptions
): Promise<HandlerScope> => {
  const extra = await opts?.scope?.(req, ctx)
  if (opts?.access == null) {
    return { facade: planningServiceOf(ctx, opts).for(scopeOf(req, extra ?? undefined)) }
  }
  const access = await opts.access(req, ctx)

  return { facade: planningServiceOf(ctx, opts).for(accessScopeOf(req, access, extra ?? undefined)), access }
}

/** The facade a handler works through: the request's scope plus what `opts.scope` derives. */
export const handlerFacade = async (
  ctx: BasicContext<BasicConfig>, req: AbstractRequest, opts?: PlanningHandlerOptions
): Promise<PlanningFacade> => (await handlerScopeOf(ctx, req, opts)).facade

/**
 * Refuse a write the access does not grant. No access, or access without `grants`, gates nothing;
 * a `grants` object refuses every flag it leaves out. `true` grants everything; a list grants the
 * project ids it names — `target` is the project the write is about (`undefined` for the
 * organization's root, which only `true` reaches).
 *
 * @throws {PlanningForbidden}
 */
export const assertGranted = (
  access: PlanningAccess | undefined, grant: keyof PlanningAccessGrants, target?: string
): void => {
  if (access?.grants == null) {
    return
  }
  const granted = access.grants[grant]
  if (granted === true || (Array.isArray(granted) && target != null && granted.includes(target))) {
    return
  }
  throw new PlanningForbidden(`${grant}:${target ?? 'root'}`)
}

/**
 * A card the access's `writes` admits — the rule a narrowed read admits, over `writes`: a project
 * it names, or a card whose `parents` name one. A specification is admitted through its parent card
 * by the caller. No `writes` admits everything.
 */
export const writableIn = (access: PlanningAccess | undefined, card: Pick<Workcard, 'id' | 'parents'>): boolean => {
  const writes = access?.writes
  if (writes == null) {
    return true
  }
  return (card.id != null && writes.includes(card.id)) || card.parents.some(parent => writes.includes(parent))
}

/**
 * Refuse a write into a project the access's `writes` leaves out. No `writes` refuses nothing;
 * `target` is the project the write is in (`undefined` for the organization's root, which a set
 * `writes` never admits).
 *
 * @throws {PlanningForbidden}
 */
export const assertWrites = (access: PlanningAccess | undefined, target?: string): void => {
  if (access?.writes == null || (target != null && access.writes.includes(target))) {
    return
  }
  throw new PlanningForbidden(`writes:${target ?? 'root'}`)
}
