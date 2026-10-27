import { afterAll, describe, expect, test } from 'bun:test'
import { browserHelper } from '@owlmeans/test-ui'
import { BotConnectionStatus, BotPlatform, BotReceiveMode, BotTransport } from '@owlmeans/bot'
import en from '../src/i18n/en.json' with { type: 'json' }
import { choose, connectionOf, fieldsOn, open, refusal, TIMEOUT, untilCall, type Server } from './helpers.js'

afterAll(async () => { await browserHelper.closeBrowser() })

/** A server with a fixed list that echoes a saved connection back as stored. */
const listing = (items = [connectionOf()]): Server => call => {
  if (call.method === 'GET' && call.path === 'connections') return { json: items }
  if (call.method === 'POST' && call.path === 'connections') {
    const { credentials, ...rest } = call.body as Record<string, unknown> & { credentials?: Record<string, string> }
    return {
      json: connectionOf({
        id: (rest.id as string | undefined) ?? 'c-new', ...rest as object,
        credentialsSet: Object.keys(credentials ?? {}),
      }),
    }
  }

  return undefined
}

describe('connections panel — the form follows the platform descriptor', () => {
  test('every platform draws exactly its typed credentials, secrets masked, the generated one announced', async () => {
    const { page, close } = await open({ panel: 'connections' }, listing([]))
    try {
      await page.locator('[data-bot-connections] [data-bot-empty]').waitFor()
      await page.locator('[data-bot-action="add"]').click()

      expect(await fieldsOn(page)).toEqual(['token'])
      expect(await page.locator('[data-bot-field="token"]').getAttribute('type')).toBe('password')

      await choose(page, 'platform', BotPlatform.WhatsApp)
      expect(await fieldsOn(page)).toEqual(['accessToken', 'phoneNumberId', 'appSecret'])
      expect(await page.locator('[data-bot-field="phoneNumberId"]').getAttribute('type')).toBe('text')
      expect(await page.locator('[data-bot-field="appSecret"]').getAttribute('type')).toBe('password')
      expect(await page.locator('[data-bot-generated="verifyToken"]').count()).toBe(1)

      await choose(page, 'platform', BotPlatform.Discord)
      expect(await fieldsOn(page)).toEqual(['token', 'applicationId'])
      // The invite link is drawn once the application id is typed, with the permissions in it.
      expect(await page.locator('[data-bot-invite]').count()).toBe(0)
      await page.locator('[data-bot-field="applicationId"]').fill('123456789012345678')
      expect(await page.locator('[data-bot-invite]').getAttribute('href'))
        .toContain('client_id=123456789012345678')

      await choose(page, 'platform', BotPlatform.Slack)
      expect(await fieldsOn(page)).toEqual(['botToken', 'signingSecret', 'userToken'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('`platforms` limits the picker: one platform is shown, not chosen', async () => {
    const { page, close } = await open({ panel: 'connections', platforms: 'slack' }, listing([]))
    try {
      await page.locator('[data-bot-connections] [data-bot-empty]').waitFor()
      await page.locator('[data-bot-action="add"]').click()
      const platform = page.locator('[data-bot-input="platform"]')
      expect(await platform.getAttribute('data-bot-value')).toBe(BotPlatform.Slack)
      expect(await platform.evaluate(node => node.tagName)).toBe('P')
      expect(await fieldsOn(page)).toEqual(['botToken', 'signingSecret', 'userToken'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('offers no transport choice: a new connection needs its credentials and the save sends no transport', async () => {
    const { page, calls, close } = await open({ panel: 'connections' }, listing([]))
    try {
      await page.locator('[data-bot-connections] [data-bot-empty]').waitFor()
      await page.locator('[data-bot-action="add"]').click()
      await page.locator('[data-bot-field="token"]').waitFor()
      expect(await page.locator('[data-bot-input="transport"]').count()).toBe(0)
      expect(await page.locator('[data-bot-connection-form] [data-bot-option="mock"]').count()).toBe(0)

      await page.locator('[data-bot-input="label"]').fill('Community bot')
      // The required token is missing, so nothing can be saved yet.
      expect(await page.locator('[data-bot-action="save"]').isDisabled()).toBe(true)
      await page.locator('[data-bot-field="token"]').fill('123456:ABC')
      expect(await page.locator('[data-bot-action="save"]').isDisabled()).toBe(false)
      await page.locator('[data-bot-action="save"]').click()

      const saved = await untilCall(calls, call => call.method === 'POST' && call.path === 'connections')
      expect(saved.body).toEqual({ platform: BotPlatform.Telegram, label: 'Community bot', credentials: { token: '123456:ABC' } })
      await page.locator('[data-bot-connection="c-new"]').waitFor()
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('connections panel — credentials are write-only', () => {
  test('a stored secret is never shown back: the field says "set", blank keeps it, only typed keys are sent', async () => {
    const stored = connectionOf({
      id: 'w1', platform: BotPlatform.WhatsApp, label: 'Bakery', receive: BotReceiveMode.Webhook,
      credentialsSet: ['accessToken', 'phoneNumberId', 'appSecret', 'verifyToken'],
    })
    const { page, calls, close } = await open({ panel: 'connections' }, listing([stored]))
    try {
      await page.locator('[data-bot-connection="w1"] [data-bot-action="edit"]').click()
      for (const key of ['accessToken', 'phoneNumberId', 'appSecret']) {
        const input = page.locator(`[data-bot-field="${key}"]`)
        expect(await input.inputValue()).toBe('')
        expect(await input.getAttribute('placeholder')).toBe(en.form['secret-keep'])
        expect(await page.locator(`[data-bot-credential-set="${key}"]`).count()).toBe(1)
      }

      await page.locator('[data-bot-field="appSecret"]').fill('  rotated-secret  ')
      await page.locator('[data-bot-action="save"]').click()

      const saved = await untilCall(calls, call => call.method === 'POST' && call.path === 'connections')
      expect(saved.body).toEqual({
        id: 'w1', platform: BotPlatform.WhatsApp, label: 'Bakery', credentials: { appSecret: 'rotated-secret' },
      })
      await page.locator('[data-bot-connection-form]').waitFor({ state: 'detached' })
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('connections panel — a connection in the list', () => {
  test('verify shows the bot it found, or the translated refusal', async () => {
    let attempt = 0
    const server: Server = call => {
      if (call.method === 'GET' && call.path === 'connections') return { json: [connectionOf()] }
      if (call.method === 'POST' && call.path === 'connections/c1/verify') {
        attempt++
        return attempt === 1
          ? refusal('BotErrorCredentialsRejected', 'bot:credentials-rejected:Unauthorized', 422)
          : { json: connectionOf({ status: BotConnectionStatus.Connected, identity: { id: '9', username: 'moderator_bot' } }) }
      }

      return undefined
    }
    const { page, close } = await open({ panel: 'connections' }, server)
    try {
      const item = page.locator('[data-bot-connection="c1"]')
      await item.locator('[data-bot-action="verify"]').click()
      const refused = item.locator('[data-bot-verify-error] [data-bot-error]')
      await refused.waitFor()
      expect(await refused.getAttribute('data-bot-error')).toBe('credentials-rejected')
      expect(await refused.textContent()).toContain(en.errors['credentials-rejected'])
      expect(await refused.textContent()).toContain('Unauthorized')

      await item.locator('[data-bot-action="verify"]').click()
      await item.locator('[data-bot-verified]').waitFor()
      expect(await item.locator('[data-bot-verified]').textContent()).toBe('Connected as @moderator_bot.')
      expect(await item.getAttribute('data-bot-status')).toBe(BotConnectionStatus.Connected)
      expect(await item.locator('[data-bot-verify-error]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('server-bot refusals are told by type name or marker; a receiver\'s platform fault reads as the platform\'s refusal', async () => {
    const broken = connectionOf({ status: BotConnectionStatus.Failed, lastError: 'receiver:bot:discord-gateway:4014:disallowed-intents' })
    const server: Server = call => {
      if (call.method === 'GET' && call.path === 'connections') return { json: [broken] }
      if (call.method === 'POST' && call.path === 'connections/c1/verify') {
        // A server-bot class: unknown to the browser, it keeps only its type name across the wire.
        return refusal('BotErrorConnectionDisabled', 'bot:connection-disabled:c1', 409)
      }

      return undefined
    }
    const { page, close } = await open({ panel: 'connections' }, server)
    try {
      const item = page.locator('[data-bot-connection="c1"]')
      const last = item.locator('[data-bot-last-error] [data-bot-error]')
      await last.waitFor()
      expect(await last.getAttribute('data-bot-error')).toBe('platform-refused')
      expect(await last.textContent()).toBe(en.errors['platform-refused'].replace('{{detail}}', '4014:disallowed-intents'))

      await item.locator('[data-bot-action="verify"]').click()
      const refused = item.locator('[data-bot-verify-error] [data-bot-error]')
      await refused.waitFor()
      expect(await refused.getAttribute('data-bot-error')).toBe('connection-disabled')
      expect(await refused.textContent()).toContain(en.errors['connection-disabled'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a manual platform lists its hook URL and setup values with copy buttons; Telegram says what rights to give', async () => {
    const items = [
      connectionOf(),
      connectionOf({
        id: 's1', platform: BotPlatform.Slack, label: 'Office', status: BotConnectionStatus.Connected,
        hookUrl: 'https://app.example.com/api/bot/hook/slack/s1',
        setup: ['Request URL: https://app.example.com/api/bot/hook/slack/s1', 'Subscribe to message.channels events.'],
        credentialsSet: ['botToken', 'signingSecret'],
      }),
      connectionOf({ id: 'm1', label: 'Sandbox', transport: BotTransport.Mock }),
    ]
    const { page, close } = await open({ panel: 'connections' }, listing(items))
    try {
      const slack = page.locator('[data-bot-connection="s1"]')
      await slack.waitFor()
      expect(await slack.locator('[data-bot-copy="hook"]').count()).toBe(1)
      expect(await slack.locator('[data-bot-setup-step="hook"] code').textContent())
        .toBe('https://app.example.com/api/bot/hook/slack/s1')
      // The step repeating the hook URL is not drawn twice; the sentence step has no copy button.
      expect(await slack.locator('[data-bot-setup-step]').count()).toBe(2)
      expect(await slack.locator('[data-bot-copy]').count()).toBe(1)

      expect(await page.locator('[data-bot-connection="c1"] [data-bot-hint="telegram"]').textContent())
        .toContain(en.connections.hint.telegram)
      // A mock connection (made through the API) reaches no platform: no setup, no note, a badge alone.
      const mock = page.locator('[data-bot-connection="m1"]')
      expect(await mock.locator('[data-bot-mock]').count()).toBe(1)
      expect(await mock.locator('[data-bot-setup]').count()).toBe(0)
      expect(await mock.locator('[data-bot-hint]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('switching a connection off saves `enabled: false`; removing asks first', async () => {
    const server: Server = call => {
      if (call.method === 'GET' && call.path === 'connections') return { json: [connectionOf()] }
      if (call.method === 'POST' && call.path === 'connections') {
        return { json: connectionOf({ enabled: false, status: BotConnectionStatus.Disabled }) }
      }
      if (call.method === 'DELETE' && call.path === 'connections/c1') return { json: { id: 'c1' } }

      return undefined
    }
    const { page, calls, close } = await open({ panel: 'connections' }, server)
    try {
      const item = page.locator('[data-bot-connection="c1"]')
      await item.locator('[data-bot-action="toggle"]').click()
      const saved = await untilCall(calls, call => call.method === 'POST' && call.path === 'connections')
      expect(saved.body).toEqual({ id: 'c1', platform: BotPlatform.Telegram, label: 'Moderator', enabled: false })
      await page.locator('[data-bot-connection="c1"][data-bot-enabled="false"]').waitFor()

      await item.locator('[data-bot-action="remove"]').click()
      expect(calls.some(call => call.method === 'DELETE')).toBe(false)
      await page.locator('[data-bot-action="confirm-remove"]').click()
      await untilCall(calls, call => call.method === 'DELETE' && call.path === 'connections/c1')
      await page.locator('[data-bot-connection="c1"]').waitFor({ state: 'detached' })
    } finally {
      await close()
    }
  }, TIMEOUT)
})
