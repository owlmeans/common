import { BOT_PLATFORMS, BotConnectionNotFound, BotTransport, type BotConnection } from '@owlmeans/bot'
import { botCryptoHelper } from '../helpers/crypto.js'
import type { BotSealer } from '../helpers/crypto/types.js'
import { BotSecretMissing } from '../errors.js'
import type { BotPlatformConnection, BotPlatformSession } from '../platforms/types.js'
import type { BotConnectionRecord } from '../types.js'
import type { BotServiceParts, BotSessions } from './types.local.js'

export const makeBotSessions = (parts: BotServiceParts): BotSessions => {
  const { store, registry, options, log } = parts
  let warnedSecret = false

  const stamp = (offsetMs: number = 0): string => new Date(parts.now().getTime() + offsetMs).toISOString()

  const sealer = (): BotSealer | null => {
    const secret = options.secret()
    return secret == null || secret === '' ? null : botCryptoHelper.sealerOf(secret)
  }

  const requireSealer = (): BotSealer => {
    const found = sealer()
    if (found == null) {
      throw new BotSecretMissing()
    }

    return found
  }

  const generatedOf = (record: BotConnectionRecord): string[] =>
    (BOT_PLATFORMS[record.platform]?.credentials ?? []).filter(field => field.generated === true).map(field => field.key)

  const view = (record: BotConnectionRecord, lastEventAt?: string): BotConnection => {
    const identity = record.identity != null
      ? {
        id: record.identity.id,
        ...(record.identity.username != null ? { username: record.identity.username } : {}),
        ...(record.identity.name != null ? { name: record.identity.name } : {}),
      }
      : undefined

    return {
      id: record.id!,
      scope: record.scope,
      platform: record.platform,
      label: record.label,
      transport: record.transport,
      status: record.status,
      enabled: record.enabled,
      receive: record.receive,
      ...(identity != null ? { identity } : {}),
      ...(record.hookUrl != null ? { hookUrl: record.hookUrl } : {}),
      ...(record.setup != null && record.setup.length > 0 ? { setup: [...record.setup] } : {}),
      credentialsSet: [...new Set([...(record.credentialsSet ?? []), ...generatedOf(record)])].sort(),
      ...(record.lastError != null && record.lastError !== '' ? { lastError: record.lastError } : {}),
      ...(lastEventAt != null ? { lastEventAt } : {}),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  }

  const open = (record: BotConnectionRecord, strict: boolean = false): BotPlatformConnection => {
    let credentials: Record<string, string> = {}
    if (record.sealed != null && record.sealed !== '') {
      const found = sealer()
      if (found == null) {
        if (strict) {
          throw new BotSecretMissing()
        }
        if (!warnedSecret) {
          warnedSecret = true
          log.warn('Bot credentials cannot be opened: no secret', { connection: record.id })
        }
      } else {
        try {
          credentials = found.open(record.sealed, record.scope)
        } catch (error) {
          if (strict) {
            throw error
          }
          log.warn('Bot credentials cannot be opened', { connection: record.id, error })
        }
      }
    }
    for (const key of generatedOf(record)) {
      if ((credentials[key] ?? '') === '') {
        credentials[key] = record.hookSecret
      }
    }

    return { ...view(record), credentials, hookSecret: record.hookSecret }
  }

  const session = (record: BotConnectionRecord): BotPlatformSession => {
    const plugin = registry.require(record.platform)
    const connection = open(record, true)

    return {
      connection,
      transport: record.transport,
      fetch: record.transport === BotTransport.Mock ? plugin.mock.fetch(connection) : options.fetch(),
    }
  }

  const find = async (scope: string, id: string): Promise<BotConnectionRecord> => {
    const record = await store.connections().load(id)
    if (record == null || record.scope !== scope) {
      throw new BotConnectionNotFound(id)
    }

    return record
  }

  const lastEventOf = async (connection: string): Promise<string | undefined> => {
    const newest = await store.updates().load({ connection }, { sort: [{ field: 'receivedAt', order: 'desc' }] })
    return newest?.receivedAt ?? undefined
  }

  return { sealer, requireSealer, view, open, session, find, lastEventOf, stamp }
}
