import {
  BotConnectionNotFound, BotError, BotSignatureRejected, BotTransport, BotTransportMismatch, type BotPlatform,
  type BotSimulateInput, type BotSimulateResult,
} from '@owlmeans/bot'
import { BotInboxStatus } from '../consts.js'
import { BotConnectionDisabled } from '../errors.js'
import { botHookHelper } from '../platforms/hook.js'
import type { BotConnectionRecord, BotHookAnswer, BotHookRequest, BotUpdateRecord } from '../types.js'
import type { BotInbox, BotInboxEntry, BotServiceParts, BotSessions } from './types.local.js'

export const makeBotInbox = (parts: BotServiceParts, sessions: BotSessions): BotInbox => {
  const { store, registry, log } = parts

  /** One normalized update into the inbox, once: a redelivery answers the row it already has. */
  const storeOnce = async (row: Omit<BotUpdateRecord, 'id'>): Promise<BotInboxEntry> => {
    const updates = store.updates()
    const existing = await updates.load({ dedupe: row.dedupe })
    if (existing != null) {
      log.debug('Bot update redelivered', { connection: row.connection, update: existing.id })
      return { id: existing.id!, duplicate: true }
    }
    try {
      const created = await updates.create(row)
      log.debug('Bot update stored', { connection: row.connection, update: created.id, kind: row.update.kind })
      return { id: created.id!, duplicate: false }
    } catch (error) {
      // The unique dedupe key is the backstop of a concurrent delivery.
      const raced = await updates.load({ dedupe: row.dedupe })
      if (raced == null) {
        throw error
      }
      return { id: raced.id!, duplicate: true }
    }
  }

  /** Normalize a native payload and store each update once. */
  const intake = async (record: BotConnectionRecord, payload: unknown): Promise<BotInboxEntry[]> => {
    const plugin = registry.require(record.platform)
    const normalized = plugin.normalize(payload, sessions.view(record))
    const entries: BotInboxEntry[] = []
    for (const entry of normalized) {
      const receivedAt = sessions.stamp()
      entries.push(await storeOnce({
        scope: record.scope,
        connection: record.id!,
        platform: record.platform,
        dedupe: `${record.id}:${record.platform}:${entry.platformId}`,
        status: BotInboxStatus.Pending,
        attempts: 0,
        handled: [],
        update: {
          ...entry.update, connection: record.id!, scope: record.scope, platform: record.platform, receivedAt,
        },
        receivedAt,
      }))
    }

    return entries
  }

  const accept = async (record: BotConnectionRecord, payload: unknown): Promise<string[]> =>
    (await intake(record, payload)).map(entry => entry.id)

  const receive = async (platform: BotPlatform, connection: string, request: BotHookRequest): Promise<BotHookAnswer> => {
    const record = await store.connections().load(connection)
    const plugin = registry.get(platform)
    if (record == null || record.platform !== platform || plugin == null) {
      throw new BotConnectionNotFound(connection)
    }
    const authentication = await plugin.authenticate(request, sessions.open(record))
    if (authentication.result === 'reject') {
      log.debug('Bot hook refused', { connection, platform, reason: authentication.reason })
      throw new BotSignatureRejected(authentication.reason)
    }
    if (authentication.result === 'challenge') {
      log.debug('Bot hook handshake', { connection, platform })
      return {
        reply: authentication.reply ?? { ok: true },
        ...(authentication.text != null ? { text: authentication.text } : {}),
        updates: [],
      }
    }
    if (!record.enabled) {
      log.debug('Bot update of a disabled connection dropped', { connection, platform })
      return { reply: { ok: true }, updates: [] }
    }

    return { reply: { ok: true }, updates: await accept(record, botHookHelper.json(request)) }
  }

  const simulate = async (scope: string, connection: string, input: BotSimulateInput): Promise<BotSimulateResult> => {
    const record = await sessions.find(scope, connection)
    if (record.transport !== BotTransport.Mock) {
      throw new BotTransportMismatch(connection)
    }
    if (!record.enabled) {
      throw new BotConnectionDisabled(connection)
    }
    // The mock's native payload goes where a receiver's (or an authenticated hook's) goes: normalize →
    // inbox. No hook route is involved, so a gateway-only platform simulates like any other.
    const plugin = registry.require(record.platform)
    const inbound = plugin.mock.inbound(input, sessions.open(record))
    const [entry] = await intake(record, inbound.body)
    if (entry == null) {
      throw new BotError('simulate:nothing-received')
    }
    if (entry.duplicate) {
      // Never silent: the caller learns that nothing new will be dispatched.
      log.debug('Bot simulated update was already in the inbox', { connection, platform: record.platform, update: entry.id })
    }

    return { update: entry.id, duplicate: entry.duplicate }
  }

  return { receive, simulate, accept }
}
