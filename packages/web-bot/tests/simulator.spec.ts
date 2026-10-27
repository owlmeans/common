import { afterAll, describe, expect, test } from 'bun:test'
import { browserHelper } from '@owlmeans/test-ui'
import { BotActionKind, BotTransport } from '@owlmeans/bot'
import en from '../src/i18n/en.json' with { type: 'json' }
import { activityOf, connectionOf, open, refusal, ruleOf, TIMEOUT, untilCall, type Server } from './helpers.js'

afterAll(async () => { await browserHelper.closeBrowser() })

const CONNECTIONS = [
  connectionOf({ id: 'live', label: 'Real bot', transport: BotTransport.Live }),
  connectionOf({ id: 'mock', label: 'Sandbox', transport: BotTransport.Mock }),
]

/** The bot reacts once the message was simulated: the activity read after it carries the update. */
const server = (): Server => {
  let simulated = false

  return call => {
    if (call.method === 'GET' && call.path === 'connections') return { json: CONNECTIONS }
    if (call.method === 'GET' && call.path === 'rules') return { json: [ruleOf()] }
    if (call.method === 'GET' && call.path === 'activity') {
      return { json: simulated ? [activityOf({ connection: 'mock' }), activityOf({ id: 'old', update: 'u0' })] : [] }
    }
    if (call.method === 'POST' && call.path === 'connections/mock/simulate') {
      simulated = true
      return { json: { update: 'u1' } }
    }
    if (call.method === 'POST' && call.path === 'connections/live/simulate') {
      return refusal('BotErrorTransportMismatch', 'bot:transport-mismatch:live', 409)
    }

    return undefined
  }
}

describe('simulator', () => {
  test('is not drawn for a live connection — and is, under every mock one, on a composed screen', async () => {
    const live = await open({ panel: 'simulator', connection: 'live' }, server())
    try {
      await untilCall(live.calls, call => call.path === 'connections')
      await live.page.waitForTimeout(500)
      expect(await live.page.locator('[data-bot-simulator]').count()).toBe(0)
    } finally {
      await live.close()
    }

    const { page, close } = await open({ panel: 'screen', mock: '1' }, server())
    try {
      await page.locator('[data-bot-connection="mock"][data-bot-transport="mock"]').first().waitFor()
      await page.locator('[data-bot-simulator]').waitFor()
      expect(await page.locator('[data-bot-simulator]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-bot-connection'))))
        .toEqual(['mock'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('names the groups a message matches, sends it, and shows the activity it caused', async () => {
    const { page, calls, close } = await open({ panel: 'simulator', connection: 'mock' }, server())
    try {
      await page.locator('[data-bot-simulator]').waitFor()
      await page.locator('[data-bot-input="text"]').fill('Free money for everybody')
      expect(await page.locator('[data-bot-simulator-matches]').textContent())
        .toBe(en.simulator.matches.replace('{{names}}', 'Spam'))

      await page.locator('[data-bot-action="simulate"]').click()
      const sent = await untilCall(calls, call => call.method === 'POST' && call.path === 'connections/mock/simulate')
      expect(sent.body).toEqual({ text: 'Free money for everybody', chat: { kind: 'group' } })

      await page.locator('[data-bot-simulator-state="reacted"]').waitFor({ timeout: 20_000 })
      // Only what THIS message caused: the older update's row stays out.
      const rows = page.locator('[data-bot-simulator] [data-bot-activity-item]')
      expect(await rows.count()).toBe(1)
      expect(await rows.first().getAttribute('data-bot-kind')).toBe(BotActionKind.Delete)
      expect(await rows.first().locator('[data-bot-activity-rule]').textContent()).toBe('Group: Spam')
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('activity panel', () => {
  test('lists what the bot did with its outcome, and the limit control asks for that many', async () => {
    const items = [
      activityOf({
        id: 'a3', action: BotActionKind.Delete, ok: false, at: '2026-10-01T10:06:00.000Z',
        error: 'Telegram refused: Bad Request: can\'t parse entities.',
        code: 'bot:telegram:400:Bad Request: can\'t parse entities',
      }),
      // A row recorded before `code` existed: the marker is its `error`.
      activityOf({ id: 'a2', action: BotActionKind.Reply, ok: false, error: 'bot:unsupported-action:delete', at: '2026-10-01T10:05:00.000Z' }),
      activityOf({ id: 'a1' }),
    ]
    const answer: Server = call => {
      if (call.method === 'GET' && call.path === 'connections') return { json: CONNECTIONS }
      if (call.method === 'GET' && call.path === 'rules') return { json: [ruleOf()] }
      if (call.method === 'GET' && call.path === 'activity') return { json: items }

      return undefined
    }
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

      const first = await untilCall(calls, call => call.method === 'GET' && call.path === 'activity')
      expect(first.query).toEqual({ connection: 'mock', limit: '20' })
      await page.locator('[data-bot-input="limit"]').click()
      await page.locator('[role="option"][data-bot-option="100"]').click()
      await untilCall(calls, call => call.method === 'GET' && call.path === 'activity' && call.query.limit === '100')
    } finally {
      await close()
    }
  }, TIMEOUT)
})
