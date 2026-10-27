import { afterAll, describe, expect, test } from 'bun:test'
import { browserHelper } from '@owlmeans/test-ui'
import { BotMatchMode, BotRuleAction } from '@owlmeans/bot'
import en from '../src/i18n/en.json' with { type: 'json' }
import { choose, connectionOf, open, ruleOf, TIMEOUT, untilCall, type Server } from './helpers.js'

afterAll(async () => { await browserHelper.closeBrowser() })

const server = (rules = [ruleOf()]): Server => call => {
  if (call.method === 'GET' && call.path === 'connections') return { json: [connectionOf(), connectionOf({ id: 'c2', label: 'Second' })] }
  if (call.method === 'GET' && call.path === 'rules') return { json: rules }
  if (call.method === 'POST' && call.path === 'rules') {
    return { json: ruleOf({ ...call.body, id: call.body.id ?? 'r-new' }) }
  }

  return undefined
}

describe('rules panel — the action picker is the kit\'s', () => {
  test('only the actions passed in are offered', async () => {
    const { page, close } = await open({ panel: 'rules', actions: 'delete,warn' }, server())
    try {
      await page.locator('[data-bot-rule="r1"]').waitFor()
      await page.locator('[data-bot-action="add"]').click()
      await page.locator('[data-bot-input="action"]').click()
      const options = await page.locator('[role="option"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-bot-option')))
      expect(options).toEqual([BotRuleAction.Delete, BotRuleAction.Warn])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a kit with one action shows it and asks nothing', async () => {
    const { page, close } = await open({ panel: 'rules', actions: 'reply' }, server([]))
    try {
      await page.locator('[data-bot-rules] [data-bot-empty]').waitFor()
      await page.locator('[data-bot-action="add"]').click()
      const action = page.locator('[data-bot-input="action"]')
      expect(await action.evaluate(node => node.tagName)).toBe('P')
      expect(await action.textContent()).toBe(en['rule-action'].reply)
      // A reply group cannot be saved without its text.
      expect(await page.locator('[data-bot-input="reply"]').count()).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('rules panel — the editor', () => {
  test('keywords become normalized chips, the warning text follows the action, and the save carries it all', async () => {
    const { page, calls, close } = await open({ panel: 'rules', actions: 'delete,warn' }, server([]))
    try {
      await page.locator('[data-bot-rules] [data-bot-empty]').waitFor()
      await page.locator('[data-bot-action="add"]').click()
      await page.locator('[data-bot-input="name"]').fill('Spam')
      const keywords = page.locator('[data-bot-input="keywords"]')
      await keywords.fill('Free  money, casino')
      await keywords.press('Enter')
      await keywords.fill('FREE MONEY')
      await keywords.press('Enter')
      expect(await page.locator('[data-bot-keyword]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-bot-keyword'))))
        .toEqual(['Free money', 'casino'])

      expect(await page.locator('[data-bot-input="reply"]').count()).toBe(0)
      await choose(page, 'action', BotRuleAction.Warn)
      // A warning needs its text before it can be saved.
      expect(await page.locator('[data-bot-action="save"]').isDisabled()).toBe(true)
      await page.locator('[data-bot-input="reply"]').fill('No spam, please.')

      // Try it: the same matcher the bot uses.
      await page.locator('[data-bot-input="try"]').fill('get FREE money now')
      expect(await page.locator('[data-bot-rule-try]').getAttribute('data-bot-rule-try')).toBe('match')
      await page.locator('[data-bot-input="try"]').fill('freedom')
      expect(await page.locator('[data-bot-rule-try]').getAttribute('data-bot-rule-try')).toBe('none')

      await page.locator('[data-bot-input="mode"] [data-bot-option="contains"]').click()
      await page.locator('[data-bot-action="save"]').click()
      const saved = await untilCall(calls, call => call.method === 'POST' && call.path === 'rules')
      expect(saved.body).toEqual({
        connection: null, name: 'Spam', keywords: ['Free money', 'casino'], mode: BotMatchMode.Contains,
        action: BotRuleAction.Warn, reply: 'No spam, please.', enabled: true, order: 1,
      })
      await page.locator('[data-bot-rule="r-new"]').waitFor()
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('with `connection`, the list asks for it, shows its own and the scope-wide groups, and a new group is made for it', async () => {
    const rules = [
      ruleOf({ id: 'own', connection: 'c1', name: 'Own', order: 2 }),
      ruleOf({ id: 'wide', connection: null, name: 'Wide', order: 1 }),
      ruleOf({ id: 'other', connection: 'c2', name: 'Other', order: 3 }),
    ]
    const { page, calls, close } = await open({ panel: 'rules', actions: 'delete', connection: 'c1' }, server(rules))
    try {
      await page.locator('[data-bot-rule="own"]').waitFor()
      expect((await untilCall(calls, call => call.method === 'GET' && call.path === 'rules')).query).toEqual({ connection: 'c1' })
      expect(await page.locator('[data-bot-rule]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-bot-rule'))))
        .toEqual(['wide', 'own'])

      await page.locator('[data-bot-action="add"]').click()
      expect(await page.locator('[data-bot-input="connection"]').getAttribute('data-bot-value')).toBe('c1')
    } finally {
      await close()
    }
  }, TIMEOUT)
})
