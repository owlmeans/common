import { BotConnectionStatus, BotCredentialsRejected, BotReceiveMode, type BotUpdate } from '@owlmeans/bot'
import type { Criteria } from '@owlmeans/resource'
import { BOT_DISPATCH_BATCH, BOT_RETRY_MAX_MS, BotInboxStatus } from '../consts.js'
import type { BotPlatformPlugin } from '../platforms/types.js'
import type { BotConnectionRecord, BotHandler, BotRuntime, BotUpdateRecord } from '../types.js'
import type {
  BotActionsPart, BotInbox, BotRunningReceiver, BotRuntimePart, BotServiceParts, BotSessions,
} from './types.local.js'
import { messageOf } from '../utils/message.js'

export const makeBotRuntimeFactory = (
  parts: BotServiceParts, sessions: BotSessions, inbox: BotInbox, actionsPart: BotActionsPart
): BotRuntimePart => {
  const { store, registry, options } = parts
  const log = parts.log.child('runtime')

  const runtime = (handlers: readonly BotHandler<any>[]): BotRuntime => {
    const names = handlers.map(handler => handler.name)
    if (new Set(names).size !== names.length) {
      log.warn('Bot handler names repeat — a retry skips handlers by name', { handlers: names })
    }
    const receivers = new Map<string, BotRunningReceiver>()
    const inFlight = new Set<Promise<unknown>>()
    const timers = new Set<NodeJS.Timeout>()
    let running = false

    const track = <T>(work: Promise<T>): Promise<T> => {
      inFlight.add(work)
      void work.finally(() => inFlight.delete(work)).catch(() => undefined)
      return work
    }

    // ─── Dispatch ───

    const backoff = (attempts: number): number =>
      Math.min(options.pollMs * 2 ** Math.max(attempts - 1, 0), BOT_RETRY_MAX_MS)

    const claim = async (row: BotUpdateRecord, leaseCutoff: string): Promise<BotUpdateRecord | null> => {
      const fresh = await store.updates().load(row.id!)
      if (fresh == null) {
        return null
      }
      const stale = fresh.status === BotInboxStatus.Processing && (fresh.claimedAt ?? '') < leaseCutoff
      if (fresh.status !== BotInboxStatus.Pending && !stale) {
        return null
      }

      return await store.updates().save({
        ...fresh, status: BotInboxStatus.Processing, attempts: (fresh.attempts ?? 0) + 1, claimedAt: sessions.stamp(),
      })
    }

    const settle = async (row: BotUpdateRecord, handled: string[], errors: string[]): Promise<void> => {
      const error = errors.length > 0 ? errors.join('; ') : null
      if (error == null) {
        await store.updates().save({
          ...row, status: BotInboxStatus.Done, handled, error: null, claimedAt: null, retryAt: null,
          processedAt: sessions.stamp(),
        })
        return
      }
      if (row.attempts >= options.attempts) {
        await store.updates().save({
          ...row, status: BotInboxStatus.Failed, handled, error, claimedAt: null, retryAt: null,
          processedAt: sessions.stamp(),
        })
        log.warn('Bot update failed', { update: row.id, connection: row.connection, attempts: row.attempts })
        return
      }
      await store.updates().save({
        ...row, status: BotInboxStatus.Pending, handled, error, claimedAt: null,
        retryAt: sessions.stamp(backoff(row.attempts)),
      })
    }

    const dispatchRow = async (
      row: BotUpdateRecord, leaseCutoff: string, connections: Map<string, Promise<BotConnectionRecord | null>>
    ): Promise<number> => {
      const claimed = await claim(row, leaseCutoff)
      if (claimed == null) {
        return 0
      }
      let pending = connections.get(claimed.connection)
      if (pending == null) {
        pending = store.connections().load(claimed.connection)
        connections.set(claimed.connection, pending)
      }
      const record = await pending
      if (record == null || !record.enabled || record.scope !== claimed.scope) {
        await store.updates().save({
          ...claimed, status: BotInboxStatus.Failed, error: 'connection-unavailable', claimedAt: null,
          processedAt: sessions.stamp(),
        })
        return 1
      }

      const update: BotUpdate = { ...structuredClone(claimed.update), id: claimed.id! }
      const bot = actionsPart.actionsOf(record, claimed.scope, claimed.connection, update)
      const handled = [...(claimed.handled ?? [])]
      const errors: string[] = []
      for (const handler of handlers) {
        if (handled.includes(handler.name)) {
          continue
        }
        try {
          await handler.handle(update, bot, parts.context())
          handled.push(handler.name)
        } catch (error) {
          errors.push(`${handler.name}: ${messageOf(error)}`)
          log.warn('Bot handler failed', { handler: handler.name, update: claimed.id, error })
        }
      }
      await settle(claimed, handled, errors)

      return 1
    }

    const dispatch = async (): Promise<number> => {
      const now = sessions.stamp()
      const leaseCutoff = sessions.stamp(-options.leaseMs)
      const updates = store.updates()
      const due = await updates.list({
        status: BotInboxStatus.Pending, $or: [{ retryAt: null }, { retryAt: { $lte: now } }],
      } as Criteria<BotUpdateRecord>, { sort: [{ field: 'receivedAt', order: 'asc' }], size: BOT_DISPATCH_BATCH })
      const stale = await updates.list({
        status: BotInboxStatus.Processing, claimedAt: { $lt: leaseCutoff },
      } as Criteria<BotUpdateRecord>, { sort: [{ field: 'receivedAt', order: 'asc' }], size: BOT_DISPATCH_BATCH })

      // One connection's updates in order; connections side by side.
      const byConnection = new Map<string, BotUpdateRecord[]>()
      for (const row of [...stale.items, ...due.items]) {
        byConnection.set(row.connection, [...(byConnection.get(row.connection) ?? []), row])
      }
      const connections = new Map<string, Promise<BotConnectionRecord | null>>()
      const settled = await Promise.all([...byConnection.values()].map(async rows => {
        let count = 0
        for (const row of rows) {
          try {
            count += await dispatchRow(row, leaseCutoff, connections)
          } catch (error) {
            log.error('Bot update not dispatched', { update: row.id, connection: row.connection, error })
          }
        }
        return count
      }))

      return settled.reduce((sum, count) => sum + count, 0)
    }

    // ─── Receivers ───

    const keyOf = (record: BotConnectionRecord): string =>
      [record.updatedAt, record.transport, record.receive, record.identity?.id ?? ''].join('|')

    /** A fault no restart fixes (a revoked token, a refused configuration) — the plugin decides. */
    const fatalOf = (plugin: BotPlatformPlugin, error: unknown): boolean => {
      if (error instanceof BotCredentialsRejected) {
        return true
      }
      try {
        return plugin.fatal?.(error) === true
      } catch {
        return false
      }
    }

    /**
     * Record a receiver's fault on its connection (a system write: `updatedAt` stays). A recoverable
     * one is `lastError` and the next reconciliation restarts the receiver; a fatal one also marks the
     * connection `failed`, which reconciliation never starts — until a verify or a save changes it.
     * A connection changed since the receiver started is another bot: the fault is not its own.
     */
    const report = async (connection: string, error: unknown, key: string, fatal: boolean): Promise<void> => {
      try {
        const fresh = await store.connections().load(connection)
        const lastError = `receiver:${messageOf(error)}`
        if (fresh == null || !fresh.enabled
          || (fresh.receive !== BotReceiveMode.Poll && fresh.receive !== BotReceiveMode.Gateway)) {
          return
        }
        if (fatal) {
          if (fresh.status === BotConnectionStatus.Connected && keyOf(fresh) === key) {
            await store.connections().save({ ...fresh, status: BotConnectionStatus.Failed, lastError })
          }
          return
        }
        if (fresh.lastError !== lastError) {
          await store.connections().save({ ...fresh, lastError })
        }
      } catch (failure) {
        log.error('Bot receiver failure not recorded', { connection, error: failure })
      }
    }

    const startReceiver = (record: BotConnectionRecord): void => {
      const plugin = registry.get(record.platform)
      if (plugin?.receiver == null) {
        return
      }
      const id = record.id!
      const key = keyOf(record)
      const controller = new AbortController()
      let session
      try {
        session = sessions.session(record)
      } catch (error) {
        log.warn('Bot receiver not started', { connection: id, platform: record.platform, error })
        void report(id, error, key, false)
        return
      }
      log.info('Bot receiver started', {
        connection: id, platform: record.platform, transport: record.transport, receive: record.receive,
      })
      const done = plugin.receiver(session, async payload => { await inbox.accept(record, payload) }, controller.signal)
        .then(
          () => undefined,
          async error => {
            if (controller.signal.aborted) {
              return
            }
            const fatal = fatalOf(plugin, error)
            if (fatal) {
              log.warn('Bot receiver refused for good, connection failed', { connection: id, platform: record.platform, error })
            } else {
              log.warn('Bot receiver failed', { connection: id, platform: record.platform, error })
            }
            await report(id, error, key, fatal)
          }
        )
        .finally(() => {
          if (receivers.get(id)?.controller === controller) {
            receivers.delete(id)
          }
        })
      receivers.set(id, { key, controller, done })
    }

    /** Abort a receiver; the answer settles once it has let go of the platform. */
    const stopReceiver = (id: string): Promise<void> => {
      const receiver = receivers.get(id)
      if (receiver == null) {
        return Promise.resolve()
      }
      receiver.controller.abort()
      receivers.delete(id)
      log.info('Bot receiver stopped', { connection: id })

      return receiver.done
    }

    /** `startNew` is asked per start: the timer's pass starts nothing once `stop()` began. */
    const reconcile = async (startNew: () => boolean): Promise<void> => {
      const { items } = await store.connections().list({
        enabled: true, status: BotConnectionStatus.Connected, receive: [BotReceiveMode.Poll, BotReceiveMode.Gateway],
      } as Criteria<BotConnectionRecord>, { size: 0 })
      const wanted = new Map(items
        .filter(record => registry.get(record.platform)?.receiver != null)
        .map(record => [record.id!, record]))
      const stopping: Promise<void>[] = []
      for (const [id, receiver] of [...receivers]) {
        const record = wanted.get(id)
        if (record == null || keyOf(record) !== receiver.key) {
          stopping.push(stopReceiver(id))
        }
      }
      // A restarted receiver starts after its predecessor let go (Telegram refuses two pollers).
      await Promise.allSettled(stopping)
      for (const record of wanted.values()) {
        if (startNew() && !receivers.has(record.id!)) {
          startReceiver(record)
        }
      }
      if (options.retainMs > 0) {
        await store.updates().purge({
          status: BotInboxStatus.Done, processedAt: { $lt: sessions.stamp(-options.retainMs) },
        } as Criteria<BotUpdateRecord>)
      }
    }

    // ─── Loop ───

    const loop = (work: () => Promise<unknown>, everyMs: number, what: string): void => {
      const tick = async (): Promise<void> => {
        if (!running) {
          return
        }
        try {
          await track(work())
        } catch (error) {
          log.error(`Bot ${what} failed`, { error })
        }
        if (running) {
          const timer = setTimeout(() => {
            timers.delete(timer)
            void tick()
          }, everyMs)
          timers.add(timer)
        }
      }
      void tick()
    }

    const start = async (): Promise<void> => {
      if (running) {
        return
      }
      running = true
      log.info('Bot runtime started', { handlers: names }, { event: 'bot.runtime.started' })
      loop(async () => await reconcile(() => running), options.reconcileMs, 'reconcile')
      loop(dispatch, options.pollMs, 'dispatch')
    }

    const stop = async (): Promise<void> => {
      if (!running && receivers.size === 0 && inFlight.size === 0) {
        return
      }
      running = false
      timers.forEach(timer => clearTimeout(timer))
      timers.clear()
      // The pass in flight finishes first (it starts no receiver now), then every receiver lets go.
      await Promise.allSettled([...inFlight])
      await Promise.allSettled([...receivers.keys()].map(stopReceiver))
      log.info('Bot runtime stopped', {}, { event: 'bot.runtime.stopped' })
    }

    return {
      start,
      stop,
      get running() { return running },
      dispatch: async () => await track(dispatch()),
      reconcile: async () => await track(reconcile(() => true)),
    }
  }

  return { runtime }
}
