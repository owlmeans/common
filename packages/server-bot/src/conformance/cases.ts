import { randomUUID } from 'node:crypto'
import {
  BotActionKind, BotChatKind, BotConnectionNotFound, BotConnectionStatus, BotPlatform, BotReceiveMode, BotTransport,
  BotUpdateKind, botTextHelper, type BotUpdate,
} from '@owlmeans/bot'
import type { Criteria } from '@owlmeans/resource'
import { BotInboxStatus } from '../consts.js'
import { botHandler } from '../handler.js'
import { telegramBotPlatform } from '../platforms/telegram/plugin.js'
import type { BotUpdateRecord } from '../types.js'
import { botAssertHelper } from './assert.js'
import type { BotConformanceCapability, BotConformanceCase, BotConformanceSubject } from './types.js'

const { check, same, rejects, eventually } = botAssertHelper

/** A fresh scope per case, so cases never see each other's rows on a shared database. */
const scopeOf = (): string => `conformance-${randomUUID()}`

/** A verified mock Telegram connection (no origin → it polls). */
const connect = async ({ service }: BotConformanceSubject, scope: string, label: string = 'Conformance bot') => {
  const saved = await service.connections.save(scope, { platform: BotPlatform.Telegram, label, transport: BotTransport.Mock })
  return await service.connections.verify(scope, saved.id)
}

const rowsOf = async ({ resources }: BotConformanceSubject, connection: string): Promise<BotUpdateRecord[]> =>
  (await resources.update.list({ connection } as Criteria<BotUpdateRecord>, { size: 0 })).items

const cases: BotConformanceCase[] = [
  {
    name: 'a connection round-trips: the store mints its id, absent fields stay absent, reads are scoped',
    run: async subject => {
      const { service, resources } = subject
      const scope = scopeOf()
      const saved = await service.connections.save(scope, {
        platform: BotPlatform.Telegram, label: 'Front desk', transport: BotTransport.Mock,
      })
      check(typeof saved.id === 'string' && saved.id !== '', 'the store minted an id')
      same([saved.scope, saved.label, saved.status, saved.enabled, saved.credentialsSet],
        [scope, 'Front desk', BotConnectionStatus.Pending, true, []], 'the saved connection')
      check(!('lastError' in saved) && !('identity' in saved), 'absent fields stay absent')

      const raw = await resources.connection.get(saved.id)
      check(raw.sealed == null, 'no credentials, nothing sealed')
      check(typeof raw.hookSecret === 'string' && raw.hookSecret.length >= 32, 'a hook secret is kept')
      check(!JSON.stringify(saved).includes(raw.hookSecret), 'the hook secret never reaches the view')

      same((await service.connections.list(scope)).map(connection => connection.id), [saved.id], 'listed in its scope')
      same(await service.connections.list(scopeOf()), [], 'another scope lists nothing')
      await rejects(service.connections.get(scopeOf(), saved.id), BotConnectionNotFound, 'another scope reads it as absent')
    },
  },

  {
    name: 'credentials are stored sealed, kept when omitted and cleared by an empty value',
    run: async ({ service, resources }) => {
      const scope = scopeOf()
      const token = `123456:${randomUUID()}`
      const saved = await service.connections.save(scope, {
        platform: BotPlatform.Telegram, label: 'Sealed', credentials: { token },
      })
      same(saved.credentialsSet, ['token'], 'the key is set')
      const raw = await resources.connection.get(saved.id)
      check(typeof raw.sealed === 'string' && raw.sealed.startsWith('v1.'), 'sealed in the v1 format')
      check(!raw.sealed!.includes(token) && !JSON.stringify(raw).includes(token), 'the token is nowhere in clear')

      const relabeled = await service.connections.save(scope, { id: saved.id, platform: BotPlatform.Telegram, label: 'Renamed' })
      same([relabeled.label, relabeled.credentialsSet], ['Renamed', ['token']], 'an omitted credential is kept')
      same((await resources.connection.get(saved.id)).sealed, raw.sealed, 'the sealed value is untouched')

      const cleared = await service.connections.save(scope, {
        id: saved.id, platform: BotPlatform.Telegram, label: 'Renamed', credentials: { token: '' },
      })
      same(cleared.credentialsSet, [], 'an empty value clears the key')
      check((await resources.connection.get(saved.id)).sealed == null, 'nothing sealed is left')
    },
  },

  {
    name: 'verification records the identity and the receive mode',
    run: async subject => {
      const scope = scopeOf()
      const verified = await connect(subject, scope)
      same([verified.status, verified.receive], [BotConnectionStatus.Connected, BotReceiveMode.Poll],
        'connected; no public hook URL, so it polls')
      check(verified.identity?.username?.startsWith('mock_') === true, 'the mock bot answered getMe')
      const raw = await subject.resources.connection.get(verified.id)
      same(raw.identity?.id, verified.identity?.id, 'the identity is stored as a nested value')
    },
  },

  {
    name: 'the inbox stores a redelivered update once',
    run: async subject => {
      const { service } = subject
      const scope = scopeOf()
      const connection = await connect(subject, scope)
      const raw = await subject.resources.connection.get(connection.id)
      const inbound = telegramBotPlatform.mock.inbound({ text: 'hello there' }, {
        ...connection, credentials: {}, hookSecret: raw.hookSecret,
      })
      const request = { method: 'POST', headers: inbound.headers, body: inbound.body, rawBody: inbound.rawBody }
      const first = await service.receive(BotPlatform.Telegram, connection.id, request)
      const again = await service.receive(BotPlatform.Telegram, connection.id, request)
      same(again.updates, first.updates, 'the redelivery answers the stored row')
      same((await rowsOf(subject, connection.id)).length, 1, 'one row')
      const [row] = await rowsOf(subject, connection.id)
      same([row.status, row.attempts, row.handled, row.update.message?.text], [BotInboxStatus.Pending, 0, [], 'hello there'],
        'a pending row with its normalized update')
    },
  },

  {
    name: 'the dispatcher settles an update and its actions are recorded with their ref, newest first',
    run: async subject => {
      const { service } = subject
      const scope = scopeOf()
      const connection = await connect(subject, scope)
      // The application's own keyword group — the handler reads and matches it, the service never does.
      const group = { id: `group-${randomUUID()}`, keywords: ['casino'] }
      const seen: BotUpdate[] = []
      const runtime = service.runtime([botHandler('moderate', async (update, bot) => {
        if (update.scope !== scope) {
          return
        }
        seen.push(update)
        if (botTextHelper.matched(update.message?.text ?? '', group.keywords).length > 0) {
          await bot.delete(update, { ref: group.id })
          await bot.reply(update, 'Removed: no casino links here.')
        }
      })])
      const { update } = await service.simulate(scope, connection.id, { text: 'Visit my CASINO now' })
      await runtime.dispatch()

      same(seen.map(entry => [entry.id, entry.message?.text]), [[update, 'Visit my CASINO now']],
        'the handler saw the stored update under its row id')
      const row = await subject.resources.update.get(update)
      same([row.status, row.attempts, row.handled], [BotInboxStatus.Done, 1, ['moderate']], 'settled done')
      check(typeof row.processedAt === 'string', 'processedAt is stamped')

      const activity = await service.activity.list(scope)
      same(activity.map(entry => [entry.action, entry.ok, entry.transport, entry.update, entry.ref]),
        [[BotActionKind.Reply, true, BotTransport.Mock, update, undefined], [BotActionKind.Delete, true, BotTransport.Mock, update, group.id]],
        'reply after delete, newest first; the ref round-trips')
      check(!('ref' in activity[0]), 'an absent ref stays absent')
      same((await service.activity.list(scope, { limit: 1 })).map(entry => entry.action), [BotActionKind.Reply], 'the limit')
      same((await service.activity.list(scope, { connection: 'another' })).length, 0, 'filtered by connection')
    },
  },

  {
    name: 'a failing handler is retried, then the update fails with its error',
    run: async subject => {
      const { service } = subject
      const scope = scopeOf()
      const connection = await connect(subject, scope)
      let calls = 0
      const runtime = service.runtime([botHandler('flaky', async update => {
        if (update.scope === scope) {
          calls++
          throw new Error('handler exploded')
        }
      })])
      const { update } = await service.simulate(scope, connection.id, { text: 'anything' })
      await eventually(async () => {
        await runtime.dispatch()
        return (await subject.resources.update.get(update)).status === BotInboxStatus.Failed
      }, 'the update failed')
      const row = await subject.resources.update.get(update)
      same([calls, row.attempts], [2, 2], 'tried `attempts` times')
      check(row.error?.includes('flaky: handler exploded') === true, 'the error names the handler')
    },
  },

  {
    name: 'an abandoned processing row is claimed again; old done rows are purged',
    run: async subject => {
      const { service, resources } = subject
      const scope = scopeOf()
      const connection = await connect(subject, scope)
      const { update } = await service.simulate(scope, connection.id, { text: 'left behind' })
      const row = await resources.update.get(update)
      const old = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString()
      await resources.update.save({ ...row, status: BotInboxStatus.Processing, attempts: 1, claimedAt: old })
      const runtime = service.runtime([botHandler('noop', async () => undefined)])
      await runtime.dispatch()
      same((await resources.update.get(update)).status, BotInboxStatus.Done, 'the stale claim was taken over')

      await resources.update.save({ ...(await resources.update.get(update)), processedAt: old })
      const { update: fresh } = await service.simulate(scope, connection.id, { text: 'kept' })
      await runtime.dispatch()
      await runtime.reconcile()
      await runtime.stop()
      check(await resources.update.load(update) == null, 'a done row past retention is purged')
      check(await resources.update.load(fresh) != null, 'a recent one is kept')
    },
  },

  {
    name: 'removing a connection removes its inbox and keeps its activity',
    run: async subject => {
      const { service, resources } = subject
      const scope = scopeOf()
      const connection = await connect(subject, scope)
      await service.simulate(scope, connection.id, { text: 'x' })
      const bot = await service.actions({ scope, connection: connection.id })
      await bot.send('-1001000000001', 'Announcement')

      same(await service.connections.remove(scope, connection.id), { id: connection.id }, 'removed')
      check(await resources.connection.load(connection.id) == null, 'the record is gone')
      same((await rowsOf(subject, connection.id)).length, 0, 'its inbox is purged')
      same((await service.activity.list(scope)).length, 1, 'its activity is kept')
    },
  },

  {
    name: 'the store refuses a second inbox row with the same dedupe key',
    needs: ['unique'],
    run: async ({ resources }) => {
      const scope = scopeOf()
      const stamp = new Date().toISOString()
      const row: Omit<BotUpdateRecord, 'id'> = {
        scope, connection: `c-${randomUUID()}`, platform: BotPlatform.Telegram, dedupe: `dedupe-${randomUUID()}`,
        status: BotInboxStatus.Pending, attempts: 0, handled: [], receivedAt: stamp,
        update: {
          connection: 'c', scope, platform: BotPlatform.Telegram, kind: BotUpdateKind.Message,
          chat: { id: '1', kind: BotChatKind.Group }, addressed: false, receivedAt: stamp,
        },
      }
      await resources.update.create(row)
      let refused = false
      try {
        await resources.update.create({ ...row })
      } catch {
        refused = true
      }
      check(refused, 'the second create is refused')
    },
  },
]

/** Every conformance case, in order. */
export const botConformance: readonly BotConformanceCase[] = Object.freeze(cases)

/** The cases a store qualifies for, given what it guarantees. */
export const botConformanceCasesFor = (capabilities: readonly BotConformanceCapability[] = []): BotConformanceCase[] =>
  botConformance.filter(entry => (entry.needs ?? []).every(need => capabilities.includes(need)))
