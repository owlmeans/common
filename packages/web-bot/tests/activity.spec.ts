import { afterAll, describe, expect, test } from 'bun:test'
import { browserHelper } from '@owlmeans/test-ui'
import { BotActionKind, BotTransport } from '@owlmeans/bot'
import en from '../src/i18n/en.json' with { type: 'json' }
import { activityOf, connectionOf, open, TIMEOUT, untilCall, type Server } from './helpers.js'

afterAll(async () => { await browserHelper.closeBrowser() })

const CONNECTIONS = [
  connectionOf({ id: 'live', label: 'Real bot', transport: BotTransport.Live }),
  connectionOf({ id: 'mock', label: 'Sandbox', transport: BotTransport.Mock }),
]

const ITEMS = [
  activityOf({
    id: 'a3', action: BotActionKind.Delete, ok: false, at: '2026-10-01T10:06:00.000Z', ref: 'g-unknown',
    error: 'Telegram refused: Bad Request: can\'t parse entities.',
    code: 'bot:telegram:400:Bad Request: can\'t parse entities',
  }),
  // A row recorded before `code` existed: the marker is its `error`.
  activityOf({ id: 'a2', action: BotActionKind.Reply, ok: false, error: 'bot:unsupported-action:delete', at: '2026-10-01T10:05:00.000Z', ref: undefined }),
  activityOf({ id: 'a1' }),
]

const answer: Server = call => {
  if (call.method === 'GET' && call.path === 'connections') return { json: CONNECTIONS }
  if (call.method === 'GET' && call.path === 'activity') return { json: ITEMS }

  return undefined
}

describe('activity panel', () => {
  test('lists what the bot did with its outcome, and the limit control asks for that many', async () => {
    const { page, calls, close } = await open({ panel: 'activity', connection: 'mock' }, answer)
    try {
      await page.locator('[data-bot-activity-item="a1"]').waitFor()
      expect(await page.locator('[data-bot-activity-item]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-bot-activity-item'))))
        .toEqual(['a3', 'a2', 'a1'])
      const failed = page.locator('[data-bot-activity-item="a2"]')
      expect(await failed.getAttribute('data-bot-ok')).toBe('false')
      expect(await failed.locator('[data-bot-error]').textContent()).toContain(en.errors['unsupported-action'])
      const refused = page.locator('[data-bot-activity-item="a3"] [data-bot-error]')
      expect(await refused.getAttribute('data-bot-error')).toBe('platform-refused')
      expect(await refused.textContent())
        .toBe(en.errors['platform-refused'].replace('{{detail}}', '400:Bad Request: can\'t parse entities'))
      expect(await page.locator('[data-bot-activity-item="a1"] [data-bot-mock]').count()).toBe(1)
      // No `refLabel`: no row names its ref, and the panel reads nothing but connections and activity.
      expect(await page.locator('[data-bot-activity-ref]').count()).toBe(0)

      const first = await untilCall(calls, call => call.method === 'GET' && call.path === 'activity')
      expect(first.query).toEqual({ connection: 'mock', limit: '20' })
      await page.locator('[data-bot-input="limit"]').click()
      await page.locator('[role="option"][data-bot-option="100"]').click()
      await untilCall(calls, call => call.method === 'GET' && call.path === 'activity' && call.query.limit === '100')
      expect([...new Set(calls.map(call => call.path))].sort()).toEqual(['activity', 'connections'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('with `refLabel`, a row names the record its handler followed — and nothing when the label is unknown', async () => {
    const { page, close } = await open({ panel: 'activity', refs: 'g1:Spam links' }, answer)
    try {
      await page.locator('[data-bot-activity-item="a1"]').waitFor()
      const named = page.locator('[data-bot-activity-item="a1"] [data-bot-activity-ref]')
      expect(await named.getAttribute('data-bot-activity-ref')).toBe('g1')
      expect(await named.textContent()).toBe('Spam links')
      // `g-unknown` has no label, `a2` carries no ref: neither row draws one.
      expect(await page.locator('[data-bot-activity-item="a3"] [data-bot-activity-ref]').count()).toBe(0)
      expect(await page.locator('[data-bot-activity-item="a2"] [data-bot-activity-ref]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)
})
