import {
  BotActionKind, BotChatKind, BotCredentialsRejected, BotError, BotErrorPlatform, BotUpdateKind, botCommandHelper,
  type BotChatRef, type BotConnection, type BotMessageRef, type BotPlatformDescriptor, type BotSenderRef,
} from '@owlmeans/bot'
import { botHookHelper } from '../platforms/hook.js'
import type {
  BotAuthentication, BotNormalizedUpdate, BotPlatformAction, BotPlatformActionResult, BotPlatformConnection,
  BotPlatformIdentity, BotPlatformPlugin, BotPlatformSession, BotReceiverEmit,
} from '../platforms/types.js'
import { makeBotTestApi } from './platform/api.js'
import {
  BOT_TEST_ACTIONS, BOT_TEST_AUTO_STEPS, BOT_TEST_CREDENTIALS, BOT_TEST_FATAL_CODES, BOT_TEST_PLATFORM,
  BOT_TEST_RECEIVE, BOT_TEST_SECRET_HEADER,
} from './platform/consts.js'
import { makeBotTestFake } from './platform/fake.js'
import type { BotTestMessage, BotTestPayload, BotTestPlatformOptions } from './platform/types.js'

/**
 * A complete platform plugin over an invented chat API, configurable to every shape a real plugin
 * takes — an auto webhook with a poll fallback (the default), poll or gateway only, manual setup
 * with a generated credential, an optional credential that `enables` an action, actions taken only
 * inside a server. Its mock answers the same API in memory. The generic suites, the conformance kit
 * and an application's tests register it; production never does.
 */
export const makeTestBotPlatform = (opts: BotTestPlatformOptions = {}): BotPlatformPlugin => {
  const platform = opts.platform ?? BOT_TEST_PLATFORM
  const base = (opts.base ?? `https://bot.invalid/${platform}`).replace(/\/+$/, '')
  const mock = makeBotTestFake()
  const descriptor: BotPlatformDescriptor = Object.freeze({
    platform,
    title: opts.title ?? 'Test',
    glyph: opts.glyph ?? 'chat',
    credentials: [...(opts.credentials ?? BOT_TEST_CREDENTIALS)],
    receive: [...(opts.receive ?? BOT_TEST_RECEIVE)],
    actions: [...(opts.actions ?? BOT_TEST_ACTIONS)],
    setup: opts.setup ?? 'auto',
    docs: 'https://bot.invalid/docs',
    hint: opts.hint ?? { en: 'Add the bot to the chat it serves.' },
    ...(opts.link != null ? { link: opts.link } : {}),
  })
  const spaceActions = opts.spaceActions ?? []
  const api = (session: BotPlatformSession) => makeBotTestApi(session, base, platform)

  /** The credential an action authorizes with: the optional one that enables it, when it is set. */
  const credentialOf = (session: BotPlatformSession, kind: BotActionKind): string | undefined =>
    descriptor.credentials.find(field => field.enables?.includes(kind) === true
      && (session.connection.credentials[field.key] ?? '') !== '')?.key
    ?? descriptor.credentials.find(field => field.required && field.generated !== true)?.key

  const refused = (error: unknown): boolean => error instanceof BotErrorPlatform
    && BOT_TEST_FATAL_CODES.includes(Number(/^(\d+):/.exec(error.detail)?.[1]))

  const verify = async (session: BotPlatformSession): Promise<BotPlatformIdentity> => {
    try {
      return await api(session).call<BotPlatformIdentity>('me')
    } catch (error) {
      if (refused(error)) {
        throw new BotCredentialsRejected(`${platform}:${(error as BotErrorPlatform).detail}`)
      }
      throw error
    }
  }

  /** The value a GET handshake must echo: the first generated credential, else the hook secret. */
  const verifyTokenOf = (connection: BotPlatformConnection): string => {
    const generated = descriptor.credentials.find(field => field.generated === true)

    return generated != null ? connection.credentials[generated.key] ?? connection.hookSecret : connection.hookSecret
  }

  const authenticate: BotPlatformPlugin['authenticate'] = (request, connection): BotAuthentication => {
    const method = request.method.toUpperCase()
    if (method === 'GET') {
      const query = request.query ?? {}
      return query.mode === 'subscribe' && botHookHelper.sameSecret(`${query.token ?? ''}`, verifyTokenOf(connection))
        ? { result: 'challenge', text: `${query.challenge ?? ''}` }
        : { result: 'reject', reason: 'verify-token' }
    }
    if (method !== 'POST') {
      return { result: 'reject', reason: 'method' }
    }

    return botHookHelper.sameSecret(botHookHelper.header(request, BOT_TEST_SECRET_HEADER), connection.hookSecret)
      ? { result: 'ok' }
      : { result: 'reject', reason: 'secret' }
  }

  const kindOf = (kind: string): BotChatKind => Object.values(BotChatKind).includes(kind as BotChatKind)
    ? kind as BotChatKind
    : BotChatKind.Group

  const senderOf = (from: NonNullable<BotTestMessage['from']>): BotSenderRef => ({
    id: from.id,
    ...(from.name != null ? { name: from.name } : {}),
    ...(from.username != null ? { username: from.username } : {}),
    ...(from.bot != null ? { bot: from.bot } : {}),
  })

  const normalize = (payload: unknown, connection: BotConnection): BotNormalizedUpdate[] => {
    const message = (payload as BotTestPayload | null)?.message
    if (message == null || typeof message.text !== 'string') {
      return []
    }
    const username = connection.identity?.username
    const chat: BotChatRef = {
      id: message.chat.id,
      kind: kindOf(message.chat.kind),
      ...(message.chat.title != null ? { title: message.chat.title } : {}),
      ...(message.chat.thread != null ? { thread: message.chat.thread } : {}),
      ...(message.chat.space != null ? { space: message.chat.space } : {}),
    }
    const ref: BotMessageRef = {
      chat: chat.id, id: message.id,
      ...(chat.thread != null ? { thread: chat.thread } : {}), ...(chat.space != null ? { space: chat.space } : {}),
    }
    const command = botCommandHelper.parse(message.text, username) ?? undefined
    const mentioned = username != null && message.text.toLowerCase().includes(`@${username.toLowerCase()}`)
    const repliedTo = message.replyTo?.from != null && message.replyTo.from.id === connection.identity?.id

    return [{
      platformId: `${(payload as BotTestPayload).id}`,
      update: {
        kind: message.edited === true ? BotUpdateKind.Edited : command != null ? BotUpdateKind.Command : BotUpdateKind.Message,
        chat,
        ...(message.from != null ? { sender: senderOf(message.from) } : {}),
        message: {
          ref,
          text: message.text,
          date: message.date,
          ...(message.replyTo != null
            ? {
              replyTo: {
                chat: chat.id, id: message.replyTo.id,
                ...(message.replyTo.text != null ? { text: message.replyTo.text } : {}),
                ...(message.replyTo.from != null ? { sender: senderOf(message.replyTo.from) } : {}),
              },
            }
            : {}),
        },
        ...(command != null ? { command } : {}),
        addressed: chat.kind === BotChatKind.Private || mentioned || repliedTo || command != null,
      },
    }]
  }

  const setup = (connection: BotPlatformConnection): string[] => {
    if (descriptor.setup === 'auto') {
      return [...BOT_TEST_AUTO_STEPS]
    }
    const generated = descriptor.credentials.filter(field => field.generated === true)
      .map(field => `${field.label.en ?? field.key}: ${connection.credentials[field.key] ?? connection.hookSecret}`)

    return [...(connection.hookUrl != null ? [`Callback URL: ${connection.hookUrl}`] : []), ...generated]
  }

  /** Drops any hook first (the API refuses to poll while one is set), then polls until aborted. */
  const receiver = async (session: BotPlatformSession, emit: BotReceiverEmit, signal: AbortSignal): Promise<void> => {
    const client = api(session)
    try {
      await client.call<boolean>('deleteHook', {}, { signal })
      let offset: number | undefined
      while (!signal.aborted) {
        const updates = await client.call<BotTestPayload[]>('updates', offset != null ? { offset } : {}, { signal })
        for (const update of updates) {
          await emit(update)
          offset = update.id + 1
        }
      }
    } catch (error) {
      if (signal.aborted) {
        return
      }
      throw error
    }
  }

  const needsSpace = (kind: BotActionKind, space: string | undefined): void => {
    if (spaceActions.includes(kind) && (space ?? '') === '') {
      throw new BotError(`invalid-action:no-space:${kind}`)
    }
  }

  const act = async (session: BotPlatformSession, action: BotPlatformAction): Promise<BotPlatformActionResult> => {
    const client = api(session)
    const as = { credential: credentialOf(session, action.kind) }
    switch (action.kind) {
      case BotActionKind.Reply: {
        needsSpace(action.kind, action.to.space)
        const sent = await client.call<{ id: string }>('sendMessage', {
          chat: action.to.chat, text: action.text, replyTo: action.to.id,
          ...(action.to.thread != null ? { thread: action.to.thread } : {}),
        }, as)
        return { message: { chat: action.to.chat, id: sent.id, ...(action.to.thread != null ? { thread: action.to.thread } : {}) } }
      }
      case BotActionKind.Send: {
        needsSpace(action.kind, action.chat.space)
        const sent = await client.call<{ id: string }>('sendMessage', {
          chat: action.chat.id, text: action.text, ...(action.chat.thread != null ? { thread: action.chat.thread } : {}),
        }, as)
        return { message: { chat: action.chat.id, id: sent.id, ...(action.chat.thread != null ? { thread: action.chat.thread } : {}) } }
      }
      case BotActionKind.Delete:
        needsSpace(action.kind, action.message.space)
        await client.call('deleteMessage', { chat: action.message.chat, id: action.message.id }, as)
        return {}
      case BotActionKind.Mute:
        needsSpace(action.kind, action.space)
        await client.call('muteMember', {
          chat: action.chat, user: action.user, until: action.until.toISOString(),
          ...(action.space != null ? { space: action.space } : {}),
        }, as)
        return {}
      case BotActionKind.Ban:
        needsSpace(action.kind, action.space)
        await client.call('banMember', {
          chat: action.chat, user: action.user, ...(action.space != null ? { space: action.space } : {}),
        }, as)
        return {}
      case BotActionKind.React:
        needsSpace(action.kind, action.message.space)
        await client.call('react', { chat: action.message.chat, id: action.message.id, emoji: action.emoji }, as)
        return {}
    }
  }

  return {
    platform,
    descriptor,
    verify,
    registerHook: async (session, url) => {
      await api(session).call('setHook', { url, secret: session.connection.hookSecret })
    },
    unregisterHook: async session => {
      await api(session).call('deleteHook', {})
    },
    setup,
    authenticate,
    normalize,
    receiver,
    fatal: refused,
    act,
    mock,
  }
}
