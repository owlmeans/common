import {
  BOT_PLATFORMS, BotActionKind, BotCredentialsRejected, BotPlatform, BotTransport, type BotMessageRef,
} from '@owlmeans/bot'
import { botHookHelper } from '../hook.js'
import type {
  BotAuthentication, BotPlatformAction, BotPlatformActionResult, BotPlatformIdentity, BotPlatformPlugin,
  BotPlatformSession, BotReceiverEmit,
} from '../types.js'
import { makeTelegramApi } from './api.js'
import {
  TELEGRAM_ALLOWED_UPDATES, TELEGRAM_API_BASE, TELEGRAM_CALL_TIMEOUT_MS, TELEGRAM_FATAL_CODES, TELEGRAM_HOOK_PORTS,
  TELEGRAM_MUTED_PERMISSIONS, TELEGRAM_POLL_TIMEOUT_S, TELEGRAM_SECRET_HEADER, TELEGRAM_SETUP_STEPS,
  TELEGRAM_TEXT_MAX,
} from './consts.js'
import { TelegramApiError } from './errors.js'
import { makeTelegramMock } from './mock.js'
import { telegramNormalizer } from './normalize.js'
import type { TelegramBotPlatformOptions, TelegramMessage, TelegramUpdate, TelegramUser } from './types.js'

/**
 * The Telegram plugin over the Bot API (https://core.telegram.org/bots/api): `getMe` verifies,
 * `setWebhook` with a `secret_token` registers the hook, `getUpdates` long-polls when the connection
 * has no public HTTPS hook, and the moderation calls act. Ids travel as text and go back as numbers.
 */
export const makeTelegramBotPlatform = (opts: TelegramBotPlatformOptions = {}): BotPlatformPlugin => {
  const base = (opts.base ?? TELEGRAM_API_BASE).replace(/\/+$/, '')
  const mock = makeTelegramMock()
  const api = (session: BotPlatformSession) => makeTelegramApi(session, base)

  /** A chat id: Telegram's integer when it is one (≤ 52 bits), else as given (`@channel`). */
  const chatId = (value: string): number | string => /^-?\d{1,16}$/.test(value) ? Number(value) : value

  /** Clipped to the text limit without splitting a surrogate pair. */
  const clip = (text: string): string => {
    if (text.length <= TELEGRAM_TEXT_MAX) {
      return text
    }
    const cut = text.slice(0, TELEGRAM_TEXT_MAX - 1)

    return `${/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut}…`
  }

  const threadParam = (thread?: string): { message_thread_id?: number } =>
    thread != null && /^\d+$/.test(thread) ? { message_thread_id: Number(thread) } : {}

  /** 401 / 404 on a Bot API call is the token itself — revoked, or a bot that no longer exists. */
  const fatal = (error: unknown): boolean =>
    error instanceof TelegramApiError && TELEGRAM_FATAL_CODES.includes(error.code)

  const verify = async (session: BotPlatformSession): Promise<BotPlatformIdentity> => {
    if (session.transport === BotTransport.Live && (session.connection.credentials.token ?? '') === '') {
      throw new BotCredentialsRejected('missing:token')
    }
    let me: TelegramUser
    try {
      me = await api(session).call<TelegramUser>('getMe')
    } catch (error) {
      if (error instanceof TelegramApiError && fatal(error)) {
        throw new BotCredentialsRejected(`telegram:${error.code}`)
      }
      throw error
    }
    const name = [me.first_name, me.last_name].filter(part => part != null && part !== '').join(' ')

    return { id: `${me.id}`, ...(me.username != null ? { username: me.username } : {}), ...(name !== '' ? { name } : {}) }
  }

  const registerHook = async (session: BotPlatformSession, url: string): Promise<void> => {
    await api(session).call<boolean>('setWebhook', {
      url, secret_token: session.connection.hookSecret, allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
    })
  }

  const unregisterHook = async (session: BotPlatformSession): Promise<void> => {
    await api(session).call<boolean>('deleteWebhook', {})
  }

  const acceptsHookUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'https:' && TELEGRAM_HOOK_PORTS.includes(parsed.port === '' ? 443 : Number(parsed.port))
    } catch {
      return false
    }
  }

  const authenticate: BotPlatformPlugin['authenticate'] = (request, connection): BotAuthentication => {
    if (request.method.toUpperCase() !== 'POST') {
      return { result: 'reject', reason: 'method' }
    }

    return botHookHelper.sameSecret(botHookHelper.header(request, TELEGRAM_SECRET_HEADER), connection.hookSecret)
      ? { result: 'ok' }
      : { result: 'reject', reason: 'secret-token' }
  }

  /** `deleteWebhook` first (`getUpdates` refuses while one is set), then long polling until aborted. */
  const receiver = async (session: BotPlatformSession, emit: BotReceiverEmit, signal: AbortSignal): Promise<void> => {
    const client = api(session)
    try {
      await client.call<boolean>('deleteWebhook', {}, { signal })
      let offset: number | undefined
      while (!signal.aborted) {
        const updates = await client.call<TelegramUpdate[]>('getUpdates', {
          ...(offset != null ? { offset } : {}),
          timeout: TELEGRAM_POLL_TIMEOUT_S,
          allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
        }, { signal, timeoutMs: TELEGRAM_POLL_TIMEOUT_S * 1000 + TELEGRAM_CALL_TIMEOUT_MS })
        for (const update of updates) {
          // Stored before it is confirmed: the next call's offset confirms it.
          await emit(update)
          offset = update.update_id + 1
        }
      }
    } catch (error) {
      if (signal.aborted) {
        return
      }
      throw error
    }
  }

  const refOf = (message: TelegramMessage, thread?: string): BotMessageRef => ({
    chat: `${message.chat.id}`, id: `${message.message_id}`, ...(thread != null ? { thread } : {}),
  })

  const act = async (session: BotPlatformSession, action: BotPlatformAction): Promise<BotPlatformActionResult> => {
    const client = api(session)
    switch (action.kind) {
      case BotActionKind.Reply: {
        const sent = await client.call<TelegramMessage>('sendMessage', {
          chat_id: chatId(action.to.chat),
          text: clip(action.text),
          ...threadParam(action.to.thread),
          reply_parameters: { message_id: Number(action.to.id), allow_sending_without_reply: true },
        })
        return { message: refOf(sent, action.to.thread) }
      }
      case BotActionKind.Send: {
        const sent = await client.call<TelegramMessage>('sendMessage', {
          chat_id: chatId(action.chat.id), text: clip(action.text), ...threadParam(action.chat.thread),
        })
        return { message: refOf(sent, action.chat.thread) }
      }
      case BotActionKind.Delete:
        await client.call<boolean>('deleteMessage', {
          chat_id: chatId(action.message.chat), message_id: Number(action.message.id),
        })
        return {}
      case BotActionKind.Mute:
        await client.call<boolean>('restrictChatMember', {
          chat_id: chatId(action.chat),
          user_id: Number(action.user),
          permissions: TELEGRAM_MUTED_PERMISSIONS,
          use_independent_chat_permissions: true,
          until_date: Math.floor(action.until.getTime() / 1000),
        })
        return {}
      case BotActionKind.Ban:
        await client.call<boolean>('banChatMember', { chat_id: chatId(action.chat), user_id: Number(action.user) })
        return {}
      case BotActionKind.React:
        await client.call<boolean>('setMessageReaction', {
          chat_id: chatId(action.message.chat),
          message_id: Number(action.message.id),
          reaction: [{ type: 'emoji', emoji: action.emoji }],
        })
        return {}
    }
  }

  return {
    platform: BotPlatform.Telegram,
    descriptor: BOT_PLATFORMS[BotPlatform.Telegram],
    verify,
    registerHook,
    unregisterHook,
    acceptsHookUrl,
    setup: () => [...TELEGRAM_SETUP_STEPS],
    authenticate,
    normalize: telegramNormalizer.normalize,
    receiver,
    fatal,
    act,
    mock,
  }
}

/** The built-in instance (`https://api.telegram.org`) — its `mock` is the one simulated connections use. */
export const telegramBotPlatform = makeTelegramBotPlatform()
