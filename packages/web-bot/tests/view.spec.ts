import { describe, expect, test } from 'bun:test'
import { botErrorHelper } from '../src/helpers/error.js'
import { botViewHelper } from '../src/helpers/view.js'
import { DESCRIPTORS } from './descriptors.js'

const [relay, , guild] = DESCRIPTORS

describe('botViewHelper — descriptor-driven view data', () => {
  test('a text in the reader\'s language, its base language, then English, then the fallback', () => {
    const texts = { en: 'Bot token', pl: 'Token bota', 'pt-BR': 'Token do bot' }
    expect(botViewHelper.textOf(texts, 'pl')).toBe('Token bota')
    expect(botViewHelper.textOf(texts, 'pl-PL')).toBe('Token bota')
    expect(botViewHelper.textOf(texts, 'pt-BR')).toBe('Token do bot')
    expect(botViewHelper.textOf(texts, 'de')).toBe('Bot token')
    expect(botViewHelper.textOf({ pl: 'Token bota' }, 'de', 'token')).toBe('token')
    expect(botViewHelper.textOf(undefined, 'en')).toBe('')
  })

  test('the pre-save link fills its params from typed values, else the verified identity, and only when they match', () => {
    expect(botViewHelper.linkOf(guild, { applicationId: ' 123456789 ' })).toBe('https://guild.example/authorize?client_id=123456789&scope=bot')
    expect(botViewHelper.linkOf(guild, {}, '987654321')).toBe('https://guild.example/authorize?client_id=987654321&scope=bot')
    expect(botViewHelper.linkOf(guild, { applicationId: 'not-an-id' })).toBeNull()
    expect(botViewHelper.linkOf(guild, {})).toBeNull()
    expect(botViewHelper.linkOf(relay, { token: 'x' })).toBeNull()
  })

  test('the allowed platforms keep the server\'s order; none allowed (or none registered among them) offers all', () => {
    expect(botViewHelper.platformsOf(DESCRIPTORS, ['workspace', 'relay']).map(entry => entry.platform)).toEqual(['relay', 'workspace'])
    expect(botViewHelper.platformsOf(DESCRIPTORS, ['absent']).length).toBe(DESCRIPTORS.length)
    expect(botViewHelper.platformsOf(DESCRIPTORS).length).toBe(DESCRIPTORS.length)
    expect(botViewHelper.typedCredentialsOf(DESCRIPTORS[1]).map(field => field.key)).toEqual(['accessToken', 'phoneNumberId', 'appSecret'])
  })
})

describe('botErrorHelper — one platform marker, legacy markers by registered id', () => {
  const ids = DESCRIPTORS.map(descriptor => descriptor.platform)

  test('`bot:platform:<id>:…` is the platform\'s refusal; the detail is what the platform said', () => {
    expect(botErrorHelper.keyOf('bot:platform:relay:400:Bad Request', ids)).toBe('platform-refused')
    expect(botErrorHelper.keyOf('receiver:bot:platform:unknown:503:down')).toBe('platform-refused')
    expect(botErrorHelper.detailOf('bot:platform:relay:400:Bad Request')).toBe('400:Bad Request')
  })

  test('a stored marker or type name from before reads as the platform\'s by registered-id prefix — and only then', () => {
    expect(botErrorHelper.keyOf('bot:relay:401:Unauthorized', ids)).toBe('platform-refused')
    expect(botErrorHelper.keyOf('receiver:bot:guild-gateway:4014:disallowed-intents', ids)).toBe('platform-refused')
    expect(botErrorHelper.detailOf('receiver:bot:guild-gateway:4014:disallowed-intents')).toBe('4014:disallowed-intents')
    expect(botErrorHelper.keyOf('bot:relay:401:Unauthorized')).toBe('bot')
    expect(botErrorHelper.keyOf('bot:relayed:401:x', ids)).toBe('bot')
    const legacy = Object.assign(new Error('bot:guild:403:0:Missing Permissions'), { type: 'BotErrorGuildGateway' })
    expect(botErrorHelper.keyOf(legacy, ids)).toBe('platform-refused')
    expect(botErrorHelper.keyOf(Object.assign(new Error('x'), { type: 'BotErrorConnectionDisabled' }), ids)).toBe('connection-disabled')
  })
})
