import { BotActionKind } from '@owlmeans/bot'

/** `bot:<marker>:<detail>` — how every bot refusal's message reads. */
export const REFUSAL_MARKER = /^bot:([a-z-]+)(?::([\s\S]*))?$/

/** What an action does, as a sentence names it: "… cannot delete messages". */
export const REFUSAL_ACTION_VERBS: Readonly<Record<BotActionKind, string>> = Object.freeze({
  [BotActionKind.Reply]: 'reply to messages',
  [BotActionKind.Send]: 'send messages',
  [BotActionKind.Delete]: 'delete messages',
  [BotActionKind.Mute]: 'mute members',
  [BotActionKind.Ban]: 'ban members',
  [BotActionKind.React]: 'react to messages',
  [BotActionKind.Note]: 'record notes',
})

/** `bot:invalid-action:<what>` — a request the bot cannot act on, decided before any call. */
export const REFUSAL_INVALID_ACTIONS: Readonly<Record<string, string>> = Object.freeze({
  'empty-text': 'The text is empty.',
  'no-message': 'There is no message to act on.',
  'no-member': 'There is no member to act on.',
  'no-chat': 'There is no chat to send to.',
  minutes: 'A mute lasts at least one minute.',
  'no-emoji': 'No emoji was given.',
})

/** The leading segments of a platform error's detail that are codes, not words (`400`, `chat.delete`). */
export const REFUSAL_CODE_SEGMENT = /^(?:\d+|[a-z]+(?:\.[A-Za-z_]+)+)$/

/** What the platform clients name a transport fault — the platform was not reached at all. */
export const REFUSAL_UNREACHABLE = /\bunreachable$/
export const REFUSAL_TIMEOUT = /\btimeout$/
