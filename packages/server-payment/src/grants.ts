import { CAPABILITY_LIMIT_SCOPE, LimitUnknown, entitlementParamHelper } from '@owlmeans/payment'
import { UnsupportedArgumentError, type Criteria } from '@owlmeans/resource'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import { EntitlementGrantKind, EntitlementGrantStatus } from './consts.js'
import type {
  EntitlementGrantChange, EntitlementGrantListOptions, EntitlementGrantRevocation, EntitlementGrantRevokeOptions,
  EntitlementGrantSpec, PaymentGrantRecord,
} from './types.js'
import { log } from './log.js'
import { paymentAccessOf } from './access.js'
import { paymentUtils } from './utils.js'
import { catalogueOf } from './catalogue.js'
import { grantFoldHelper } from './grant-fold.js'
import type { EntitlementGrantHelper } from './grants/types.js'

const isDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime())

export const makeEntitlementGrantHelper = (ctx: ApiContext): EntitlementGrantHelper => {
  const access = paymentAccessOf(ctx)

  const newestFirst = (a: PaymentGrantRecord, b: PaymentGrantRecord): number =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

  /** Observers hear a grant after it is stored; their throw is logged, the grant stands. */
  const tell = async (grant: PaymentGrantRecord, change: EntitlementGrantChange): Promise<void> => {
    try {
      await access.observer().propagateEntitlementGrant({
        entityId: grant.entityId, grant, change, eventKey: `grant:${grant.id}:${change}`,
      }, ctx)
    } catch (error) {
      log.error('Entitlement grant observer failed', { entityId: grant.entityId, grantId: grant.id, change, error })
    }
  }

  const assertUnits = async (spec: EntitlementGrantSpec): Promise<void> => {
    if (typeof spec.limitKey !== 'string' || spec.limitKey === '') {
      throw new UnsupportedArgumentError('limitKey')
    }
    if (typeof spec.amount !== 'number' || !Number.isSafeInteger(spec.amount) || spec.amount < 1) {
      throw new UnsupportedArgumentError('amount')
    }
    const limitKey = spec.limitKey
    if (!(await catalogueOf(ctx).catalogPlans()).some(plan => plan.limits?.[limitKey] != null)) {
      throw new LimitUnknown(limitKey)
    }
  }

  const assertCapability = (spec: Pick<EntitlementGrantSpec, 'capability'>): void => {
    if (typeof spec.capability !== 'string' || spec.capability === '') {
      throw new UnsupportedArgumentError('capability')
    }
    const { scope, permission } = entitlementParamHelper.parseEntitlementParam(spec.capability)
    if (scope == null || scope === '' || permission === '' || scope === CAPABILITY_LIMIT_SCOPE) {
      throw new UnsupportedArgumentError('capability')
    }
  }

  const grant = async (entityId: string, spec: EntitlementGrantSpec): Promise<PaymentGrantRecord> => {
    if (typeof entityId !== 'string' || entityId === '') {
      throw new UnsupportedArgumentError('entityId')
    }
    const now = new Date()
    const startsAt = spec.startsAt ?? now
    if (!isDate(startsAt)) {
      throw new UnsupportedArgumentError('startsAt')
    }
    if (spec.endsAt != null && (!isDate(spec.endsAt) || spec.endsAt.getTime() <= startsAt.getTime())) {
      throw new UnsupportedArgumentError('endsAt')
    }
    switch (spec.kind) {
      case EntitlementGrantKind.Units:
        await assertUnits(spec)
        if (spec.capability != null) {
          assertCapability(spec)
        }
        break
      case EntitlementGrantKind.Capability:
        assertCapability(spec)
        break
      default:
        throw new UnsupportedArgumentError('kind')
    }

    const units = spec.kind === EntitlementGrantKind.Units
    const stored = await access.grantRecords().create(paymentUtils.compact<PaymentGrantRecord>({
      entityId,
      kind: spec.kind,
      ...(units ? { limitKey: spec.limitKey, amount: spec.amount, used: 0 } : {}),
      capability: spec.capability,
      startsAt,
      endsAt: spec.endsAt ?? undefined,
      status: EntitlementGrantStatus.Active,
      ref: spec.ref,
      note: spec.note,
      createdAt: now,
    }))
    log.info('Entitlement granted', paymentUtils.compact({
      entityId, grantId: stored.id, kind: stored.kind, limitKey: stored.limitKey, amount: stored.amount,
      capability: stored.capability, endsAt: stored.endsAt ?? undefined, ref: stored.ref,
    }), { event: 'entitlement.granted' })
    await tell(stored, 'granted')

    return stored
  }

  const revoke = async (
    grantId: string, opts: EntitlementGrantRevokeOptions = {},
  ): Promise<EntitlementGrantRevocation> => {
    const records = access.grantRecordsOf()
    const found = records != null && typeof grantId === 'string' && grantId !== '' ? await records.load(grantId) : null
    if (records == null || found == null || (opts.entityId != null && found.entityId !== opts.entityId)) {
      return { grant: null, changed: false }
    }
    if (found.status === EntitlementGrantStatus.Revoked) {
      return { grant: found, changed: false }
    }

    const at = new Date()
    // A raw `$set` guarded by the status: a replace would clobber a unit held concurrently.
    const won = await paymentUtils.conditionalSet(
      records, paymentUtils.idCriteria(grantId, { status: EntitlementGrantStatus.Active }),
      { status: EntitlementGrantStatus.Revoked, revokedAt: at },
    )
    const stored = await records.load(grantId) ?? { ...found, status: EntitlementGrantStatus.Revoked, revokedAt: at }
    if (!won) {
      return { grant: stored, changed: false }
    }
    log.info('Entitlement revoked', paymentUtils.compact({
      entityId: stored.entityId, grantId, kind: stored.kind, limitKey: stored.limitKey, used: stored.used,
      capability: stored.capability,
    }), { event: 'entitlement.revoked' })
    await tell(stored, 'revoked')

    return { grant: stored, changed: true }
  }

  const get = async (grantId: string): Promise<PaymentGrantRecord | null> => {
    const records = access.grantRecordsOf()

    return records != null && typeof grantId === 'string' && grantId !== '' ? await records.load(grantId) : null
  }

  const list = async (entityId: string, opts: EntitlementGrantListOptions = {}): Promise<PaymentGrantRecord[]> => {
    const records = access.grantRecordsOf()
    if (records == null) {
      return []
    }
    const at = opts.at ?? new Date()
    const where = paymentUtils.compact({ entityId, kind: opts.kind, limitKey: opts.limitKey })
    const { items } = await records.list(where as Criteria<PaymentGrantRecord>, { size: 0 })

    return items.filter(item => opts.active == null || grantFoldHelper.inForceAt(item, at) === opts.active)
      .sort(newestFirst)
  }

  const inForce = async (entityId: string, at: Date = new Date()): Promise<PaymentGrantRecord[]> => {
    const records = access.grantRecordsOf()
    if (records == null) {
      return []
    }
    const { items } = await records.list({ entityId, status: EntitlementGrantStatus.Active }, { size: 0 })

    return items.filter(item => grantFoldHelper.inForceAt(item, at))
  }

  return { grant, revoke, get, list, inForce }
}

/** The entitlement grants of a context — one per context; also `paymentAccessOf(ctx).grants()`. */
export const entitlementGrantsOf = memoHelper.oncePer(makeEntitlementGrantHelper)
