import type { BotPlatformDescriptor } from './types.js'

/** The messaging platforms a bot connection can live on. */
export enum BotPlatform {
  Telegram = 'telegram',
  WhatsApp = 'whatsapp',
  Discord = 'discord',
  Slack = 'slack',
}

/** How a connection's updates reach the application. */
export enum BotReceiveMode {
  /** The platform POSTs every update to the connection's hook URL. */
  Webhook = 'webhook',
  /** The worker asks the platform for updates (Telegram long polling). */
  Poll = 'poll',
  /** The worker holds a socket the platform pushes over (the Discord gateway). */
  Gateway = 'gateway',
}

/**
 * Who answers a connection's platform calls.
 *
 * `mock` is the platform's API faithfully faked — no network, every call recorded as activity — so a
 * preview, a test or an end-to-end run exercises the exact live path without a real bot.
 */
export enum BotTransport {
  Live = 'live',
  Mock = 'mock',
}

export enum BotConnectionStatus {
  /** Saved, not verified yet. */
  Pending = 'pending',
  /** The platform accepted the credentials and the receiver is (or can be) running. */
  Connected = 'connected',
  /** The last verification or receive failed — `lastError` says why. */
  Failed = 'failed',
  /** Switched off by its owner; nothing is received or sent. */
  Disabled = 'disabled',
}

/**
 * What a bot can DO — the platform calls a handler makes, each recorded as one activity.
 *
 * `note` is the exception: it records an activity and makes no platform call, so every connection
 * supports it and no platform descriptor lists it.
 */
export enum BotActionKind {
  Reply = 'reply',
  Send = 'send',
  Delete = 'delete',
  Mute = 'mute',
  Ban = 'ban',
  React = 'react',
  Note = 'note',
}

/** How `botTextHelper.matched` compares a phrase with a message. */
export enum BotTextMatch {
  /** Whole words and whole phrases (consecutive words), Unicode-aware and case-insensitive. */
  Word = 'word',
  /** A case-insensitive substring — also the mode for scripts written without spaces. */
  Contains = 'contains',
}

export enum BotUpdateKind {
  Message = 'message',
  Edited = 'edited',
  Command = 'command',
  Member = 'member',
}

export enum BotChatKind {
  Private = 'private',
  Group = 'group',
  Channel = 'channel',
}

/** The longest identifier (connection, activity, update) the wire accepts. */
export const BOT_ID_MAX = 128

/** What an identifier on the wire may look like — it is also a path segment of the hook URL. */
export const BOT_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'

/** The longest connection label. */
export const BOT_LABEL_MAX = 120

/** The longest message text the simulator accepts. */
export const BOT_TEXT_MAX = 4096

/** The longest single credential value. */
export const BOT_CREDENTIAL_MAX = 4096

/** How many credential keys one connection input may carry. */
export const BOT_CREDENTIALS_MAX = 16

/** What a credential key may look like. */
export const BOT_CREDENTIAL_KEY_PATTERN = '^[A-Za-z][A-Za-z0-9]{0,63}$'

/** The longest free-text field of a simulated chat or sender (title, name, username). */
export const BOT_NAME_MAX = 256

/** The most activity rows one read returns. */
export const BOT_ACTIVITY_LIMIT_MAX = 200

/** The activity rows a read returns when it names no limit. */
export const BOT_ACTIVITY_LIMIT_DEFAULT = 50

/**
 * The permission the MEMBER mount's gate requires (`gates: { alias: OIDC_GATE, params:
 * [BOT_MANAGE_PERMISSION] }`) — who may connect an organization's bots and read its bot activity.
 * In a product whose users work in organizations, an organization's owners hold it by default;
 * otherwise it is only ever granted explicitly.
 */
export const BOT_MANAGE_PERMISSION = 'bot--manage'

/**
 * What each platform needs and can do — the one table every layer reads: the panel draws the
 * credential inputs from it, the server verifies and acts by it, generation picks actions from it.
 *
 * `actions` lists the platform CALLS a connection can make with its required credentials; an
 * optional credential's `enables` adds more (Slack's admin `userToken` adds `delete`). `note` is never
 * listed — it makes no platform call (`botPlatformHelper.actionsOf` answers the full set).
 */
export const BOT_PLATFORMS: Record<BotPlatform, BotPlatformDescriptor> = Object.freeze({
  [BotPlatform.Telegram]: Object.freeze({
    platform: BotPlatform.Telegram,
    title: 'Telegram',
    credentials: Object.freeze([
      Object.freeze({ key: 'token', secret: true, required: true }),
    ]),
    receive: Object.freeze([BotReceiveMode.Webhook, BotReceiveMode.Poll]),
    actions: Object.freeze([
      BotActionKind.Reply, BotActionKind.Send, BotActionKind.Delete, BotActionKind.Mute, BotActionKind.Ban,
      BotActionKind.React,
    ]),
    setup: 'auto',
    docs: 'https://core.telegram.org/bots/tutorial#obtain-your-bot-token',
  }),
  [BotPlatform.WhatsApp]: Object.freeze({
    platform: BotPlatform.WhatsApp,
    title: 'WhatsApp',
    credentials: Object.freeze([
      Object.freeze({ key: 'accessToken', secret: true, required: true }),
      Object.freeze({ key: 'phoneNumberId', secret: false, required: true }),
      Object.freeze({ key: 'appSecret', secret: true, required: true }),
      Object.freeze({ key: 'verifyToken', secret: true, required: true, generated: true }),
    ]),
    receive: Object.freeze([BotReceiveMode.Webhook]),
    actions: Object.freeze([BotActionKind.Reply, BotActionKind.Send, BotActionKind.React]),
    setup: 'manual',
    docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
  }),
  [BotPlatform.Discord]: Object.freeze({
    platform: BotPlatform.Discord,
    title: 'Discord',
    credentials: Object.freeze([
      Object.freeze({ key: 'token', secret: true, required: true }),
      Object.freeze({ key: 'applicationId', secret: false, required: true }),
    ]),
    receive: Object.freeze([BotReceiveMode.Gateway]),
    actions: Object.freeze([
      BotActionKind.Reply, BotActionKind.Send, BotActionKind.Delete, BotActionKind.Mute, BotActionKind.Ban,
      BotActionKind.React,
    ]),
    setup: 'auto',
    docs: 'https://discord.com/developers/docs/quick-start/getting-started',
  }),
  [BotPlatform.Slack]: Object.freeze({
    platform: BotPlatform.Slack,
    title: 'Slack',
    credentials: Object.freeze([
      Object.freeze({ key: 'botToken', secret: true, required: true }),
      Object.freeze({ key: 'signingSecret', secret: true, required: true }),
      Object.freeze({ key: 'userToken', secret: true, required: false, enables: Object.freeze([BotActionKind.Delete]) }),
    ]),
    receive: Object.freeze([BotReceiveMode.Webhook]),
    actions: Object.freeze([BotActionKind.Reply, BotActionKind.Send, BotActionKind.React]),
    setup: 'manual',
    docs: 'https://api.slack.com/apis/events-api',
  }),
}) as Record<BotPlatform, BotPlatformDescriptor>
