import {
  BotConnectionStatus, BotCredentialsRejected, BotReceiveMode, BotTransport, BotUnsupportedAction,
  type BotConnection, type BotConnectionInput,
} from '@owlmeans/bot'
import { BotConnectionDisabled } from '../errors.js'
import { botCryptoHelper } from '../helpers/crypto.js'
import { botOriginHelper } from '../helpers/origin.js'
import type { BotPlatformIdentity, BotPlatformPlugin } from '../platforms/types.js'
import type { BotConnectionRecord, BotConnectionsApi } from '../types.js'
import type { BotServiceParts, BotSessions } from './types.local.js'
import { messageOf } from '../utils/message.js'

export const makeBotConnections = (parts: BotServiceParts, sessions: BotSessions): BotConnectionsApi => {
  const { store, registry, options, log } = parts

  /** A system write: never moves `updatedAt`, which marks the owner's changes (and restarts receivers). */
  const persist = async (record: BotConnectionRecord): Promise<BotConnectionRecord> =>
    await store.connections().save({ ...record })

  const setupOf = (plugin: BotPlatformPlugin, record: BotConnectionRecord): string[] | null => {
    const steps = plugin.setup?.(sessions.open(record)) ?? []
    return steps.length > 0 ? steps : null
  }

  const withLastEvent = async (record: BotConnectionRecord): Promise<BotConnection> =>
    sessions.view(record, await sessions.lastEventOf(record.id!))

  /** Unregister a hook the platform still points at — best effort: the connection goes on either way. */
  const dropHook = async (plugin: BotPlatformPlugin, record: BotConnectionRecord): Promise<boolean> => {
    if (record.hookRegistered !== true || plugin.unregisterHook == null) {
      return record.hookRegistered === true
    }
    try {
      await plugin.unregisterHook(sessions.session(record))
      return false
    } catch (error) {
      log.warn('Bot hook not unregistered', { connection: record.id, platform: record.platform, error })
      return true
    }
  }

  const list = async (scope: string): Promise<BotConnection[]> => {
    const { items } = await store.connections().list({ scope }, { sort: [{ field: 'createdAt', order: 'asc' }], size: 0 })
    return await Promise.all(items.map(withLastEvent))
  }

  const get = async (scope: string, id: string): Promise<BotConnection> => await withLastEvent(await sessions.find(scope, id))

  const save = async (scope: string, input: BotConnectionInput, origin?: string): Promise<BotConnection> => {
    const plugin = registry.require(input.platform)
    const existing = input.id != null ? await sessions.find(scope, input.id) : null
    if (existing != null && existing.platform !== input.platform) {
      throw new BotUnsupportedAction(`platform-change:${existing.platform}`)
    }
    const fields = plugin.descriptor.credentials
    const changes = Object.entries(input.credentials ?? {})
    for (const [key] of changes) {
      const field = fields.find(candidate => candidate.key === key)
      if (field == null) {
        throw new BotCredentialsRejected(`unknown-key:${key}`)
      }
    }

    let sealed = existing?.sealed ?? null
    let credentialsSet = existing?.credentialsSet ?? []
    // A write, or the clearing of a key that holds a value — clearing what is not there changes nothing.
    const effective = changes.filter(([key, value]) => value !== '' || credentialsSet.includes(key))
    if (effective.length > 0) {
      const sealer = sessions.requireSealer()
      let current: Record<string, string> = {}
      if (sealed != null && sealed !== '') {
        try {
          current = sealer.open(sealed, scope)
        } catch (error) {
          // Sealed under another secret: what is stored cannot be kept, what is written replaces it.
          log.warn('Bot credentials unreadable, replaced', { connection: existing?.id, error })
        }
      }
      for (const [key, value] of effective) {
        if (value === '') {
          delete current[key]
        } else {
          current[key] = value
        }
      }
      credentialsSet = Object.keys(current).filter(key => current[key] !== '').sort()
      sealed = credentialsSet.length > 0 ? sealer.seal(current, scope) : null
    }

    const stamp = sessions.stamp()
    const transport = input.transport ?? existing?.transport ?? BotTransport.Live
    const enabled = input.enabled ?? existing?.enabled ?? true
    const reset = existing == null || effective.length > 0 || transport !== existing.transport
      || existing.status === BotConnectionStatus.Disabled
    const status = !enabled
      ? BotConnectionStatus.Disabled
      : reset ? BotConnectionStatus.Pending : existing!.status

    const rebound = existing != null && (effective.length > 0 || transport !== existing.transport)
    let record: BotConnectionRecord = {
      ...(existing ?? {}),
      // Another bot (or transport) until verified: the old identity and its error no longer describe it.
      ...(rebound ? { identity: null, lastError: null } : {}),
      scope,
      platform: input.platform,
      label: input.label,
      transport,
      status,
      enabled,
      receive: existing?.receive ?? plugin.descriptor.receive[0] ?? BotReceiveMode.Webhook,
      credentialsSet,
      sealed,
      hookSecret: existing?.hookSecret ?? botCryptoHelper.randomSecret(),
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
    }
    // The platform stops posting to a hook its bot no longer serves: off, another bot, another transport.
    if (existing?.hookRegistered === true && (!enabled || rebound)) {
      record.hookRegistered = await dropHook(plugin, existing)
    }
    if (existing == null) {
      record = await store.connections().create(record)
    }
    const hookUrl = origin != null ? options.hookUrl(origin, record.platform, record.id!) : record.hookUrl ?? null
    record = { ...record, hookUrl }
    record = await persist({ ...record, setup: setupOf(plugin, record) })
    log.debug('Bot connection saved', { connection: record.id, platform: record.platform, status: record.status })

    return await withLastEvent(record)
  }

  const verify = async (scope: string, id: string, origin?: string): Promise<BotConnection> => {
    const found = await sessions.find(scope, id)
    const plugin = registry.require(found.platform)
    if (!found.enabled) {
      throw new BotConnectionDisabled(id)
    }
    const hookUrl = origin != null ? options.hookUrl(origin, found.platform, id) : found.hookUrl ?? null
    let record: BotConnectionRecord = { ...found, hookUrl }

    const fail = async (error: unknown): Promise<never> => {
      await persist({ ...record, status: BotConnectionStatus.Failed, lastError: messageOf(error) })
      log.info('Bot connection refused', { connection: id, platform: record.platform, error: messageOf(error) })
      throw error
    }

    let identity: BotPlatformIdentity
    try {
      if (record.transport === BotTransport.Live) {
        const set = new Set(sessions.view(record).credentialsSet)
        const missing = plugin.descriptor.credentials.filter(field => field.required && !set.has(field.key))
        if (missing.length > 0) {
          throw new BotCredentialsRejected(`missing:${missing.map(field => field.key).join(',')}`)
        }
      }
      identity = await plugin.verify(sessions.session(record))
    } catch (error) {
      return await fail(error)
    }
    record = { ...record, identity }

    const descriptor = plugin.descriptor
    let receive: BotReceiveMode | null = null
    let hookRegistered = record.hookRegistered === true
    let lastError: string | null = null
    const autoHook = descriptor.setup === 'auto' && descriptor.receive.includes(BotReceiveMode.Webhook)
      && plugin.registerHook != null
    if (autoHook && hookUrl != null && botOriginHelper.isPublicHttps(hookUrl)
      && (plugin.acceptsHookUrl?.(hookUrl) ?? true)) {
      try {
        await plugin.registerHook!(sessions.session(record), hookUrl)
        receive = BotReceiveMode.Webhook
        hookRegistered = true
      } catch (error) {
        lastError = `hook:${messageOf(error)}`
        log.warn('Bot hook not registered', { connection: id, platform: record.platform, error })
      }
    }
    if (receive == null) {
      if (descriptor.receive.includes(BotReceiveMode.Poll)) {
        receive = BotReceiveMode.Poll
        hookRegistered = await dropHook(plugin, { ...record, hookRegistered })
      } else if (descriptor.receive.includes(BotReceiveMode.Gateway)) {
        receive = BotReceiveMode.Gateway
      } else {
        receive = BotReceiveMode.Webhook
      }
    }

    record = await persist({
      ...record, status: BotConnectionStatus.Connected, receive, hookRegistered, lastError,
      setup: setupOf(plugin, record),
    })
    log.info('Bot connection verified', {
      connection: id, platform: record.platform, transport: record.transport, receive,
    }, { event: 'bot.connection.verified' })

    return await withLastEvent(record)
  }

  const remove = async (scope: string, id: string): Promise<{ id: string }> => {
    const record = await sessions.find(scope, id)
    const plugin = registry.get(record.platform)
    if (plugin != null) {
      await dropHook(plugin, record)
    }
    await store.connections().delete(id)
    await store.updates().purge({ connection: id })
    log.info('Bot connection removed', { connection: id, platform: record.platform }, { event: 'bot.connection.removed' })

    return { id }
  }

  return { list, get, save, verify, remove }
}
