import {
  botCommandHelper, BotChatKind, BotUpdateKind, type BotConnection, type BotMessage, type BotSenderRef,
} from '@owlmeans/bot'
import type { BotNormalizedUpdate } from '../types.js'
import { WHATSAPP_CAPTIONED_TYPES, WHATSAPP_MESSAGES_FIELD, WHATSAPP_WEBHOOK_OBJECT } from './consts.js'
import type {
  WhatsAppContact, WhatsAppMessage, WhatsAppMetadata, WhatsAppNormalizer, WhatsAppValue, WhatsAppWebhook,
} from './types.js'

export const createWhatsAppNormalizer = (): WhatsAppNormalizer => {
  const iso = (unix: string | undefined): string => {
    const seconds = Number(unix)
    return new Date((Number.isFinite(seconds) && seconds > 0 ? seconds : Date.now() / 1000) * 1000).toISOString()
  }

  const digitsOf = (value: string | undefined): string => (value ?? '').replace(/\D/g, '')

  /** The text a message carries: a text body, a tapped button or list row, a media caption; none for other kinds. */
  const textOf = (message: WhatsAppMessage): string | undefined => {
    switch (message.type) {
      case 'text':
        return typeof message.text?.body === 'string' ? message.text.body : undefined
      case 'interactive':
        return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title
      case 'button':
        return message.button?.text ?? message.button?.payload
      default:
        if (WHATSAPP_CAPTIONED_TYPES.includes(message.type)) {
          const media = message[message.type as 'image' | 'video' | 'document']
          return media != null ? media.caption ?? '' : undefined
        }
        return undefined
    }
  }

  /** The profile of the customer who wrote — by `wa_id`, else the only contact of the change. */
  const contactOf = (value: WhatsAppValue, message: WhatsAppMessage): WhatsAppContact | undefined => {
    const contacts = Array.isArray(value.contacts) ? value.contacts : []
    return contacts.find(contact => contact.wa_id === message.from) ?? (contacts.length === 1 ? contacts[0] : undefined)
  }

  /** The business number of the change — the bot — as a sender. */
  const botOf = (metadata: WhatsAppMetadata | undefined, connection: BotConnection): BotSenderRef => {
    const id = connection.identity?.id ?? metadata?.phone_number_id ?? ''
    const username = metadata?.display_phone_number ?? connection.identity?.username
    const name = connection.identity?.name

    return { id, ...(name != null ? { name } : {}), ...(username != null ? { username } : {}), bot: true }
  }

  const isBotNumber = (number: string | undefined, metadata: WhatsAppMetadata | undefined, connection: BotConnection): boolean => {
    const digits = digitsOf(number)
    return digits !== '' && (digits === digitsOf(metadata?.display_phone_number) || digits === digitsOf(connection.identity?.username))
  }

  const messageOf = (
    value: WhatsAppValue, message: WhatsAppMessage, text: string, sender: BotSenderRef, connection: BotConnection
  ): BotMessage => {
    const context = message.context
    const quoted = context?.id != null && context.id !== ''
      ? isBotNumber(context.from, value.metadata, connection)
        ? botOf(value.metadata, connection)
        : context.from != null && context.from !== ''
          ? context.from === message.from ? sender : { id: context.from, bot: false }
          : undefined
      : undefined

    return {
      ref: { chat: message.from, id: message.id },
      text,
      date: iso(message.timestamp),
      ...(context?.id != null && context.id !== ''
        ? { replyTo: { chat: message.from, id: context.id, ...(quoted != null ? { sender: quoted } : {}) } }
        : {}),
    }
  }

  const changeOf = (value: WhatsAppValue, connection: BotConnection): BotNormalizedUpdate[] => {
    const own = connection.identity?.id
    const number = value.metadata?.phone_number_id
    // One app posts every number's messages to one URL: another number's are not this connection's.
    if (own != null && own !== '' && number != null && number !== '' && number !== own) {
      return []
    }
    const updates: BotNormalizedUpdate[] = []
    for (const message of Array.isArray(value.messages) ? value.messages : []) {
      if (message == null || typeof message.id !== 'string' || typeof message.from !== 'string') {
        continue
      }
      const text = textOf(message)
      if (text == null) {
        continue
      }
      const contact = contactOf(value, message)
      const name = contact?.profile?.name
      const sender: BotSenderRef = { id: message.from, ...(name != null && name !== '' ? { name } : {}), bot: false }
      const command = botCommandHelper.parse(text) ?? undefined
      updates.push({
        platformId: message.id,
        update: {
          kind: command != null ? BotUpdateKind.Command : BotUpdateKind.Message,
          chat: { id: message.from, kind: BotChatKind.Private, ...(sender.name != null ? { title: sender.name } : {}) },
          sender,
          message: messageOf(value, message, text, sender, connection),
          ...(command != null ? { command } : {}),
          // Cloud API messages are one-to-one: every one is written to the bot.
          addressed: true,
          raw: { metadata: value.metadata, ...(contact != null ? { contact } : {}), message },
        },
      })
    }

    return updates
  }

  const normalize = (payload: unknown, connection: BotConnection): BotNormalizedUpdate[] => {
    const webhook = payload as WhatsAppWebhook | null
    if (webhook == null || typeof webhook !== 'object' || webhook.object !== WHATSAPP_WEBHOOK_OBJECT
      || !Array.isArray(webhook.entry)) {
      return []
    }

    return webhook.entry.flatMap(entry => (Array.isArray(entry?.changes) ? entry.changes : [])
      .filter(change => change?.field === WHATSAPP_MESSAGES_FIELD && change.value != null && typeof change.value === 'object')
      .flatMap(change => changeOf(change.value, connection)))
  }

  return { normalize }
}

export const whatsappNormalizer = createWhatsAppNormalizer()
