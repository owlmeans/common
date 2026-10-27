import { describe, expect, test } from 'bun:test'
import { BOT_PLATFORMS, BotActionKind, BotPlatform, BotReceiveMode, botPlatformHelper } from '../src/index.js'

const ACTIONS = new Set<string>(Object.values(BotActionKind))
const keysOf = (platform: BotPlatform, pick: (field: { required: boolean, generated?: boolean }) => boolean) =>
  BOT_PLATFORMS[platform].credentials.filter(pick).map(field => field.key)

describe('BOT_PLATFORMS', () => {
  test('describes every platform once, its actions all BotActionKinds and never note', () => {
    expect(Object.keys(BOT_PLATFORMS).sort()).toEqual(Object.values(BotPlatform).sort())
    for (const platform of Object.values(BotPlatform)) {
      const descriptor = BOT_PLATFORMS[platform]
      expect(descriptor.platform).toBe(platform)
      expect(descriptor.actions.every(action => ACTIONS.has(action))).toBe(true)
      expect(descriptor.actions).not.toContain(BotActionKind.Note)
      expect(descriptor.credentials.flatMap(field => field.enables ?? []).every(action => ACTIONS.has(action))).toBe(true)
      expect(descriptor.receive.length).toBeGreaterThan(0)
      expect(descriptor.docs.startsWith('https://')).toBe(true)
    }
  })

  test('names the credentials each platform requires', () => {
    expect(keysOf(BotPlatform.Telegram, field => field.required)).toEqual(['token'])
    expect(keysOf(BotPlatform.WhatsApp, field => field.required)).toEqual(['accessToken', 'phoneNumberId', 'appSecret', 'verifyToken'])
    expect(keysOf(BotPlatform.WhatsApp, field => field.generated === true)).toEqual(['verifyToken'])
    expect(keysOf(BotPlatform.Discord, field => field.required)).toEqual(['token', 'applicationId'])
    expect(keysOf(BotPlatform.Slack, field => field.required)).toEqual(['botToken', 'signingSecret'])
    expect(keysOf(BotPlatform.Slack, field => !field.required)).toEqual(['userToken'])
  })

  test('receives as the contract says and is frozen', () => {
    expect(BOT_PLATFORMS[BotPlatform.Telegram].receive).toEqual([BotReceiveMode.Webhook, BotReceiveMode.Poll])
    expect(BOT_PLATFORMS[BotPlatform.WhatsApp].receive).toEqual([BotReceiveMode.Webhook])
    expect(BOT_PLATFORMS[BotPlatform.Discord].receive).toEqual([BotReceiveMode.Gateway])
    expect(BOT_PLATFORMS[BotPlatform.Slack].receive).toEqual([BotReceiveMode.Webhook])
    expect(Object.isFrozen(BOT_PLATFORMS) && Object.isFrozen(BOT_PLATFORMS[BotPlatform.Slack].credentials)).toBe(true)
  })
})

describe('botPlatformHelper', () => {
  test('WhatsApp cannot delete, mute or ban; Telegram and Discord moderate fully; note is always supported', () => {
    for (const kind of [BotActionKind.Delete, BotActionKind.Mute, BotActionKind.Ban]) {
      expect(botPlatformHelper.supports(BotPlatform.WhatsApp, kind)).toBe(false)
      expect(botPlatformHelper.supports(BotPlatform.Telegram, kind)).toBe(true)
      expect(botPlatformHelper.supports(BotPlatform.Discord, kind)).toBe(true)
    }
    for (const platform of Object.values(BotPlatform)) {
      expect(botPlatformHelper.supports(platform, BotActionKind.Note)).toBe(true)
      expect(botPlatformHelper.supports(platform, BotActionKind.Reply)).toBe(true)
    }
  })

  test('Slack deletes only with the admin userToken set', () => {
    expect(botPlatformHelper.supports(BotPlatform.Slack, BotActionKind.Delete, ['botToken', 'signingSecret'])).toBe(false)
    expect(botPlatformHelper.supports(BotPlatform.Slack, BotActionKind.Delete, ['botToken', 'signingSecret', 'userToken'])).toBe(true)
    expect(botPlatformHelper.actionsOf(BotPlatform.Slack, ['userToken']).sort())
      .toEqual([BotActionKind.Reply, BotActionKind.Send, BotActionKind.React, BotActionKind.Delete, BotActionKind.Note].sort())
    expect(botPlatformHelper.supports(BotPlatform.Slack, BotActionKind.Mute, ['userToken'])).toBe(false)
  })
})
