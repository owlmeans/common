import {
  LimitExhausted, LimitKind, LimitMisdeclared, LimitUnknown, LimitWindow, OCCUPANCY_WINDOW, PlanRequired,
  SUBSCRIPTION_WEEK_MS, SUBSCRIPTION_WEEK_PREFIX, type LimitDeclaration, type LimitView, entitlementViewHelper,
  planLimitHelper, promoHelper,
} from '@owlmeans/payment'
import { UnsupportedArgumentError } from '@owlmeans/resource'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type {
  ConsumeRequest, CounterReconciliation, EffectivePlan, LimitOutcome, OccupancyOutcome, PaymentGrantRecord,
  PaymentUsageCounterRecord, PaymentUsageRecord, ReleaseRequest,
} from './types.js'
import { log } from './log.js'
import { EntitlementGrantKind, EntitlementGrantStatus } from './consts.js'
import { DAY_WINDOW, MONTH_WINDOW } from './consts.local.js'
import type { CounterKey, LedgerSum, UsageHelper } from './usage/types.js'
import { paymentAccessOf } from './access.js'
import { paymentUtils } from './utils.js'
import { catalogueOf } from './catalogue.js'
import { grantFoldHelper } from './grant-fold.js'
import { entitlementGrantsOf } from './grants.js'

/**
 * The usage ledger and its counters.
 *
 * `payment-usage` events are the source of truth; `payment-usage-counter` is a projection kept
 * for synchronous admission. Consuming increments the counter FIRST, with one atomic conditional
 * update that only matches while there is room, and appends the event after. Invariant: **the
 * counter may over-count, never over-admit.** A crash between the two leaves a unit counted that no
 * event spent, which `reconcileCounters` repairs from the ledger; the opposite order would let two
 * concurrent requests both read "room left" and both spend it.
 *
 * Entitlement grants of `units` extend a limit beyond its plan. A unit is taken from a grant only
 * when the plan's own counter has no room: a conditional increment of the grant's `used` (room for
 * the unit AND for whatever the plan counter holds over its own ceiling), then the event in the
 * window `grant:<grantId>` — the same order, the same invariant. A release returns the unit to the
 * grant it was taken from; reconciliation rebuilds a grant's `used` from its events and never folds
 * them into a counter window.
 */

/** When a stored window renews: the first instant of the next day, month or subscription week. */
const resetsAtOfWindow = (window: string): Date | undefined => {
  if (window.startsWith(SUBSCRIPTION_WEEK_PREFIX)) {
    const start = new Date(window.slice(SUBSCRIPTION_WEEK_PREFIX.length)).getTime()
    return Number.isFinite(start) ? new Date(start + SUBSCRIPTION_WEEK_MS) : undefined
  }
  const day = DAY_WINDOW.exec(window)
  if (day != null) {
    return new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]) + 1))
  }
  const month = MONTH_WINDOW.exec(window)
  if (month != null) {
    return new Date(Date.UTC(Number(month[1]), Number(month[2]), 1))
  }

  return undefined
}

const ceilingOf = (declaration: LimitDeclaration, effective: EffectivePlan, at: Date): number =>
  promoHelper.promoActive(declaration.promo, effective.subscription?.createdAt, at) ? declaration.limit : 0

const declarationOf = (effective: EffectivePlan, limitKey: string): LimitDeclaration => {
  const declaration = effective.plan.limits?.[limitKey]
  if (declaration == null) {
    throw new LimitUnknown(limitKey)
  }

  return declaration
}

const isActiveConsumption = (event: PaymentUsageRecord | null): boolean =>
  event != null && event.delta > 0 && event.releasedAt == null

const isPastWindow = (window: string, at: Date): boolean => {
  if (window.startsWith(SUBSCRIPTION_WEEK_PREFIX)) {
    const reset = resetsAtOfWindow(window)
    return reset != null && reset.getTime() <= at.getTime()
  }
  if (DAY_WINDOW.test(window)) {
    return window < planLimitHelper.windowKeyOf(LimitKind.Window, LimitWindow.Day, at)
  }
  if (MONTH_WINDOW.test(window)) {
    return window < planLimitHelper.windowKeyOf(LimitKind.Window, LimitWindow.Month, at)
  }

  return false
}

export const makeUsageHelper = (ctx: ApiContext): UsageHelper => {
  const access = paymentAccessOf(ctx)

  const readCounter = async (key: CounterKey): Promise<PaymentUsageCounterRecord | null> =>
    await access.usageCounters().load({ entityId: key.entityId, limitKey: key.limitKey, window: key.window })

  /**
   * A limit's numbers after a ledger operation: the counter of `key` (its ceiling `limit`, else the
   * counter's own) with the grants `units` folded in. `window` is where the event lives — the
   * counter's, or a grant's.
   */
  const outcomeOf = async (
    key: CounterKey, eventKey: string, flags: { admitted: boolean, replayed: boolean }, limit?: number,
    units: readonly PaymentGrantRecord[] = [], window: string = key.window,
  ): Promise<LimitOutcome> => {
    const counter = await readCounter(key)
    const used = Math.max(0, counter?.used ?? 0) + grantFoldHelper.unitsFold(units).used
    const ceiling = (limit ?? counter?.limit ?? 0) + grantFoldHelper.unitsFold(units).amount
    const resetsAt = resetsAtOfWindow(key.window)

    return {
      ...flags, limitKey: key.limitKey, window, used, limit: ceiling,
      remaining: Math.max(0, ceiling - used), ...(resetsAt != null ? { resetsAt } : {}), eventKey,
    }
  }

  /**
   * Take `amount` units from the first grant (in consumption order) that has room for them AND for
   * what the plan counter holds over its own ceiling — so the folded total never exceeds the folded
   * ceiling. One conditional increment per grant, guarded by `used` and the status: never over-admits.
   */
  const holdOnGrant = async (
    key: CounterKey, units: readonly PaymentGrantRecord[], amount: number, limit: number,
  ): Promise<PaymentGrantRecord | null> => {
    if (units.length === 0) {
      return null
    }
    const overflow = Math.max(0, ((await readCounter(key))?.used ?? 0) - limit)
    const grants = access.grantRecords().collection
    for (const grant of units) {
      const room = (grant.amount ?? 0) - amount - overflow
      if (grant.id == null || room < 0) {
        continue
      }
      const doc = await grants.findOneAndUpdate(
        paymentUtils.idCriteria(grant.id, { status: EntitlementGrantStatus.Active, used: { $lte: room } }),
        { $inc: { used: amount } }, { returnDocument: 'after' },
      ) as { used?: number } | null
      if (doc != null) {
        return { ...grant, used: doc.used ?? (grant.used ?? 0) + amount }
      }
    }

    return null
  }

  /** Give `amount` units back to a grant, never below zero. */
  const returnToGrant = async (grantId: string, amount: number): Promise<void> => {
    const grants = access.grantRecords().collection
    const doc = await grants.findOneAndUpdate(
      paymentUtils.idCriteria(grantId, { used: { $gte: amount } }), { $inc: { used: -amount } },
    )
    if (doc == null) {
      await grants.updateOne(paymentUtils.idCriteria(grantId), { $set: { used: 0 } })
    }
  }

  /** The counter increment that IS the admission decision. `null` when there is no room. */
  const admit = async (
    key: CounterKey, amount: number, limit: number, planSku: string, at: Date,
  ): Promise<PaymentUsageCounterRecord | null> => {
    if (amount > limit) {
      return null
    }
    const filter = { ...key, used: { $lte: limit - amount } }
    const update = {
      $inc: { used: amount },
      $set: { limit, planSku, updatedAt: at },
      $setOnInsert: { ...key },
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const doc = await access.usageCounters().collection.findOneAndUpdate(
          filter, update, { upsert: true, returnDocument: 'after' },
        )
        return doc as unknown as PaymentUsageCounterRecord | null
      } catch (error) {
        // A duplicate here is either a racing insert of the same counter — the retry then matches
        // the inserted document — or an existing counter without room, whose upsert collides again.
        if (!paymentUtils.isDuplicateKey(error)) {
          throw error
        }
      }
    }

    return null
  }

  /** Take `amount` back off a counter, never below zero. */
  const decrement = async (key: CounterKey, amount: number, at: Date): Promise<void> => {
    const counters = access.usageCounters().collection
    const doc = await counters.findOneAndUpdate(
      { ...key, used: { $gte: amount } }, { $inc: { used: -amount }, $set: { updatedAt: at } },
    )
    if (doc == null) {
      await counters.updateOne({ ...key }, { $set: { used: 0, updatedAt: at } })
    }
  }

  const consumeLimit = async (req: ConsumeRequest): Promise<LimitOutcome> => {
    const amount = req.amount ?? 1
    if (!Number.isSafeInteger(amount) || amount < 1) {
      throw new UnsupportedArgumentError('amount')
    }
    const at = new Date()
    const effective = await catalogueOf(ctx).resolveEffectivePlan(req.entityId, at)
    const declaration = declarationOf(effective, req.limitKey)
    const limit = ceilingOf(declaration, effective, at)
    const key: CounterKey = {
      entityId: req.entityId, limitKey: req.limitKey, window: planLimitHelper.windowKeyOf(declaration.kind, declaration.window, at, effective?.subscription?.createdAt),
    }
    // The limit's grants in force: consumed only once the plan's own counter has no room.
    const units = grantFoldHelper.unitsOf(effective.grants ?? [], req.limitKey)
    const ledger = access.usageEvents()

    /**
     * What an event already written answers: the limit as it stands now when the event is of the
     * current window or of a grant; its own window's counter otherwise (`ceiling`, else the counter's).
     */
    const replay = async (event: PaymentUsageRecord | null, ceiling?: number): Promise<LimitOutcome> => {
      const window = event?.window ?? key.window
      const flags = { admitted: isActiveConsumption(event), replayed: true }

      return window === key.window || grantFoldHelper.grantIdOf(window) != null
        ? await outcomeOf(key, req.eventKey, flags, limit, units, window)
        : await outcomeOf({ ...key, window }, req.eventKey, flags, ceiling)
    }

    // A retry of an event already written answers from the ledger before admission is asked: at the
    // ceiling, admission would refuse the very unit this key already holds. A released key is final.
    const earlier = await ledger.load({ entityId: req.entityId, limitKey: req.limitKey, eventKey: req.eventKey })
    if (earlier != null) {
      return await replay(earlier)
    }

    const append = async (window: string, undo: () => Promise<void>): Promise<LimitOutcome | null> => {
      try {
        await ledger.create({
          ...key, window, delta: amount, eventKey: req.eventKey, ref: req.ref, reason: req.reason,
          planSku: effective.plan.sku, createdAt: at,
        })
      } catch (error) {
        // Undo the admission. Should the undo itself fail, the count is over — never over-admitted.
        await undo().catch(failure => { log.error('Usage undo failed', failure) })
        if (!paymentUtils.isDuplicateKey(error)) {
          throw error
        }
        // A concurrent consume of the same key won the event: replay its outcome.
        const winner = await ledger.load({ entityId: req.entityId, limitKey: req.limitKey, eventKey: req.eventKey })
        return await replay(winner, limit)
      }

      return null
    }

    const counter = await admit(key, amount, limit, effective.plan.sku, at)
    if (counter != null) {
      const replayed = await append(key.window, async () => { await decrement(key, amount, at) })
      if (replayed != null) {
        return replayed
      }
      const fold = grantFoldHelper.unitsFold(units)
      const used = Math.max(0, counter.used) + fold.used
      const ceiling = limit + fold.amount
      const resetsAt = resetsAtOfWindow(key.window)

      return {
        admitted: true, replayed: false, limitKey: req.limitKey, window: key.window, used, limit: ceiling,
        remaining: Math.max(0, ceiling - used), ...(resetsAt != null ? { resetsAt } : {}), eventKey: req.eventKey,
      }
    }

    // A concurrent consume of this very key may hold the last unit: that is a replay, not a refusal.
    const concurrent = await ledger.load({ entityId: req.entityId, limitKey: req.limitKey, eventKey: req.eventKey })
    if (concurrent != null) {
      return await replay(concurrent)
    }

    // The plan's own allowance has no room: a unit of a grant of this limit, when one has room.
    const held = await holdOnGrant(key, units, amount, limit)
    if (held != null) {
      const window = grantFoldHelper.windowOf(held.id!)
      const replayed = await append(window, async () => { await returnToGrant(held.id!, amount) })
      if (replayed != null) {
        return replayed
      }

      return await outcomeOf(key, req.eventKey, { admitted: true, replayed: false }, limit,
        units.map(grant => grant.id === held.id ? held : grant), window)
    }

    const current = await readCounter(key)
    const fold = grantFoldHelper.unitsFold(units)
    const resetsAt = declaration.kind === LimitKind.Window && declaration.window != null
      ? planLimitHelper.windowBoundsOf(declaration.window, at, effective?.subscription?.createdAt).resetsAt : undefined
    throw new LimitExhausted({
      key: req.limitKey, used: (current?.used ?? 0) + fold.used, limit: limit + fold.amount, resetsAt,
    })
  }

  /**
   * What a release answers: the counter of the event's window with the limit's grants in force
   * folded in; for a unit held on a grant, the limit as it stands now (its current window).
   */
  const releaseOutcomeOf = async (
    req: ReleaseRequest, consumed: PaymentUsageRecord, flags: { admitted: boolean, replayed: boolean },
  ): Promise<LimitOutcome> => {
    const at = new Date()
    if (grantFoldHelper.grantIdOf(consumed.window) == null) {
      const units = grantFoldHelper.unitsOf(await entitlementGrantsOf(ctx).inForce(req.entityId, at), req.limitKey)
      return await outcomeOf({ entityId: req.entityId, limitKey: req.limitKey, window: consumed.window }, req.eventKey,
        flags, undefined, units)
    }
    try {
      const effective = await catalogueOf(ctx).resolveEffectivePlan(req.entityId, at)
      const declaration = declarationOf(effective, req.limitKey)
      const key: CounterKey = {
        entityId: req.entityId, limitKey: req.limitKey,
        window: planLimitHelper.windowKeyOf(declaration.kind, declaration.window, at, effective.subscription?.createdAt),
      }

      return await outcomeOf(key, req.eventKey, flags, ceilingOf(declaration, effective, at),
        grantFoldHelper.unitsOf(effective.grants ?? [], req.limitKey), consumed.window)
    } catch (error) {
      if (!(error instanceof LimitUnknown) && !(error instanceof PlanRequired)) {
        throw error
      }
      // No plan declares the limit any more: only its grants are left to report.
      const fold = grantFoldHelper.unitsFold(
        grantFoldHelper.unitsOf(await entitlementGrantsOf(ctx).inForce(req.entityId, at), req.limitKey),
      )

      return {
        ...flags, limitKey: req.limitKey, window: consumed.window, used: fold.used, limit: fold.amount,
        remaining: Math.max(0, fold.amount - fold.used), eventKey: req.eventKey,
      }
    }
  }

  const releaseLimit = async (req: ReleaseRequest): Promise<LimitOutcome> => {
    const ledger = access.usageEvents()
    const consumed = await ledger.load({ entityId: req.entityId, limitKey: req.limitKey, eventKey: req.eventKey })
    if (consumed == null || consumed.delta <= 0) {
      return {
        admitted: false, replayed: false, limitKey: req.limitKey, window: consumed?.window ?? '', used: 0,
        limit: 0, remaining: 0, eventKey: req.eventKey,
      }
    }
    const key: CounterKey = { entityId: req.entityId, limitKey: req.limitKey, window: consumed.window }
    // A unit held on a grant goes back to that grant, never to a counter.
    const grantId = grantFoldHelper.grantIdOf(consumed.window)
    if (consumed.releasedAt != null) {
      return await releaseOutcomeOf(req, consumed, { admitted: true, replayed: true })
    }
    const amount = Math.min(req.amount ?? consumed.delta, consumed.delta)
    if (!Number.isSafeInteger(amount) || amount < 1) {
      throw new UnsupportedArgumentError('amount')
    }

    const at = new Date()
    let appended = true
    try {
      await ledger.create({
        ...key, delta: -amount, eventKey: `release:${req.eventKey}`, ref: consumed.ref ?? undefined,
        reason: 'release', planSku: consumed.planSku ?? undefined, createdAt: at,
      })
    } catch (error) {
      if (!paymentUtils.isDuplicateKey(error)) {
        throw error
      }
      // An earlier attempt appended the release and gave the unit back; only the stamp is missing.
      appended = false
    }
    if (appended) {
      if (grantId != null) {
        await returnToGrant(grantId, amount)
      } else {
        await decrement(key, amount, at)
      }
    }
    await ledger.update({ ...consumed, releasedAt: at })

    return await releaseOutcomeOf(req, consumed, { admitted: true, replayed: false })
  }

  const consumptionOf = async (
    entityId: string, limitKey: string, eventKey: string,
  ): Promise<PaymentUsageRecord | null> => {
    const event = await access.usageEvents().load({ entityId, limitKey, eventKey })

    return event != null && isActiveConsumption(event) ? event : null
  }

  const consumptionByRefOf = async (
    entityId: string, limitKey: string, ref: string,
  ): Promise<PaymentUsageRecord | null> => await access.usageEvents().load(
    { entityId, limitKey, ref, delta: { $gt: 0 }, releasedAt: null },
    { sort: [{ field: 'createdAt', order: 'desc' }] },
  )

  const limitStateOf = async (entityId: string, limitKey: string): Promise<LimitView> => {
    const at = new Date()
    const effective = await catalogueOf(ctx).resolveEffectivePlan(entityId, at)
    const declaration = declarationOf(effective, limitKey)
    const window = planLimitHelper.windowKeyOf(declaration.kind, declaration.window, at, effective?.subscription?.createdAt)
    const counter = await readCounter({ entityId, limitKey, window })
    const [view] = entitlementViewHelper.limitViewsOf({ limits: { [limitKey]: declaration } }, counter != null ? [{ key: limitKey, window, used: counter.used }] : [], effective.subscription?.createdAt, at)

    return grantFoldHelper.foldLimitView(view, effective.grants ?? [])
  }

  const ledgerSums = async (match: Partial<CounterKey>): Promise<LedgerSum[]> => {
    const filter = Object.fromEntries(Object.entries(match).filter(([, value]) => value != null))
    const rows = await access.usageEvents().collection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { entityId: '$entityId', limitKey: '$limitKey', window: '$window' },
          used: { $sum: '$delta' },
        },
      },
    ], { allowDiskUse: true }).toArray()

    return rows.map(row => ({ ...(row._id as CounterKey), used: row.used as number }))
  }

  /** Set a counter to a value, creating it when absent. */
  const setCounter = async (
    key: CounterKey, set: Partial<PaymentUsageCounterRecord>, unset: string[] = [],
  ): Promise<void> => {
    const update = {
      $set: set,
      $setOnInsert: { ...key },
      ...(unset.length > 0 ? { $unset: Object.fromEntries(unset.map(field => [field, ''])) } : {}),
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await access.usageCounters().collection.updateOne({ ...key }, update, { upsert: true })
        return
      } catch (error) {
        if (!paymentUtils.isDuplicateKey(error) || attempt > 0) {
          throw error
        }
      }
    }
  }

  const reconcileOccupancyOf = async (
    entityId: string, limitKey: string, actual: number,
  ): Promise<OccupancyOutcome> => {
    if (!Number.isSafeInteger(actual) || actual < 0) {
      throw new UnsupportedArgumentError('actual')
    }
    const at = new Date()
    const effective = await catalogueOf(ctx).resolveEffectivePlan(entityId, at)
    const declaration = declarationOf(effective, limitKey)
    if (declaration.kind !== LimitKind.Occupancy) {
      throw new LimitMisdeclared(`${limitKey}:not-occupancy`)
    }
    const ceiling = ceilingOf(declaration, effective, at)
    const key: CounterKey = { entityId, limitKey, window: OCCUPANCY_WINDOW }
    // What the grants in force hold is theirs; the plan counter holds the rest of what exists. A
    // revoked or ended grant's units fall back on the plan counter here — over its ceiling, flagged.
    const fold = grantFoldHelper.unitsFold(grantFoldHelper.unitsOf(effective.grants ?? [], limitKey))
    const held = Math.max(0, actual - fold.used)
    const limit = ceiling + fold.amount

    const [sum] = await ledgerSums(key)
    const delta = held - (sum?.used ?? 0)
    if (delta !== 0) {
      const eventKey = `reconcile:${limitKey}:${planLimitHelper.windowKeyOf(LimitKind.Window, LimitWindow.Day, at)}`
      try {
        await access.usageEvents().create({
          ...key, delta, eventKey, reason: 'reconcile', planSku: effective.plan.sku, createdAt: at,
        })
      } catch (error) {
        if (!paymentUtils.isDuplicateKey(error)) {
          throw error
        }
        await access.usageEvents().collection.updateOne({ entityId, limitKey, eventKey }, { $inc: { delta } })
      }
    }

    const counter = await readCounter(key)
    const over = Math.max(0, actual - limit)
    const overSince = over > 0 ? (counter?.overSince != null ? new Date(counter.overSince) : at) : undefined
    await setCounter(key, {
      used: held, limit: ceiling, planSku: effective.plan.sku, updatedAt: at, reconciledAt: at,
      ...(overSince != null ? { overSince } : {}),
    }, overSince == null ? ['overSince'] : [])

    return { limitKey, used: actual, limit, over, ...(overSince != null ? { overSince } : {}) }
  }

  /**
   * Rebuild every units grant's `used` of an entity from its events (`sums` of its `grant:<id>`
   * windows); a grant without events holds nothing.
   */
  const reconcileGrants = async (entityId: string, sums: readonly LedgerSum[]): Promise<CounterReconciliation> => {
    const records = access.grantRecordsOf()
    if (records == null) {
      return { counters: 0, repaired: 0 }
    }
    const byGrant = new Map<string, number>()
    for (const sum of sums) {
      const grantId = grantFoldHelper.grantIdOf(sum.window)
      if (grantId != null) {
        byGrant.set(grantId, (byGrant.get(grantId) ?? 0) + sum.used)
      }
    }
    const { items } = await records.list({ entityId, kind: EntitlementGrantKind.Units }, { size: 0 })
    let counters = 0
    let repaired = 0
    for (const grant of items) {
      if (grant.id == null) {
        continue
      }
      const used = Math.max(0, byGrant.get(grant.id) ?? 0)
      counters++
      if (used !== (grant.used ?? 0)) {
        repaired++
        await records.collection.updateOne(paymentUtils.idCriteria(grant.id), { $set: { used } })
      }
    }

    return { counters, repaired }
  }

  const reconcileLedgerCounters = async (entityId?: string): Promise<CounterReconciliation> => {
    const at = new Date()
    const sums = await ledgerSums(entityId != null ? { entityId } : {})
    const entities = new Set(sums.map(sum => sum.entityId))
    if (entityId != null) {
      entities.add(entityId)
    }

    let counters = 0
    let repaired = 0
    for (const entity of entities) {
      let effective: EffectivePlan | null = null
      try {
        effective = await catalogueOf(ctx).resolveEffectivePlan(entity, at)
      } catch (error) {
        log.warn('Reconcile: no plan for an entity', { entityId: entity, error })
      }
      const limitOf = (limitKey: string, fallback: number): number => {
        const declaration = effective?.plan.limits?.[limitKey]
        return declaration != null && effective != null ? ceilingOf(declaration, effective, at) : fallback
      }

      // A grant's events rebuild that grant, never a counter window.
      const own = sums.filter(sum => sum.entityId === entity)
      const ledger = new Map(own.filter(sum => grantFoldHelper.grantIdOf(sum.window) == null)
        .map(sum => [`${sum.limitKey} ${sum.window}`, sum.used]))
      const { items: stored } = await access.usageCounters().list({ entityId: entity }, { size: 0 })
      const seen = new Set<string>()

      for (const counter of stored) {
        const id = `${counter.limitKey} ${counter.window}`
        seen.add(id)
        const sum = ledger.get(id)
        if (sum == null && isPastWindow(counter.window, at)) {
          await access.usageCounters().collection.deleteOne({
            entityId: entity, limitKey: counter.limitKey, window: counter.window,
          })
          continue
        }
        const used = Math.max(0, sum ?? 0)
        const limit = limitOf(counter.limitKey, counter.limit)
        counters++
        if (used !== counter.used) {
          repaired++
        }
        await setCounter({ entityId: entity, limitKey: counter.limitKey, window: counter.window }, {
          used, limit, updatedAt: at, reconciledAt: at,
        })
      }

      for (const [id, sum] of ledger) {
        if (seen.has(id)) {
          continue
        }
        const [limitKey, window] = id.split(' ')
        counters++
        repaired++
        await setCounter({ entityId: entity, limitKey, window }, {
          used: Math.max(0, sum), limit: limitOf(limitKey, 0), updatedAt: at, reconciledAt: at,
        })
        seen.add(id)
      }

      for (const [limitKey, declaration] of Object.entries(effective?.plan.limits ?? {})) {
        if (declaration.kind !== LimitKind.Window) {
          continue
        }
        const window = planLimitHelper.windowKeyOf(declaration.kind, declaration.window, at, effective?.subscription?.createdAt)
        if (seen.has(`${limitKey} ${window}`)) {
          continue
        }
        counters++
        await setCounter({ entityId: entity, limitKey, window }, {
          used: 0, limit: limitOf(limitKey, 0), planSku: effective?.plan.sku, updatedAt: at, reconciledAt: at,
        })
      }

      const grants = await reconcileGrants(entity, own)
      counters += grants.counters
      repaired += grants.repaired
    }

    return { counters, repaired }
  }

  return {
    consumeLimit, releaseLimit, consumptionOf, consumptionByRefOf, limitStateOf, ledgerSums, reconcileOccupancyOf,
    reconcileLedgerCounters,
  }
}

/** The usage ledger of a context — one per context. */
export const usageOf = memoHelper.oncePer(makeUsageHelper)
