import { describe, expect, test } from 'bun:test'
import {
  BOT_ACTIVITY_LIMIT_MAX, BotActivityQuerySchema, BotChallengeQuerySchema, BotConnectionInputSchema,
  BotHookParamsSchema, BotIdParamsSchema, BotSimulateInputSchema,
} from '../src/index.js'
import { validatorOf } from './context.js'

describe('connection input', () => {
  const valid = validatorOf(BotConnectionInputSchema)

  test('accepts a minimal and a full input, credentials write-only and clearable', () => {
    expect(valid({ platform: 'acme', label: 'Community' })).toBe(true)
    expect(valid({
      id: 'conn_1', platform: 'acme-chat', label: 'Office', transport: 'mock', enabled: true,
      credentials: { botToken: 'token-1', signingSecret: 's', adminToken: '' },
    })).toBe(true)
  })

  test('refuses a malformed platform id, an empty label, a stray key and a malformed credential key', () => {
    expect(valid({ platform: 'Acme Chat', label: 'x' })).toBe(false)
    expect(valid({ platform: '', label: 'x' })).toBe(false)
    expect(valid({ platform: 'acme', label: '' })).toBe(false)
    expect(valid({ platform: 'acme', label: 'x', scope: 'org-1' })).toBe(false)
    expect(valid({ platform: 'acme', label: 'x', credentials: { 'bad key': 'v' } })).toBe(false)
    expect(valid({ platform: 'acme', label: 'x', credentials: { token: { value: 'v' } } })).toBe(false)
  })
})

describe('simulate input', () => {
  const valid = validatorOf(BotSimulateInputSchema)

  test('accepts text with optional partial chat, sender and reply target — platform ids unconstrained', () => {
    expect(valid({ text: 'hello' })).toBe(true)
    expect(valid({
      text: 'buy now', chat: { id: '-1001234', kind: 'group', space: 'T123' },
      sender: { id: '42', username: 'member' }, replyTo: { id: '17', text: 'earlier' },
    })).toBe(true)
  })

  test('refuses empty text, an unknown chat kind and a reply target without id', () => {
    expect(valid({ text: '' })).toBe(false)
    expect(valid({ text: 'x', chat: { kind: 'forum' } })).toBe(false)
    expect(valid({ text: 'x', replyTo: { text: 'earlier' } })).toBe(false)
  })
})

describe('params and queries', () => {
  test('ids are path-safe', () => {
    const valid = validatorOf(BotIdParamsSchema)

    expect(valid({ id: 'conn_1' })).toBe(true)
    expect(valid({ id: '../etc' })).toBe(false)
    expect(valid({ id: '' })).toBe(false)
  })

  test('the activity limit is a whole number from 1 to the cap, coerced from a query string', () => {
    const valid = validatorOf(BotActivityQuerySchema)

    expect(valid({})).toBe(true)
    expect(valid({ connection: 'conn_1', limit: '50' })).toBe(true)
    expect(valid({ limit: BOT_ACTIVITY_LIMIT_MAX })).toBe(true)
    expect(valid({ limit: BOT_ACTIVITY_LIMIT_MAX + 1 })).toBe(false)
    expect(valid({ limit: 0 })).toBe(false)
    expect(valid({ limit: 1.5 })).toBe(false)
  })

  test('the hook names a well-formed platform id and a path-safe connection; its handshake query stays open', () => {
    const params = validatorOf(BotHookParamsSchema)
    const query = validatorOf(BotChallengeQuerySchema)

    expect(params({ platform: 'acme-chat', connection: 'conn_1' })).toBe(true)
    // Any well-formed id passes the schema: a platform with no plugin is the server's to refuse.
    expect(params({ platform: 'other', connection: 'conn_1' })).toBe(true)
    expect(params({ platform: '../acme', connection: 'conn_1' })).toBe(false)
    expect(params({ platform: 'acme', connection: '../etc' })).toBe(false)
    expect(query({ 'mode': 'subscribe', 'token': 't', 'challenge': '123', other: 'x' })).toBe(true)
    expect(query({})).toBe(true)
  })
})
