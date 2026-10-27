import {
  botCommandHelper, BotChatKind, BotUpdateKind, type BotChatRef, type BotConnection, type BotMessage,
  type BotMessageRef, type BotSenderRef,
} from '@owlmeans/bot'
import type { BotNormalizedUpdate } from '../types.js'
import { SLACK_EDIT_SUBTYPE, SLACK_MESSAGE_SUBTYPES } from './consts.js'
import { slackTextHelper } from './text.js'
import type { SlackAppMention, SlackEnvelope, SlackMessage, SlackNormalizer } from './types.js'

export const createSlackNormalizer = (): SlackNormalizer => {
  /** `1761480000.000100` → its instant; now when unreadable. */
  const iso = (ts: string | undefined): string => {
    const seconds = Number(ts)
    return new Date(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now()).toISOString()
  }

  /** A DM is private whether `channel_type` says so or only its `D…` id does (`app_mention` has no type). */
  const chatKindOf = (channel: string, channelType?: string): BotChatKind =>
    channelType === 'im' || (channelType == null && channel.startsWith('D')) ? BotChatKind.Private : BotChatKind.Group

  const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  /** `<@U123>` or the legacy `<@U123|name>` of the bot in the text. */
  const mentions = (text: string, botUser: string | undefined): boolean =>
    botUser != null && botUser !== '' && new RegExp(`<@${escape(botUser)}(?:\\|[^>]*)?>`).test(text)

  const nameOf = (message: SlackMessage | SlackAppMention): string | undefined => {
    const profile = 'user_profile' in message ? message.user_profile : undefined
    const bot = 'bot_profile' in message ? message.bot_profile : undefined
    const name = profile?.display_name || profile?.real_name || bot?.name
    return name != null && name !== '' ? name : undefined
  }

  const senderOf = (message: SlackMessage | SlackAppMention): BotSenderRef | undefined => {
    const id = message.user ?? message.bot_id
    if (id == null || id === '') {
      return undefined
    }
    const name = nameOf(message)
    const username = 'user_profile' in message ? message.user_profile?.name : undefined

    return {
      id,
      ...(name != null ? { name } : {}),
      ...(username != null && username !== '' ? { username } : {}),
      bot: message.bot_id != null,
    }
  }

  const normalize = (payload: unknown, connection: BotConnection): BotNormalizedUpdate[] => {
    const envelope = payload as SlackEnvelope | null
    if (envelope == null || typeof envelope !== 'object' || envelope.type !== 'event_callback'
      || envelope.event == null || typeof envelope.event !== 'object') {
      return []
    }
    const team = envelope.team_id
    // The bot as verification answered; the installation's own bot user when it is not verified yet.
    const botUser = connection.identity?.id ?? envelope.authorizations?.find(entry => entry.is_bot === true)?.user_id

    /** The bot's own post: its user, or a bot message of this very app. */
    const own = (message: SlackMessage | SlackAppMention): boolean =>
      (botUser != null && message.user === botUser)
      || (message.bot_id != null && envelope.api_app_id != null
        && (message.app_id === envelope.api_app_id
          || ('bot_profile' in message && message.bot_profile?.app_id === envelope.api_app_id)))

    const build = (
      message: SlackMessage | SlackAppMention, channel: string, channelType: string | undefined,
      opts: { edited?: string, mention?: boolean }
    ): BotNormalizedUpdate[] => {
      const ts = message.ts
      if (ts == null || ts === '' || own(message)) {
        return []
      }
      // Mentions are control sequences of the escaped text; people (and rules) read the decoded one.
      const escaped = message.text ?? ''
      const text = slackTextHelper.decode(escaped)
      const thread = message.thread_ts != null && message.thread_ts !== '' ? message.thread_ts : undefined
      const kind = chatKindOf(channel, channelType)
      const space = team ?? message.team
      const chat: BotChatRef = {
        id: channel, kind, ...(thread != null ? { thread } : {}), ...(space != null ? { space } : {}),
      }
      const ref: BotMessageRef = {
        chat: channel, id: ts, ...(thread != null ? { thread } : {}), ...(space != null ? { space } : {}),
      }
      const parentUser = 'parent_user_id' in message ? message.parent_user_id : undefined
      const replied = thread != null && thread !== ts
      const body: BotMessage = {
        ref,
        text,
        date: iso(opts.edited ?? ts),
        ...(replied
          ? {
            replyTo: {
              chat: channel, id: thread, thread, ...(space != null ? { space } : {}),
              ...(parentUser != null ? { sender: { id: parentUser, ...(parentUser === botUser ? { bot: true } : {}) } } : {}),
            },
          }
          : {}),
      }
      const command = opts.edited == null
        ? botCommandHelper.parse(text, connection.identity?.username) ?? undefined
        : undefined
      const sender = senderOf(message)
      const addressed = kind === BotChatKind.Private || opts.mention === true || mentions(escaped, botUser)
        || (replied && botUser != null && parentUser === botUser)

      return [{
        // One message is one key: a redelivery and the `message` + `app_mention` pair of one mention
        // store once; an edit is keyed by the edit.
        platformId: opts.edited != null ? `${channel}:${ts}:edited:${opts.edited}` : `${channel}:${ts}`,
        update: {
          kind: opts.edited != null ? BotUpdateKind.Edited : command != null ? BotUpdateKind.Command : BotUpdateKind.Message,
          chat,
          ...(sender != null ? { sender } : {}),
          message: body,
          ...(command != null ? { command } : {}),
          addressed,
          raw: envelope,
        },
      }]
    }

    const event = envelope.event as SlackMessage | SlackAppMention
    const channel = event.channel
    if (channel == null || channel === '') {
      return []
    }
    if (event.type === 'app_mention') {
      return build(event, channel, undefined, { mention: true })
    }
    if (event.type !== 'message') {
      return []
    }
    if (event.subtype === SLACK_EDIT_SUBTYPE) {
      const current = event.message
      const previous = event.previous_message
      // Slack also sends `message_changed` for metadata (unfurls, language): only new text is an edit.
      if (current == null || typeof current.text !== 'string'
        || (current.edited == null && (previous == null || previous.text === current.text))) {
        return []
      }

      return build(current, channel, event.channel_type, { edited: current.edited?.ts ?? event.event_ts ?? event.ts ?? '' })
    }
    if (event.subtype != null && !SLACK_MESSAGE_SUBTYPES.includes(event.subtype)) {
      return []
    }

    return build(event, channel, event.channel_type, {})
  }

  return { normalize }
}

export const slackNormalizer = createSlackNormalizer()
