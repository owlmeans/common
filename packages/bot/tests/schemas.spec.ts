import { describe, expect, test } from 'bun:test'
import {
  BOT_ACTIVITY_LIMIT_MAX, BOT_KEYWORDS_MAX, BotActivityQuerySchema, BotChallengeQuerySchema, BotConnectionInputSchema,
  BotHookParamsSchema, BotIdParamsSchema, BotRuleInputSchema, BotRuleListQuerySchema, BotSimulateInputSchema,
} from '../src/index.js'
import { validatorOf } from './context.js'

describe('connection input', () => {
  const valid = validatorOf(BotConnectionInputSchema)

  test('accepts a minimal and a full input, credentials write-only and clearable', () => {
    expect(valid({ platform: 'telegram', label: 'Community' })).toBe(true)
    expect(valid({
      id: 'conn_1', platform: 'slack', label: 'Office', transport: 'mock', enabled: true,
      credentials: { botToken: 'xoxb-1', signingSecret: 's', userToken: '' },
    })).toBe(true)
  })

  test('refuses an unknown platform, an empty label, a stray key and a malformed credential key', () => {
    expect(valid({ platform: 'viber', label: 'x' })).toBe(false)
    expect(valid({ platform: 'telegram', label: '' })).toBe(false)
    expect(valid({ platform: 'telegram', label: 'x', scope: 'org-1' })).toBe(false)
    expect(valid({ platform: 'telegram', label: 'x', credentials: { 'bad key': 'v' } })).toBe(false)
    expect(valid({ platform: 'telegram', label: 'x', credentials: { token: { value: 'v' } } })).toBe(false)
  })
})

describe('rule input', () => {
  const valid = validatorOf(BotRuleInputSchema)

  test('accepts a rule with keywords and an action, scope-wide (null) or bound to a connection', () => {
    expect(valid({ name: 'Spam', keywords: ['casino'], action: 'delete' })).toBe(true)
    expect(valid({
      id: 'r1', connection: null, name: 'Hours', keywords: ['open', 'hours'], mode: 'contains',
      action: 'reply', reply: 'We open at 9.', instruction: 'Be brief.', enabled: false, order: 2.5,
    })).toBe(true)
    expect(valid({ connection: 'conn_1', name: 'x', keywords: ['k'], action: 'agent' })).toBe(true)
  })

  test('refuses no keywords, too many, an unknown action or mode, and a missing name', () => {
    expect(valid({ name: 'x', keywords: [], action: 'delete' })).toBe(false)
    expect(valid({ name: 'x', keywords: Array.from({ length: BOT_KEYWORDS_MAX + 1 }, (_, n) => `k${n}`), action: 'delete' })).toBe(false)
    expect(valid({ name: 'x', keywords: ['k'], action: 'kick' })).toBe(false)
    expect(valid({ name: 'x', keywords: ['k'], action: 'delete', mode: 'regex' })).toBe(false)
    expect(valid({ keywords: ['k'], action: 'delete' })).toBe(false)
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

  test('the rule list filters by connection only', () => {
    const valid = validatorOf(BotRuleListQuerySchema)

    expect(valid({ connection: 'conn_1' })).toBe(true)
    expect(valid({ scope: 'org-1' })).toBe(false)
  })

  test('the hook names a known platform and a path-safe connection; its handshake query stays open', () => {
    const params = validatorOf(BotHookParamsSchema)
    const query = validatorOf(BotChallengeQuerySchema)

    expect(params({ platform: 'whatsapp', connection: 'conn_1' })).toBe(true)
    expect(params({ platform: 'viber', connection: 'conn_1' })).toBe(false)
    expect(query({ 'hub.mode': 'subscribe', 'hub.verify_token': 't', 'hub.challenge': '123', other: 'x' })).toBe(true)
  })
})
