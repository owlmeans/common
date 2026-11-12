import { describe, expect, test } from 'bun:test'
import {
  BOT_PLATFORM_ID_PATTERN, BotActionKind, BotReceiveMode, botPlatformHelper, type BotPlatformDescriptor,
} from '../src/index.js'

/** A descriptor as a platform plugin declares it — the contract holds no platform of its own. */
const descriptor: BotPlatformDescriptor = Object.freeze({
  platform: 'acme-chat',
  title: 'Acme Chat',
  glyph: 'chat',
  credentials: [
    { key: 'botToken', secret: true, required: true, label: { en: 'Bot token' } },
    { key: 'adminToken', secret: true, required: false, enables: [BotActionKind.Delete], label: { en: 'Admin token' } },
  ],
  receive: [BotReceiveMode.Webhook],
  actions: [BotActionKind.Reply, BotActionKind.Send, BotActionKind.React],
  setup: 'manual',
  docs: 'https://example.com/docs',
  hint: { en: 'Paste the address into the console.' },
})

describe('botPlatformHelper', () => {
  test('answers the descriptor actions plus note, which every connection supports', () => {
    expect(botPlatformHelper.actionsOf(descriptor).sort())
      .toEqual([BotActionKind.Note, BotActionKind.React, BotActionKind.Reply, BotActionKind.Send].sort())
    expect(botPlatformHelper.supports(descriptor, BotActionKind.Note)).toBe(true)
    expect(botPlatformHelper.supports(descriptor, BotActionKind.Mute)).toBe(false)
    expect(botPlatformHelper.supports(descriptor, BotActionKind.Ban)).toBe(false)
  })

  test('an optional credential adds what it enables only when set', () => {
    expect(botPlatformHelper.supports(descriptor, BotActionKind.Delete, ['botToken'])).toBe(false)
    expect(botPlatformHelper.supports(descriptor, BotActionKind.Delete, ['botToken', 'adminToken'])).toBe(true)
    expect(botPlatformHelper.supports(descriptor, BotActionKind.Mute, ['adminToken'])).toBe(false)
  })

  test('a platform with no descriptor (no plugin registered) supports note alone', () => {
    expect(botPlatformHelper.actionsOf(null)).toEqual([BotActionKind.Note])
    expect(botPlatformHelper.supports(undefined, BotActionKind.Reply)).toBe(false)
  })
})

describe('platform ids', () => {
  test('are lower-case path segments, a letter first', () => {
    const pattern = new RegExp(BOT_PLATFORM_ID_PATTERN)

    for (const id of ['acme', 'acme-chat', 'chat2']) {
      expect([id, pattern.test(id)]).toEqual([id, true])
    }
    for (const id of ['', 'Acme', '2chat', 'acme_chat', 'acme/chat', 'a'.repeat(33)]) {
      expect([id, pattern.test(id)]).toEqual([id, false])
    }
  })
})
