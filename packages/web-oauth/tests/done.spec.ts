import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser } from '@owlmeans/test-ui'
import { OAUTH_DONE_PATH } from '@owlmeans/oauth'
import en from '../src/i18n/en.json' with { type: 'json' }
import { open, TIMEOUT } from './helpers.js'

afterAll(async () => { await closeBrowser() })

describe('done screen', () => {
  test('a device sign-in tells the person to close the window — the application picks it up', async () => {
    const { page, close } = await open(`${OAUTH_DONE_PATH}?kind=device&ref=ABCD-EFGH`)
    try {
      const card = page.getByTestId('oauth-done-card')
      await card.waitFor({ state: 'visible', timeout: 45_000 })

      expect(await card.textContent()).toContain(en.done.title)
      expect(await card.textContent()).toContain(en.done['device-message'])
      expect(en.done['device-message']).toMatch(/close this window/i)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('any other completion says the same, without the device promise', async () => {
    const { page, close } = await open(OAUTH_DONE_PATH)
    try {
      const card = page.getByTestId('oauth-done-card')
      await card.waitFor({ state: 'visible', timeout: 45_000 })

      const text = (await card.textContent()) ?? ''
      expect(text).toContain(en.done.message)
      expect(text).not.toContain(en.done['device-message'])
      expect(en.done.message).toMatch(/close this window/i)
      // Nothing to click and nowhere further to go: the tab's only remaining job is to be closed.
      expect(await page.getByRole('button').count()).toBe(0)
      expect(await page.getByRole('link').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)
})
