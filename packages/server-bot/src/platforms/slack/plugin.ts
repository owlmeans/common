import {
  BOT_PLATFORMS, BotActionKind, BotCredentialsRejected, BotPlatform, BotTransport, BotUnsupportedAction,
  type BotMessageRef,
} from '@owlmeans/bot'
import { botHookHelper } from '../hook.js'
import type {
  BotAuthentication, BotPlatformAction, BotPlatformActionResult, BotPlatformConnection, BotPlatformIdentity,
  BotPlatformPlugin, BotPlatformSession,
} from '../types.js'
import { makeSlackApi } from './api.js'
import {
  SLACK_API_BASE, SLACK_CREDENTIAL_ERRORS, SLACK_EMOJI_NAMES, SLACK_RATE_LIMIT_MAX_WAIT_S, SLACK_RATE_LIMIT_RETRIES,
  SLACK_SETUP_CREDENTIALS_STEP, SLACK_SETUP_HOOK_PENDING_STEP, SLACK_SETUP_HOOK_STEP, SLACK_SETUP_TAIL_STEPS,
  SLACK_SIGNATURE_HEADER, SLACK_TEXT_MAX, SLACK_TIMESTAMP_HEADER,
} from './consts.js'
import { SlackApiError } from './errors.js'
import { makeSlackMock } from './mock.js'
import { slackNormalizer } from './normalize.js'
import { slackSignatureHelper } from './signature.js'
import { slackTextHelper } from './text.js'
import type { SlackAnswer, SlackAuthTest, SlackBotPlatform, SlackBotPlatformOptions, SlackPosted } from './types.js'

/**
 * The Slack plugin over the Events API and the Web API (https://docs.slack.dev/apis/): `auth.test`
 * verifies, a person pastes the Request URL (manual setup), every hook request is checked against
 * the signing secret, and `chat.postMessage` / `chat.delete` / `reactions.add` act. A reply goes
 * into the message's thread; `delete` uses the admin `userToken`.
 */
export const makeSlackBotPlatform = (opts: SlackBotPlatformOptions = {}): SlackBotPlatform => {
  const base = (opts.base ?? SLACK_API_BASE).replace(/\/+$/, '')
  const retry = { retries: opts.retries ?? SLACK_RATE_LIMIT_RETRIES, maxRetryWaitS: opts.maxRetryWaitS ?? SLACK_RATE_LIMIT_MAX_WAIT_S }
  const mock = makeSlackMock()
  const api = (session: BotPlatformSession) => makeSlackApi(session, base, retry)

  /** Clipped to the text limit without splitting a surrogate pair. */
  const clip = (text: string): string => {
    if (text.length <= SLACK_TEXT_MAX) {
      return text
    }
    const cut = text.slice(0, SLACK_TEXT_MAX - 1)

    return `${/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut}…`
  }

  /** `:thumbsup:` → `thumbsup`; a mapped Unicode emoji → its name; anything else as given. */
  const emojiName = (emoji: string): string => {
    const trimmed = emoji.trim()
    const bare = trimmed.replace(/️/g, '')

    return SLACK_EMOJI_NAMES[bare] ?? trimmed.replace(/^:+|:+$/g, '')
  }

  /** A credential refusal of `auth.test` as `BotCredentialsRejected`, anything else as it is. */
  const authTest = async (session: BotPlatformSession, token: string | undefined, label: string): Promise<SlackAuthTest> => {
    try {
      return await api(session).call<SlackAuthTest>('auth.test', {}, token != null ? { token } : {})
    } catch (error) {
      if (error instanceof SlackApiError && SLACK_CREDENTIAL_ERRORS.includes(error.code)) {
        throw new BotCredentialsRejected(`slack:${label}${error.code}`)
      }
      throw error
    }
  }

  const verify = async (session: BotPlatformSession): Promise<BotPlatformIdentity> => {
    const credentials = session.connection.credentials
    if (session.transport === BotTransport.Live) {
      const missing = ['botToken', 'signingSecret'].filter(key => (credentials[key] ?? '') === '')
      if (missing.length > 0) {
        throw new BotCredentialsRejected(`missing:${missing.join(',')}`)
      }
    }
    const bot = await authTest(session, undefined, '')
    if (bot.bot_id == null || bot.bot_id === '') {
      throw new BotCredentialsRejected('slack:botToken-not-a-bot-token')
    }
    const userToken = credentials.userToken ?? ''
    if (userToken !== '') {
      const admin = await authTest(session, userToken, 'userToken:')
      if (admin.bot_id != null && admin.bot_id !== '') {
        throw new BotCredentialsRejected('slack:userToken-not-a-user-token')
      }
      if (admin.team_id !== bot.team_id) {
        throw new BotCredentialsRejected('slack:userToken-another-workspace')
      }
    }
    const id = bot.user_id ?? bot.bot_id

    return { id, ...(bot.user != null ? { username: bot.user } : {}), ...(bot.team != null ? { name: bot.team } : {}) }
  }

  const setup = (connection: BotPlatformConnection): string[] => [
    SLACK_SETUP_CREDENTIALS_STEP,
    connection.hookUrl != null && connection.hookUrl !== '' ? `${SLACK_SETUP_HOOK_STEP}${connection.hookUrl}` : SLACK_SETUP_HOOK_PENDING_STEP,
    ...SLACK_SETUP_TAIL_STEPS,
  ]

  /**
   * The signature over the raw body with the signing secret (a MOCK connection also accepts its hook
   * secret — what the mock signs with when it has no signing secret), a fresh timestamp, and only
   * then the `url_verification` handshake.
   */
  const authenticate: BotPlatformPlugin['authenticate'] = (request, connection): BotAuthentication => {
    if (request.method.toUpperCase() !== 'POST') {
      return { result: 'reject', reason: 'method' }
    }
    const timestamp = botHookHelper.header(request, SLACK_TIMESTAMP_HEADER)
    if (!slackSignatureHelper.fresh(timestamp, Date.now())) {
      return { result: 'reject', reason: 'stale-timestamp' }
    }
    const secrets = [
      connection.credentials.signingSecret ?? '',
      ...(connection.transport === BotTransport.Mock ? [connection.hookSecret] : []),
    ].filter(secret => secret !== '')
    if (secrets.length === 0) {
      return { result: 'reject', reason: 'no-signing-secret' }
    }
    const signature = botHookHelper.header(request, SLACK_SIGNATURE_HEADER)
    if (!slackSignatureHelper.matches(signature, timestamp!, botHookHelper.rawText(request), secrets)) {
      return { result: 'reject', reason: 'signature' }
    }
    const payload = botHookHelper.json(request) as { type?: unknown, challenge?: unknown } | null
    if (payload != null && payload.type === 'url_verification') {
      return typeof payload.challenge === 'string'
        ? { result: 'challenge', reply: { challenge: payload.challenge } }
        : { result: 'reject', reason: 'challenge' }
    }

    return { result: 'ok' }
  }

  const refOf = (posted: SlackPosted, chat: string, thread?: string, space?: string): BotMessageRef => ({
    chat: posted.channel ?? chat,
    id: posted.ts ?? '',
    ...(thread != null && thread !== '' ? { thread } : {}),
    ...(space != null ? { space } : {}),
  })

  const act = async (session: BotPlatformSession, action: BotPlatformAction): Promise<BotPlatformActionResult> => {
    const client = api(session)
    switch (action.kind) {
      case BotActionKind.Reply: {
        // Slack threads hang off the parent: a reply inside a thread names the thread, else the message.
        const thread = action.to.thread ?? action.to.id
        const posted = await client.call<SlackPosted>('chat.postMessage', {
          channel: action.to.chat, text: slackTextHelper.encode(clip(action.text)), thread_ts: thread,
        })
        return { message: refOf(posted, action.to.chat, thread, action.to.space) }
      }
      case BotActionKind.Send: {
        const thread = action.chat.thread
        const posted = await client.call<SlackPosted>('chat.postMessage', {
          channel: action.chat.id, text: slackTextHelper.encode(clip(action.text)), ...(thread != null && thread !== '' ? { thread_ts: thread } : {}),
        })
        return { message: refOf(posted, action.chat.id, thread, action.chat.space) }
      }
      case BotActionKind.Delete: {
        // A bot token deletes only the bot's own posts: a member's message needs an admin's user token.
        const token = session.connection.credentials.userToken ?? ''
        if (token === '') {
          throw new BotUnsupportedAction(BotActionKind.Delete)
        }
        await client.call<SlackAnswer>('chat.delete', { channel: action.message.chat, ts: action.message.id }, { token })
        return {}
      }
      case BotActionKind.React:
        await client.call<SlackAnswer>('reactions.add', {
          channel: action.message.chat, timestamp: action.message.id, name: emojiName(action.emoji),
        })
        return {}
      case BotActionKind.Mute:
      case BotActionKind.Ban:
        throw new BotUnsupportedAction(action.kind)
    }
  }

  return {
    platform: BotPlatform.Slack,
    descriptor: BOT_PLATFORMS[BotPlatform.Slack],
    verify,
    setup,
    authenticate,
    normalize: slackNormalizer.normalize,
    act,
    mock,
  }
}

/** The built-in instance (`https://slack.com/api`) — its `mock` is the one simulated connections use. */
export const slackBotPlatform = makeSlackBotPlatform()
