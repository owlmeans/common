import {
  LIFETIME_WINDOW, LimitExhausted, LimitKind, LimitMisdeclared, LimitUnknown, LimitWindow, limitViewsOf,
  OCCUPANCY_WINDOW, promoActive, windowBoundsOf, windowKeyOf,
} from '@owlmeans/payment'
import type { LimitDeclaration, LimitView } from '@owlmeans/payment'
import { UnsupportedArgumentError } from '@owlmeans/resource'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { resolveEffectivePlan } from './plan.js'
import { isDuplicateKey, usageCounters, usageEvents } from './utils.js'
import type {
  ConsumeRequest, CounterReconciliation, EffectivePlan, LimitOutcome, OccupancyOutcome,
  PaymentUsageCounterRecord, PaymentUsageRecord, ReleaseRequest,
} from './types.js'

/**
 * The usage ledger and its counters.
 *
 * `payment-usage` events are the source of truth; `payment-usage-counter` is a projection kept
 * for synchronous admission. Consuming increments the counter FIRST, with one atomic conditional
 * update that only matches while there is room, and appends the event after. Invariant: **the
 * counter may over-count, never over-admit.** A crash between the two leaves a unit counted that no
 * event spent, which `reconcileCounters` repairs from the ledger; the opposite order would let two
 * concurrent requests both read "room left" and both spend it.
 */

interface CounterKey { entityId: string; limitKey: string; window: string }

const DAY_WINDOW = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_WINDOW = /^(\d{4})-(\d{2})$/

/** When a stored window renews: the first instant of the next day or month; nothing for the others. */
export const resetsAtOfWindow = (window: string): Date | undefined => {
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
  promoActive(declaration.promo, effective.subscription?.createdAt, at) ? declaration.limit : 0

const declarationOf = (effective: EffectivePlan, limitKey: string): LimitDeclaration => {
  const declaration = effective.plan.limits?.[limitKey]
  if (declaration == null) {
    throw new LimitUnknown(limitKey)
  }

  return declaration
}

const readCounter = async (ctx: ApiContext, key: CounterKey): Promise<PaymentUsageCounterRecord | null> =>
  await usageCounters(ctx).load({ entityId: key.entityId, limitKey: key.limitKey, window: key.window })

const outcomeOf = async (
  ctx: ApiContext, key: CounterKey, eventKey: string, flags: { admitted: boolean, replayed: boolean },
  limit?: number,
): Promise<LimitOutcome> => {
  const counter = await readCounter(ctx, key)
  const used = Math.max(0, counter?.used ?? 0)
  const ceiling = limit ?? counter?.limit ?? 0
  const resetsAt = resetsAtOfWindow(key.window)

  return {
    ...flags, limitKey: key.limitKey, window: key.window, used, limit: ceiling,
    remaining: Math.max(0, ceiling - used), ...(resetsAt != null ? { resetsAt } : {}), eventKey,
  }
}

/** The counter increment that IS the admission decision. `null` when there is no room. */
const admit = async (
  ctx: ApiContext, key: CounterKey, amount: number, limit: number, planSku: string, at: Date,
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
      const doc = await usageCounters(ctx).collection.findOneAndUpdate(
        filter, update, { upsert: true, returnDocument: 'after' },
      )
      return doc as unknown as PaymentUsageCounterRecord | null
    } catch (error) {
      // A duplicate here is either a racing insert of the same counter — the retry then matches
      // the inserted document — or an existing counter without room, whose upsert collides again.
      if (!isDuplicateKey(error)) {
        throw error
      }
    }
  }

  return null
}

/** Take `amount` back off a counter, never below zero. */
const decrement = async (ctx: ApiContext, key: CounterKey, amount: number, at: Date): Promise<void> => {
  const counters = usageCounters(ctx).collection
  const doc = await counters.findOneAndUpdate(
    { ...key, used: { $gte: amount } }, { $inc: { used: -amount }, $set: { updatedAt: at } },
  )
  if (doc == null) {
    await counters.updateOne({ ...key }, { $set: { used: 0, updatedAt: at } })
  }
}

const isActiveConsumption = (event: PaymentUsageRecord | null): boolean =>
  event != null && event.delta > 0 && event.releasedAt == null

/** @throws LimitExhausted | LimitUnknown */
export const consumeLimit = async (ctx: ApiContext, req: ConsumeRequest): Promise<LimitOutcome> => {
  const amount = req.amount ?? 1
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new UnsupportedArgumentError('amount')
  }
  const at = new Date()
  const effective = await resolveEffectivePlan(ctx, req.entityId, at)
  const declaration = declarationOf(effective, req.limitKey)
  const limit = ceilingOf(declaration, effective, at)
  const key: CounterKey = {
    entityId: req.entityId, limitKey: req.limitKey, window: windowKeyOf(declaration.kind, declaration.window, at),
  }
  const ledger = usageEvents(ctx)

  // A retry of an event already written answers from the ledger before admission is asked: at the
  // ceiling, admission would refuse the very unit this key already holds. A released key is final.
  const earlier = await ledger.load({ entityId: req.entityId, limitKey: req.limitKey, eventKey: req.eventKey })
  if (earlier != null) {
    return await outcomeOf(ctx, { ...key, window: earlier.window }, req.eventKey, {
      admitted: isActiveConsumption(earlier), replayed: true,
    }, earlier.window === key.window ? limit : undefined)
  }

  const counter = await admit(ctx, key, amount, limit, effective.plan.sku, at)
  if (counter == null) {
    // A concurrent consume of this very key may hold the last unit: that is a replay, not a refusal.
    const concurrent = await ledger.load({ entityId: req.entityId, limitKey: req.limitKey, eventKey: req.eventKey })
    if (concurrent != null) {
      return await outcomeOf(ctx, { ...key, window: concurrent.window }, req.eventKey, {
        admitted: isActiveConsumption(concurrent), replayed: true,
      }, concurrent.window === key.window ? limit : undefined)
    }
    const current = await readCounter(ctx, key)
    const resetsAt = declaration.kind === LimitKind.Window && declaration.window != null
      ? windowBoundsOf(declaration.window, at).resetsAt : undefined
    throw new LimitExhausted({ key: req.limitKey, used: current?.used ?? 0, limit, resetsAt })
  }

  try {
    await ledger.create({
      ...key, delta: amount, eventKey: req.eventKey, ref: req.ref, reason: req.reason,
      planSku: effective.plan.sku, createdAt: at,
    })
  } catch (error) {
    // Undo the admission. Should the undo itself fail, the counter over-counts — never over-admits.
    await decrement(ctx, key, amount, at).catch(undo => { console.error('[payment] usage undo failed', undo) })
    if (!isDuplicateKey(error)) {
      throw error
    }
    // A concurrent consume of the same key won the event: replay its outcome.
    const winner = await ledger.load({ entityId: req.entityId, limitKey: req.limitKey, eventKey: req.eventKey })
    return await outcomeOf(ctx, { ...key, window: winner?.window ?? key.window }, req.eventKey, {
      admitted: isActiveConsumption(winner), replayed: true,
    }, limit)
  }

  const used = Math.max(0, counter.used)
  const resetsAt = resetsAtOfWindow(key.window)

  return {
    admitted: true, replayed: false, limitKey: req.limitKey, window: key.window, used, limit,
    remaining: Math.max(0, limit - used), ...(resetsAt != null ? { resetsAt } : {}), eventKey: req.eventKey,
  }
}

/** Idempotent: the release event is appended first, the counter decremented only by that append. */
export const releaseLimit = async (ctx: ApiContext, req: ReleaseRequest): Promise<LimitOutcome> => {
  const ledger = usageEvents(ctx)
  const consumed = await ledger.load({ entityId: req.entityId, limitKey: req.limitKey, eventKey: req.eventKey })
  if (consumed == null || consumed.delta <= 0) {
    return {
      admitted: false, replayed: false, limitKey: req.limitKey, window: consumed?.window ?? '', used: 0,
      limit: 0, remaining: 0, eventKey: req.eventKey,
    }
  }
  const key: CounterKey = { entityId: req.entityId, limitKey: req.limitKey, window: consumed.window }
  if (consumed.releasedAt != null) {
    return await outcomeOf(ctx, key, req.eventKey, { admitted: true, replayed: true })
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
    if (!isDuplicateKey(error)) {
      throw error
    }
    // An earlier attempt appended the release and decremented; only the stamp is missing.
    appended = false
  }
  if (appended) {
    await decrement(ctx, key, amount, at)
  }
  await ledger.update({ ...consumed, releasedAt: at })

  return await outcomeOf(ctx, key, req.eventKey, { admitted: true, replayed: false })
}

/** The active consume event of a key, or `null` (never consumed, or released). */
export const consumptionOf = async (
  ctx: ApiContext, entityId: string, limitKey: string, eventKey: string,
): Promise<PaymentUsageRecord | null> => {
  const event = await usageEvents(ctx).load({ entityId, limitKey, eventKey })

  return event != null && isActiveConsumption(event) ? event : null
}

/**
 * The newest active consume event (not released) that pays for `ref`, or `null`. For a unit held
 * per record under a fresh event key each time — an occupancy acquired again after a release —
 * this answers "does the record hold a unit, and under which key".
 */
export const consumptionByRefOf = async (
  ctx: ApiContext, entityId: string, limitKey: string, ref: string,
): Promise<PaymentUsageRecord | null> => await usageEvents(ctx).load(
  { entityId, limitKey, ref, delta: { $gt: 0 }, releasedAt: null },
  { sort: [{ field: 'createdAt', order: 'desc' }] },
)

/** One limit of the effective plan, read against its current window. @throws LimitUnknown */
export const limitStateOf = async (ctx: ApiContext, entityId: string, limitKey: string): Promise<LimitView> => {
  const at = new Date()
  const effective = await resolveEffectivePlan(ctx, entityId, at)
  const declaration = declarationOf(effective, limitKey)
  const window = windowKeyOf(declaration.kind, declaration.window, at)
  const counter = await readCounter(ctx, { entityId, limitKey, window })
  const [view] = limitViewsOf(
    { limits: { [limitKey]: declaration } },
    counter != null ? [{ key: limitKey, window, used: counter.used }] : [],
    effective.subscription?.createdAt, at,
  )

  return view
}

interface LedgerSum { entityId: string; limitKey: string; window: string; used: number }

/** Sum of every event's `delta`, per (entity, limit, window). */
export const ledgerSums = async (
  ctx: ApiContext, match: Partial<CounterKey>,
): Promise<LedgerSum[]> => {
  const filter = Object.fromEntries(Object.entries(match).filter(([, value]) => value != null))
  const rows = await usageEvents(ctx).collection.aggregate([
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
  ctx: ApiContext, key: CounterKey, set: Partial<PaymentUsageCounterRecord>, unset: string[] = [],
): Promise<void> => {
  const update = {
    $set: set,
    $setOnInsert: { ...key },
    ...(unset.length > 0 ? { $unset: Object.fromEntries(unset.map(field => [field, ''])) } : {}),
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await usageCounters(ctx).collection.updateOne({ ...key }, update, { upsert: true })
      return
    } catch (error) {
      if (!isDuplicateKey(error) || attempt > 0) {
        throw error
      }
    }
  }
}

/**
 * Bring an occupancy limit's ledger and counter to the live count. Appends at most one adjusting
 * event per limit per UTC day (`reconcile:<key>:<YYYY-MM-DD>`), adjusted in place by a later run of
 * the same day, so the ledger sum always equals what was last observed. Flags `overSince` while the
 * count exceeds the limit. Never stops anything.
 *
 * @throws LimitUnknown | LimitMisdeclared
 */
export const reconcileOccupancyOf = async (
  ctx: ApiContext, entityId: string, limitKey: string, actual: number,
): Promise<OccupancyOutcome> => {
  if (!Number.isSafeInteger(actual) || actual < 0) {
    throw new UnsupportedArgumentError('actual')
  }
  const at = new Date()
  const effective = await resolveEffectivePlan(ctx, entityId, at)
  const declaration = declarationOf(effective, limitKey)
  if (declaration.kind !== LimitKind.Occupancy) {
    throw new LimitMisdeclared(`${limitKey}:not-occupancy`)
  }
  const limit = ceilingOf(declaration, effective, at)
  const key: CounterKey = { entityId, limitKey, window: OCCUPANCY_WINDOW }

  const [sum] = await ledgerSums(ctx, key)
  const delta = actual - (sum?.used ?? 0)
  if (delta !== 0) {
    const eventKey = `reconcile:${limitKey}:${windowKeyOf(LimitKind.Window, LimitWindow.Day, at)}`
    try {
      await usageEvents(ctx).create({
        ...key, delta, eventKey, reason: 'reconcile', planSku: effective.plan.sku, createdAt: at,
      })
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error
      }
      await usageEvents(ctx).collection.updateOne({ entityId, limitKey, eventKey }, { $inc: { delta } })
    }
  }

  const counter = await readCounter(ctx, key)
  const over = Math.max(0, actual - limit)
  const overSince = over > 0 ? (counter?.overSince != null ? new Date(counter.overSince) : at) : undefined
  await setCounter(ctx, key, {
    used: actual, limit, planSku: effective.plan.sku, updatedAt: at, reconciledAt: at,
    ...(overSince != null ? { overSince } : {}),
  }, overSince == null ? ['overSince'] : [])

  return { limitKey, used: actual, limit, over, ...(overSince != null ? { overSince } : {}) }
}

const isPastWindow = (window: string, at: Date): boolean => {
  if (DAY_WINDOW.test(window)) {
    return window < windowKeyOf(LimitKind.Window, LimitWindow.Day, at)
  }
  if (MONTH_WINDOW.test(window)) {
    return window < windowKeyOf(LimitKind.Window, LimitWindow.Month, at)
  }

  return false
}

/**
 * Recompute counters from the ledger — one entity, or every entity the ledger knows.
 *
 * Every (entity, limit, window) with events gets `used = max(0, sum)` and the limit of the
 * entity's current plan; a counter of a past day/month with no events is deleted (lifetime and
 * occupancy counters never are); a counter with no events otherwise reads `0`; and the current
 * window counter of every declared window limit exists.
 */
export const reconcileLedgerCounters = async (ctx: ApiContext, entityId?: string): Promise<CounterReconciliation> => {
  const at = new Date()
  const sums = await ledgerSums(ctx, entityId != null ? { entityId } : {})
  const entities = new Set(sums.map(sum => sum.entityId))
  if (entityId != null) {
    entities.add(entityId)
  }

  let counters = 0
  let repaired = 0
  for (const entity of entities) {
    let effective: EffectivePlan | null = null
    try {
      effective = await resolveEffectivePlan(ctx, entity, at)
    } catch (error) {
      console.warn(`[payment] reconcile: no plan for "${entity}"`, error)
    }
    const limitOf = (limitKey: string, fallback: number): number => {
      const declaration = effective?.plan.limits?.[limitKey]
      return declaration != null && effective != null ? ceilingOf(declaration, effective, at) : fallback
    }

    const ledger = new Map(sums.filter(sum => sum.entityId === entity)
      .map(sum => [`${sum.limitKey} ${sum.window}`, sum.used]))
    const { items: stored } = await usageCounters(ctx).list({ entityId: entity }, { size: 0 })
    const seen = new Set<string>()

    for (const counter of stored) {
      const id = `${counter.limitKey} ${counter.window}`
      seen.add(id)
      const sum = ledger.get(id)
      if (sum == null && isPastWindow(counter.window, at)) {
        await usageCounters(ctx).collection.deleteOne({
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
      await setCounter(ctx, { entityId: entity, limitKey: counter.limitKey, window: counter.window }, {
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
      await setCounter(ctx, { entityId: entity, limitKey, window }, {
        used: Math.max(0, sum), limit: limitOf(limitKey, 0), updatedAt: at, reconciledAt: at,
      })
      seen.add(id)
    }

    for (const [limitKey, declaration] of Object.entries(effective?.plan.limits ?? {})) {
      if (declaration.kind !== LimitKind.Window) {
        continue
      }
      const window = windowKeyOf(declaration.kind, declaration.window, at)
      if (seen.has(`${limitKey} ${window}`)) {
        continue
      }
      counters++
      await setCounter(ctx, { entityId: entity, limitKey, window }, {
        used: 0, limit: limitOf(limitKey, 0), planSku: effective?.plan.sku, updatedAt: at, reconciledAt: at,
      })
    }
  }

  return { counters, repaired }
}

export { LIFETIME_WINDOW, OCCUPANCY_WINDOW }
