import { createHash, randomBytes, randomInt } from 'node:crypto'
import { BotChatKind, BotUnsupportedAction, type BotSimulateInput } from '@owlmeans/bot'
import type { BotFetch, BotFetchInit, BotMockCall, BotNativeInbound, BotPlatformConnection } from '../types.js'
import {
  SLACK_MOCK_CHANNEL_ID, SLACK_MOCK_EVENT_ID_ALPHABET, SLACK_MOCK_EVENT_ID_LENGTH, SLACK_MOCK_MEMBER_ID,
  SLACK_MOCK_OTHER_ID, SLACK_MOCK_TEAM_NAME, SLACK_MOCK_VERIFICATION_TOKEN, SLACK_SIGNATURE_HEADER, SLACK_TEXT_MAX, SLACK_TIMESTAMP_HEADER,
} from './consts.js'
import { slackSignatureHelper } from './signature.js'
import { slackTextHelper } from './text.js'
import type {
  SlackAnswer, SlackAuthTest, SlackEnvelope, SlackMessage, SlackMock, SlackMockIdentity,
  SlackMockState, SlackPosted,
} from './types.js'

/**
 * The Web API and the Events API, faked per connection and in process: the same URLs, `{ ok, error }`
 * answers and payload shapes the real service uses, no network. `auth.test` answers a stable fake
 * bot (or, for the connection's `userToken`, a fake admin), `chat.postMessage` answers increasing
 * `ts`, `chat.delete` lets the bot delete its own posts and the admin token anyone's, and `inbound`
 * builds a signed `event_callback` the plugin's `authenticate` accepts.
 */
export const makeSlackMock = (): SlackMock => {
  const states = new Map<string, SlackMockState>()

  const stateOf = (connection: string): SlackMockState => {
    let state = states.get(connection)
    if (state == null) {
      state = { clock: 0, calls: [], sent: new Set(), reactions: new Set() }
      states.set(connection, state)
    }

    return state
  }

  /** A Slack-shaped id (`<prefix>` + 10 upper-case base-36 characters), stable for a text. */
  const idOf = (prefix: string, text: string): string =>
    `${prefix}${BigInt(`0x${createHash('sha256').update(text).digest('hex').slice(0, 15)}`).toString(36).toUpperCase().padStart(10, '0').slice(0, 10)}`

  /**
   * A later `ts` than any the connection handed out: `<seconds>.<microseconds>`, the microseconds
   * below the millisecond random — a restarted or another process does not meet a stored one.
   */
  const nextTs = (state: SlackMockState): string => {
    state.clock = Math.max(Date.now() * 1000 + randomInt(1000), state.clock + 1)
    return `${Math.floor(state.clock / 1_000_000)}.${`${state.clock % 1_000_000}`.padStart(6, '0')}`
  }

  /** A random `Ev…` event id. */
  const eventIdOf = (): string =>
    `Ev${Array.from(randomBytes(SLACK_MOCK_EVENT_ID_LENGTH), byte => SLACK_MOCK_EVENT_ID_ALPHABET[byte % SLACK_MOCK_EVENT_ID_ALPHABET.length]).join('')}`

  /** A simulated thread id as a `ts`: one stays itself, any other text maps to a stable one. */
  const tsOf = (value: string): string => /^\d{9,11}\.\d{6}$/.test(value)
    ? value
    : `${1_600_000_000 + Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 7), 16) % 100_000_000}.000000`

  const identityOf = (connection: string): SlackMockIdentity => ({
    teamId: idOf('T', `${connection}:team`),
    teamName: SLACK_MOCK_TEAM_NAME,
    appId: idOf('A', `${connection}:app`),
    botId: idOf('B', `${connection}:bot`),
    botUserId: idOf('U', `${connection}:bot-user`),
    username: `mock_${connection.replace(/[^A-Za-z0-9]/g, '').slice(0, 24).toLowerCase() || 'bot'}_bot`,
    adminUserId: idOf('U', `${connection}:admin`),
  })

  const answer = (body: SlackAnswer & Record<string, unknown>): Response =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } })

  const refuse = (error: string): Response => answer({ ok: false, error })

  const aborted = (): Error => {
    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'
    return error
  }

  const text = (value: unknown): string => typeof value === 'string' ? value : ''

  const fetch = (connection: BotPlatformConnection): BotFetch => async (url: string, init?: BotFetchInit) => {
    if (init?.signal?.aborted === true) {
      throw aborted()
    }
    const method = new URL(url).pathname.split('/').pop() ?? ''
    let params: Record<string, unknown> = {}
    try {
      params = init?.body != null && init.body !== '' ? JSON.parse(init.body) as Record<string, unknown> : {}
    } catch {
      return refuse('invalid_json')
    }
    const authorization = Object.entries(init?.headers ?? {}).find(([key]) => key.toLowerCase() === 'authorization')?.[1] ?? ''
    const bearer = authorization.replace(/^Bearer\s+/i, '')
    const userToken = connection.credentials.userToken ?? ''
    const auth: 'bot' | 'user' | 'none' = userToken !== '' && bearer === userToken ? 'user' : bearer !== '' ? 'bot' : 'none'
    const state = stateOf(connection.id)
    state.calls.push({ method, params, at: new Date().toISOString(), auth })
    const fake = identityOf(connection.id)

    switch (method) {
      case 'auth.test': {
        const common = { ok: true, url: `https://${fake.teamId.toLowerCase()}.slack.com/`, team: fake.teamName, team_id: fake.teamId }
        const result: SlackAuthTest = auth === 'user'
          ? { ...common, user: 'mock_admin', user_id: fake.adminUserId }
          : { ...common, user: fake.username, user_id: fake.botUserId, bot_id: fake.botId }
        return answer({ ...result })
      }
      case 'chat.postMessage': {
        const channel = text(params.channel)
        const body = text(params.text)
        if (channel === '') {
          return refuse('channel_not_found')
        }
        if (body.trim() === '') {
          return refuse('no_text')
        }
        if (body.length > SLACK_TEXT_MAX) {
          return refuse('msg_too_long')
        }
        const ts = nextTs(state)
        state.sent.add(ts)
        const thread = text(params.thread_ts)
        const posted: SlackPosted = {
          ok: true,
          channel,
          ts,
          message: {
            type: 'message', text: body, user: fake.botUserId, bot_id: fake.botId, app_id: fake.appId, team: fake.teamId,
            ts, ...(thread !== '' ? { thread_ts: thread, parent_user_id: state.sent.has(thread) ? fake.botUserId : SLACK_MOCK_MEMBER_ID } : {}),
          },
        }
        return answer({ ...posted })
      }
      case 'chat.delete': {
        const channel = text(params.channel)
        const ts = text(params.ts)
        if (channel === '') {
          return refuse('channel_not_found')
        }
        if (ts === '') {
          return refuse('message_not_found')
        }
        // A bot token deletes only the bot's own posts; an admin's user token deletes anyone's.
        if (!state.sent.has(ts) && auth !== 'user') {
          return refuse('cant_delete_message')
        }
        state.sent.delete(ts)
        return answer({ ok: true, channel, ts })
      }
      case 'reactions.add': {
        const channel = text(params.channel)
        const ts = text(params.timestamp)
        const name = text(params.name)
        if (channel === '') {
          return refuse('channel_not_found')
        }
        if (ts === '') {
          return refuse('bad_timestamp')
        }
        // A name, never `:name:` nor the Unicode character; a skin tone is `name::skin-tone-<2…6>`.
        if (!/^[a-z0-9_+'-]+(?:::skin-tone-[2-6])?$/i.test(name)) {
          return refuse('invalid_name')
        }
        const key = `${channel}:${ts}:${name}`
        if (state.reactions.has(key)) {
          return refuse('already_reacted')
        }
        state.reactions.add(key)
        return answer({ ok: true })
      }
      default:
        return refuse('unknown_method')
    }
  }

  /** The secret the mock signs with: the connection's signing secret, else its hook secret. */
  const secretOf = (connection: BotPlatformConnection): string => {
    const secret = connection.credentials.signingSecret ?? ''
    return secret !== '' ? secret : connection.hookSecret
  }

  /** Bytes and headers as Slack posts them, signed now. */
  const signed = (connection: BotPlatformConnection, body: SlackEnvelope): BotNativeInbound => {
    const rawBody = JSON.stringify(body)
    const timestamp = `${Math.floor(Date.now() / 1000)}`

    return {
      body,
      rawBody,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Slackbot 1.0 (+https://api.slack.com/robots)',
        [SLACK_TIMESTAMP_HEADER]: timestamp,
        [SLACK_SIGNATURE_HEADER]: slackSignatureHelper.sign(secretOf(connection), timestamp, rawBody),
      },
    }
  }

  const inbound = (input: BotSimulateInput, connection: BotPlatformConnection): BotNativeInbound => {
    const state = stateOf(connection.id)
    const fake = identityOf(connection.id)
    const botUser = connection.identity?.id ?? fake.botUserId
    const username = connection.identity?.username ?? fake.username
    const kind = input.chat?.kind ?? BotChatKind.Group
    const senderId = input.sender?.id != null && /^[UW][A-Z0-9]{2,}$/.test(input.sender.id)
      ? input.sender.id
      : input.sender?.id != null && input.sender.id !== '' ? idOf('U', input.sender.id) : SLACK_MOCK_MEMBER_ID
    const chatId = input.chat?.id
    const channel = kind === BotChatKind.Private
      ? chatId != null && /^D[A-Z0-9]{2,}$/.test(chatId) ? chatId : idOf('D', `${connection.id}:${chatId ?? senderId}`)
      : chatId != null && /^[CG][A-Z0-9]{2,}$/.test(chatId) ? chatId
        : chatId != null && chatId !== '' ? idOf('C', chatId) : SLACK_MOCK_CHANNEL_ID
    const ts = nextTs(state)
    const parent = input.replyTo?.id ?? input.chat?.thread
    const thread = parent != null && parent !== '' ? tsOf(parent) : undefined
    // The client escapes `& < >` but keeps control sequences (`<@U…>`, `<#C…>`, `<https://…>`), and
    // a person's `@bot` reaches the API as `<@U…>`.
    const escaped = input.text.split(/(<(?:[@#!][^<>\s]+|https?:\/\/[^<>\s]+)>)/)
      .map((part, index) => index % 2 === 1 ? part : slackTextHelper.encode(part)).join('')
    const body = username !== ''
      ? escaped.replace(new RegExp(`(?<![\\w<])@${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), `<@${botUser}>`)
      : escaped
    const name = input.sender?.name
    const bot = input.sender?.bot === true
    const event: SlackMessage = {
      type: 'message',
      ...(bot
        ? { bot_id: idOf('B', senderId), bot_profile: { id: idOf('B', senderId), name: name ?? 'Another bot', app_id: idOf('A', senderId) } }
        : {}),
      user: senderId,
      text: body,
      ts,
      team: fake.teamId,
      channel,
      event_ts: ts,
      channel_type: kind === BotChatKind.Private ? 'im' : 'channel',
      ...(thread != null
        ? { thread_ts: thread, parent_user_id: state.sent.has(thread) ? botUser : SLACK_MOCK_OTHER_ID }
        : {}),
      ...(!bot && (name != null || input.sender?.username != null)
        ? {
          user_profile: {
            ...(name != null ? { real_name: name, display_name: name } : {}),
            ...(input.sender?.username != null ? { name: input.sender.username } : {}),
          },
        }
        : {}),
    }
    const envelope: SlackEnvelope = {
      token: SLACK_MOCK_VERIFICATION_TOKEN,
      team_id: fake.teamId,
      api_app_id: fake.appId,
      event,
      type: 'event_callback',
      event_id: eventIdOf(),
      event_time: Math.floor(Date.now() / 1000),
      authorizations: [{ enterprise_id: null, team_id: fake.teamId, user_id: botUser, is_bot: true, is_enterprise_install: false }],
      is_ext_shared_channel: false,
      event_context: `4-mock-${connection.id}`,
    }

    return signed(connection, envelope)
  }

  const challenge = (connection: BotPlatformConnection, value?: string): BotNativeInbound =>
    signed(connection, {
      token: SLACK_MOCK_VERIFICATION_TOKEN,
      challenge: value ?? idOf('', `${connection.id}:${Date.now()}:${Math.random()}`),
      type: 'url_verification',
    })

  /** Slack only posts to the hook: there is no receiver to feed. */
  const feed = (): void => {
    throw new BotUnsupportedAction('mock-feed:slack')
  }

  const calls = (connection: string): BotMockCall[] => [...(states.get(connection)?.calls ?? [])]

  const reset = (connection?: string): void => {
    if (connection == null) {
      states.clear()
      return
    }
    states.delete(connection)
  }

  return { fetch, inbound, feed, calls, reset, challenge, identityOf }
}
