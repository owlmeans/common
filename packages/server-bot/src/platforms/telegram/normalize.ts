import {
  botCommandHelper, BotChatKind, BotUpdateKind, type BotChatRef, type BotConnection, type BotMessage,
  type BotMessageRef, type BotSenderRef,
} from '@owlmeans/bot'
import type { BotNormalizedUpdate } from '../types.js'
import type {
  TelegramChat, TelegramMessage, TelegramMessageEntity, TelegramNormalizer, TelegramUpdate, TelegramUser,
} from './types.js'

export const createTelegramNormalizer = (): TelegramNormalizer => {
  const iso = (unix: number | undefined): string =>
    new Date((typeof unix === 'number' && unix > 0 ? unix : Date.now() / 1000) * 1000).toISOString()

  const nameOf = (first?: string, last?: string): string | undefined => {
    const name = [first, last].filter(part => part != null && part !== '').join(' ')
    return name === '' ? undefined : name
  }

  const chatKindOf = (chat: TelegramChat): BotChatKind =>
    chat.type === 'private' ? BotChatKind.Private : chat.type === 'channel' ? BotChatKind.Channel : BotChatKind.Group

  /** A forum topic's id; a reply's thread in an ordinary supergroup is not a topic and is not kept. */
  const threadOf = (message: TelegramMessage): string | undefined =>
    message.is_topic_message === true && message.message_thread_id != null ? `${message.message_thread_id}` : undefined

  const chatOf = (message: TelegramMessage): BotChatRef => {
    const title = message.chat.title ?? nameOf(message.chat.first_name, message.chat.last_name)
    const thread = threadOf(message)

    return {
      id: `${message.chat.id}`,
      kind: chatKindOf(message.chat),
      ...(title != null ? { title } : {}),
      ...(thread != null ? { thread } : {}),
    }
  }

  const userOf = (user: TelegramUser): BotSenderRef => {
    const name = nameOf(user.first_name, user.last_name)

    return {
      id: `${user.id}`,
      ...(name != null ? { name } : {}),
      ...(user.username != null ? { username: user.username } : {}),
      bot: user.is_bot === true,
    }
  }

  /** Who wrote it: the chat it was sent on behalf of (a channel, an anonymous admin), else the user. */
  const senderOf = (message: TelegramMessage): BotSenderRef | undefined => {
    if (message.sender_chat != null) {
      const chat = message.sender_chat
      return {
        id: `${chat.id}`,
        ...(chat.title != null ? { name: chat.title } : {}),
        ...(chat.username != null ? { username: chat.username } : {}),
        bot: false,
      }
    }

    return message.from != null ? userOf(message.from) : undefined
  }

  const refOf = (message: TelegramMessage): BotMessageRef => {
    const thread = threadOf(message)

    return { chat: `${message.chat.id}`, id: `${message.message_id}`, ...(thread != null ? { thread } : {}) }
  }

  const textOf = (message: TelegramMessage): string => message.text ?? message.caption ?? ''

  const entitiesOf = (message: TelegramMessage): TelegramMessageEntity[] =>
    message.text != null ? message.entities ?? [] : message.caption_entities ?? []

  const isBot = (user: TelegramUser | undefined, connection: BotConnection): boolean => {
    const identity = connection.identity
    if (user == null || identity == null) {
      return false
    }

    return `${user.id}` === identity.id
      || (identity.username != null && user.username?.toLowerCase() === identity.username.toLowerCase())
  }

  /** A private chat, an @mention of the bot (entity offsets are UTF-16, as JS indices), a reply to it. */
  const addressedOf = (message: TelegramMessage, connection: BotConnection): boolean => {
    if (message.chat.type === 'private') {
      return true
    }
    const username = connection.identity?.username?.toLowerCase()
    const text = textOf(message)
    for (const entity of entitiesOf(message)) {
      if (entity.type === 'mention' && username != null
        && text.substring(entity.offset, entity.offset + entity.length).toLowerCase() === `@${username}`) {
        return true
      }
      if (entity.type === 'text_mention' && isBot(entity.user, connection)) {
        return true
      }
      if (entity.type === 'bot_command' && username != null
        && text.substring(entity.offset, entity.offset + entity.length).toLowerCase().endsWith(`@${username}`)) {
        return true
      }
    }

    return isBot(message.reply_to_message?.from, connection)
  }

  const messageOf = (message: TelegramMessage, edited: boolean): BotMessage => {
    const reply = message.reply_to_message
    const replySender = reply != null ? senderOf(reply) : undefined

    return {
      ref: refOf(message),
      text: textOf(message),
      date: iso(edited ? message.edit_date ?? message.date : message.date),
      ...(reply != null
        ? {
          replyTo: {
            ...refOf(reply),
            ...(reply.text != null || reply.caption != null ? { text: textOf(reply) } : {}),
            ...(replySender != null ? { sender: replySender } : {}),
          },
        }
        : {}),
    }
  }

  const normalize = (payload: unknown, connection: BotConnection): BotNormalizedUpdate[] => {
    const update = payload as TelegramUpdate | null
    if (update == null || typeof update !== 'object' || typeof update.update_id !== 'number') {
      return []
    }
    const edited = update.edited_message != null || update.edited_channel_post != null
    const message = update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post
    if (message == null || message.chat == null) {
      return []
    }
    const command = botCommandHelper.parse(textOf(message), connection.identity?.username) ?? undefined
    const sender = senderOf(message)

    return [{
      platformId: `${update.update_id}`,
      update: {
        kind: edited ? BotUpdateKind.Edited : command != null ? BotUpdateKind.Command : BotUpdateKind.Message,
        chat: chatOf(message),
        ...(sender != null ? { sender } : {}),
        message: messageOf(message, edited),
        ...(command != null ? { command } : {}),
        addressed: addressedOf(message, connection),
        raw: update,
      },
    }]
  }

  return { normalize }
}

export const telegramNormalizer = createTelegramNormalizer()
