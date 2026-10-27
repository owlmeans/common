import {
  botCommandHelper, BotChatKind, BotUpdateKind, type BotChatRef, type BotConnection, type BotMessage,
  type BotMessageRef, type BotSenderRef,
} from '@owlmeans/bot'
import type { BotNormalizedUpdate } from '../types.js'
import { DISCORD_MESSAGE_DEFAULT, DISCORD_MESSAGE_REPLY } from './consts.js'
import type { DiscordGatewayPayload, DiscordMessage, DiscordNormalizer, DiscordUser } from './types.js'

export const createDiscordNormalizer = (): DiscordNormalizer => {
  /** ISO 8601 as the contract writes it (Discord sends microseconds and an offset). */
  const iso = (stamp: string | null | undefined): string => {
    const time = stamp != null ? Date.parse(stamp) : Number.NaN
    return new Date(Number.isFinite(time) ? time : Date.now()).toISOString()
  }

  const userOf = (user: DiscordUser): BotSenderRef => ({
    id: user.id,
    ...(user.global_name != null && user.global_name !== '' ? { name: user.global_name } : {}),
    ...(user.username != null && user.username !== '' ? { username: user.username } : {}),
    bot: user.bot === true,
  })

  /** A channel of a guild is a group (the guild is its `space`); a channel with no guild is a direct message. */
  const chatOf = (message: DiscordMessage): BotChatRef => ({
    id: message.channel_id,
    kind: message.guild_id != null ? BotChatKind.Group : BotChatKind.Private,
    ...(message.guild_id != null ? { space: message.guild_id } : {}),
  })

  const refOf = (message: DiscordMessage): BotMessageRef => ({
    chat: message.channel_id, id: message.id, ...(message.guild_id != null ? { space: message.guild_id } : {}),
  })

  const isReply = (message: DiscordMessage): boolean =>
    message.type === DISCORD_MESSAGE_REPLY && message.message_reference?.message_id != null
    && (message.message_reference.type ?? 0) === 0

  /** A direct message, a mention of the bot (`<@id>` / `<@!id>`), or a reply to one of its messages. */
  const addressedOf = (message: DiscordMessage, connection: BotConnection): boolean => {
    if (message.guild_id == null) {
      return true
    }
    const bot = connection.identity?.id
    if (bot == null || bot === '') {
      return false
    }
    if ((message.mentions ?? []).some(user => user.id === bot)
      || message.content.includes(`<@${bot}>`) || message.content.includes(`<@!${bot}>`)) {
      return true
    }

    return isReply(message) && message.referenced_message?.author?.id === bot
  }

  const messageOf = (message: DiscordMessage, edited: boolean): BotMessage => {
    const reference = message.message_reference
    const replied = message.referenced_message ?? undefined
    const space = reference?.guild_id ?? message.guild_id

    return {
      ref: refOf(message),
      text: message.content,
      date: iso(edited ? message.edited_timestamp ?? message.timestamp : message.timestamp),
      ...(isReply(message)
        ? {
          replyTo: {
            chat: reference?.channel_id ?? message.channel_id,
            id: reference!.message_id!,
            ...(space != null ? { space } : {}),
            ...(typeof replied?.content === 'string' ? { text: replied.content } : {}),
            ...(replied?.author != null ? { sender: userOf(replied.author) } : {}),
          },
        }
        : {}),
    }
  }

  const normalize = (payload: unknown, connection: BotConnection): BotNormalizedUpdate[] => {
    const frame = payload as DiscordGatewayPayload<DiscordMessage> | null
    if (frame == null || typeof frame !== 'object' || (frame.op != null && frame.op !== 0)) {
      return []
    }
    const edited = frame.t === 'MESSAGE_UPDATE'
    if (frame.t !== 'MESSAGE_CREATE' && !edited) {
      return []
    }
    const message = frame.d
    if (message == null || typeof message !== 'object' || typeof message.id !== 'string'
      || typeof message.channel_id !== 'string' || message.author == null || typeof message.content !== 'string') {
      return []
    }
    // An update without an edit time is Discord unfurling a link (an embed), not a person editing.
    if (edited && message.edited_timestamp == null) {
      return []
    }
    if (message.type != null && message.type !== DISCORD_MESSAGE_DEFAULT && message.type !== DISCORD_MESSAGE_REPLY) {
      return []
    }
    // The gateway echoes what the bot itself sends.
    if (connection.identity?.id != null && message.author.id === connection.identity.id) {
      return []
    }
    const command = botCommandHelper.parse(message.content, connection.identity?.username) ?? undefined

    return [{
      platformId: edited ? `${message.id}:${message.edited_timestamp}` : message.id,
      update: {
        kind: edited ? BotUpdateKind.Edited : command != null ? BotUpdateKind.Command : BotUpdateKind.Message,
        chat: chatOf(message),
        sender: userOf(message.author),
        message: messageOf(message, edited),
        ...(command != null ? { command } : {}),
        addressed: addressedOf(message, connection),
        raw: frame,
      },
    }]
  }

  return { normalize }
}

export const discordNormalizer = createDiscordNormalizer()
