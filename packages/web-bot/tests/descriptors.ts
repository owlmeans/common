import { BotActionKind, BotReceiveMode, type BotPlatformDescriptor } from '@owlmeans/bot'

const ALL_ACTIONS = [
  BotActionKind.Reply, BotActionKind.Send, BotActionKind.Delete, BotActionKind.Mute, BotActionKind.Ban, BotActionKind.React,
]

/**
 * What a server's `platform.list` answers here — four invented platforms in the four shapes a real
 * plugin takes (this package knows no platform of its own): `relay` an auto-setup token bot, `console`
 * a manual webhook with a generated credential, `guild` a gateway bot with a pre-save invite link,
 * `workspace` a manual webhook whose optional credential enables an action. Texts are complete in
 * English and Polish only, so the language fallback is visible.
 */
export const DESCRIPTORS: BotPlatformDescriptor[] = [
  {
    platform: 'relay', title: 'Relay', glyph: 'send',
    credentials: [{
      key: 'token', secret: true, required: true,
      label: { en: 'Bot token', pl: 'Token bota' }, hint: { en: 'From the relay console: /token.', pl: 'Z konsoli: /token.' },
    }],
    receive: [BotReceiveMode.Webhook, BotReceiveMode.Poll], actions: ALL_ACTIONS, setup: 'auto',
    docs: 'https://relay.example/docs',
    hint: { en: 'Add the bot to your group as an administrator.', pl: 'Dodaj bota do grupy jako administratora.' },
  },
  {
    platform: 'console', title: 'Console', glyph: 'phone',
    credentials: [
      { key: 'accessToken', secret: true, required: true, label: { en: 'Access token' } },
      { key: 'phoneNumberId', secret: false, required: true, label: { en: 'Phone number ID' } },
      { key: 'appSecret', secret: true, required: true, label: { en: 'App secret' } },
      { key: 'verifyToken', secret: true, required: true, generated: true, label: { en: 'Verify token' } },
    ],
    receive: [BotReceiveMode.Webhook], actions: [BotActionKind.Reply, BotActionKind.Send, BotActionKind.React],
    setup: 'manual', docs: 'https://console.example/docs', hint: { en: 'Paste the webhook URL into the console.' },
  },
  {
    platform: 'guild', title: 'Guild', glyph: 'messages',
    credentials: [
      { key: 'token', secret: true, required: true, label: { en: 'Bot token' } },
      { key: 'applicationId', secret: false, required: true, label: { en: 'Application ID' } },
    ],
    receive: [BotReceiveMode.Gateway], actions: ALL_ACTIONS, setup: 'auto', docs: 'https://guild.example/docs',
    hint: { en: 'Invite the bot to your server.' },
    link: {
      kind: 'invite', template: 'https://guild.example/authorize?client_id={applicationId}&scope=bot',
      params: [{ key: 'applicationId', pattern: '^\\d{5,32}$', identity: true }],
      label: { en: 'Invite the bot to a server' }, pending: { en: 'The invite link appears once the application ID is known.' },
    },
  },
  {
    platform: 'workspace', title: 'Workspace', glyph: 'hash',
    credentials: [
      { key: 'botToken', secret: true, required: true, label: { en: 'Bot token' } },
      { key: 'signingSecret', secret: true, required: true, label: { en: 'Signing secret' } },
      { key: 'userToken', secret: true, required: false, enables: [BotActionKind.Delete], label: { en: 'Admin user token' } },
    ],
    receive: [BotReceiveMode.Webhook], actions: [BotActionKind.Reply, BotActionKind.Send, BotActionKind.React],
    setup: 'manual', docs: 'https://workspace.example/docs', hint: { en: 'Paste the URL below as the Request URL.' },
  },
]
