import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser } from '@owlmeans/test-ui'
import { OAUTH_CONSENT_PATH, OAUTH_DEVICE_PATH } from '@owlmeans/oauth'
import { deviceView, open, TIMEOUT } from './helpers.js'

afterAll(async () => { await closeBrowser() })

describe('device screen — a link that already carries the code', () => {
  test('goes straight to the consent screen for that code, normalised', async () => {
    const { page, calls, close } = await open(`${OAUTH_DEVICE_PATH}?user_code=abcd-efgh`, {
      signedIn: true, stubs: { load: { json: deviceView() } },
    })
    try {
      await page.getByTestId('oauth-consent-approve').waitFor({ state: 'visible', timeout: 45_000 })

      const url = new URL(page.url())
      expect(url.pathname).toBe(OAUTH_CONSENT_PATH)
      expect(url.searchParams.get('ref')).toBe('ABCD-EFGH')
      // The typed form is never shown when the code came with the link.
      expect(await page.getByTestId('oauth-device-input').count()).toBe(0)
      expect(calls).toEqual(['GET ABCD-EFGH'])
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('device screen — a bare link', () => {
  test('asks for the code, and cannot be submitted while it is empty', async () => {
    const { page, close } = await open(OAUTH_DEVICE_PATH, { signedIn: true })
    try {
      const input = page.getByTestId('oauth-device-input')
      await input.waitFor({ state: 'visible', timeout: 45_000 })

      expect(await input.getAttribute('placeholder')).toBe('XXXX-XXXX')
      expect(await input.inputValue()).toBe('')
      expect(await page.getByTestId('oauth-device-submit').isDisabled()).toBe(true)

      await input.fill('   ')
      expect(await page.getByTestId('oauth-device-submit').isDisabled()).toBe(true)

      await input.fill('abcd')
      expect(await page.getByTestId('oauth-device-submit').isDisabled()).toBe(false)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a typed code continues to consent the same way a linked one does', async () => {
    const { page, calls, close } = await open(OAUTH_DEVICE_PATH, {
      signedIn: true, stubs: { load: { json: deviceView() } },
    })
    try {
      await page.getByTestId('oauth-device-input').fill('abcdefgh')
      await page.getByTestId('oauth-device-submit').click()
      await page.getByTestId('oauth-consent-approve').waitFor({ state: 'visible', timeout: 45_000 })

      expect(new URL(page.url()).searchParams.get('ref')).toBe('ABCD-EFGH')
      expect(calls).toEqual(['GET ABCD-EFGH'])
    } finally {
      await close()
    }
  }, TIMEOUT)
})
