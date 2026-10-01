import type { CommitEvent, Unsubscribe } from '@owlmeans/planning'
import { advisoryKey, quoteIdent } from '@owlmeans/postgres-resource'
import { Client } from 'pg'
import type { ClientConfig, Notification, Pool } from 'pg'
import { BUS_BACKOFF, NOTIFY_PAYLOAD_MAX } from '../consts.js'
import type { SqlRunner } from '../sql.js'

/** A settled commit, without its record — the card is re-read where one is needed. */
export interface CommitFrame {
  p: string
  t: 'c'
  e: Omit<CommitEvent, 'record'>
}

/** A write of an organization's data-defined schemas. */
export interface SchemaFrame {
  p: string
  t: 's'
  e: string
}

export type BusFrame = CommitFrame | SchemaFrame

export interface PlanningBus {
  enabled: boolean
  /** NOTIFY a frame inside a transaction — delivered only if it commits. A no-op when disabled. */
  notify: (runner: SqlRunner, frame: Omit<CommitFrame, 'p'> | Omit<SchemaFrame, 'p'>) => Promise<void>
  onCommit: (listener: (event: CommitEvent) => void | Promise<void>) => Unsubscribe
  onSchema: (listener: (entityId: string) => void) => Unsubscribe
  /** Open the LISTEN connection if it is not open (lazily, on the first subscription or wait). */
  ensure: () => void
  connected: () => boolean
  close: () => Promise<void>
}

export interface PlanningBusOptions {
  enabled: boolean
  processId: string
  /** The qualified transition table — what the channel name is derived from. */
  table: () => Promise<string>
  /** The pool whose configuration the dedicated connection copies. */
  pool: () => Promise<Pool>
}

/**
 * The channel of one transition table: `planning_` and a short hash of its qualified name, so two
 * schemas in one database never hear each other.
 */
export const planningChannel = (qualified: string): string => {
  const [first, second] = advisoryKey(`planning-channel:${qualified}`)
  return `planning_${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

const payloadOf = (frame: BusFrame): string | null => {
  const text = JSON.stringify(frame)
  if (new TextEncoder().encode(text).length < NOTIFY_PAYLOAD_MAX) {
    return text
  }
  if (frame.t === 'c' && frame.e.error != null) {
    // The reason is in the row; a listener reads it with the status.
    const { error: _error, ...event } = frame.e
    return payloadOf({ ...frame, e: event })
  }
  return null
}

/**
 * The cross-process commit bus over LISTEN/NOTIFY.
 *
 * NOTIFY runs inside the transaction that settled the commit, so a frame is heard only if that
 * commit landed. LISTEN holds ONE dedicated connection — a `pg.Client` built from the pool's own
 * configuration, never a pooled one, so it takes no pool slot — opened on the first subscription
 * or wait. A dropped connection reconnects with backoff (1 s doubling to 30 s); meanwhile the commit
 * hub's poll ladder still answers every waiter. A process ignores its own frames (`p`): it delivered
 * them itself, after its commit.
 */
export const makePlanningBus = (opts: PlanningBusOptions): PlanningBus => {
  const commitListeners = new Set<(event: CommitEvent) => void | Promise<void>>()
  const schemaListeners = new Set<(entityId: string) => void>()
  let client: Client | undefined
  let connecting: Promise<void> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let backoff = BUS_BACKOFF[0]
  let closed = false
  let live = false
  let channel: string | undefined

  const channelOf = async (): Promise<string> => channel ??= planningChannel(await opts.table())

  const dispatch = (message: Notification): void => {
    if (message.channel !== channel || message.payload == null) {
      return
    }
    let frame: BusFrame
    try {
      frame = JSON.parse(message.payload) as BusFrame
    } catch {
      return
    }
    if (frame.p === opts.processId) {
      return
    }
    if (frame.t === 'c') {
      for (const listener of [...commitListeners]) {
        void Promise.resolve().then(() => listener(frame.e as CommitEvent))
          .catch(error => console.error('planning-postgres: commit listener failed:', error))
      }
      return
    }
    if (frame.t === 's') {
      for (const listener of [...schemaListeners]) {
        try {
          listener(frame.e)
        } catch (error) {
          console.error('planning-postgres: schema listener failed:', error)
        }
      }
    }
  }

  const lost = (target: Client, error?: unknown): void => {
    if (client !== target) {
      return
    }
    client = undefined
    live = false
    void target.end().catch(() => undefined)
    if (closed) {
      return
    }
    if (error != null) {
      console.warn('planning-postgres: commit bus connection lost, reconnecting:', error instanceof Error ? error.message : error)
    }
    retry = setTimeout(() => { retry = undefined; bus.ensure() }, backoff)
    backoff = Math.min(backoff * 2, BUS_BACKOFF[1])
  }

  const connect = async (): Promise<void> => {
    let pool: Pool
    let listen: string
    try {
      pool = await opts.pool()
      listen = await channelOf()
    } catch {
      // The store cannot reach its tables yet (its calls say why); ask again later.
      if (!closed) {
        retry = setTimeout(() => { retry = undefined; bus.ensure() }, backoff)
        backoff = Math.min(backoff * 2, BUS_BACKOFF[1])
      }
      return
    }
    // The pool's own client class and configuration (the password stays a non-enumerable property
    // of that object, so the object itself is handed over, never a copy).
    const Factory = (pool as unknown as { Client?: typeof Client }).Client ?? Client
    const target = new Factory(pool.options as ClientConfig)
    target.on('error', error => lost(target, error))
    target.on('end', () => lost(target))
    target.on('notification', dispatch)
    client = target
    try {
      await target.connect()
      await target.query(`LISTEN ${quoteIdent(listen)}`)
      live = true
      backoff = BUS_BACKOFF[0]
    } catch (error) {
      lost(target, error)
    }
  }

  const bus: PlanningBus = {
    enabled: opts.enabled,

    notify: async (runner, frame) => {
      if (!opts.enabled) {
        return
      }
      const payload = payloadOf({ ...frame, p: opts.processId } as BusFrame)
      if (payload != null) {
        await runner.query('SELECT pg_notify($1, $2)', [await channelOf(), payload])
      }
    },

    onCommit: listener => {
      commitListeners.add(listener)
      return () => { commitListeners.delete(listener) }
    },

    onSchema: listener => {
      schemaListeners.add(listener)
      return () => { schemaListeners.delete(listener) }
    },

    ensure: () => {
      if (!opts.enabled || closed || client != null || connecting != null || retry != null) {
        return
      }
      connecting = connect().finally(() => { connecting = undefined })
    },

    connected: () => live,

    close: async () => {
      closed = true
      if (retry != null) {
        clearTimeout(retry)
        retry = undefined
      }
      await connecting?.catch(() => undefined)
      const target = client
      client = undefined
      live = false
      await target?.end().catch(() => undefined)
    },
  }

  return bus
}
