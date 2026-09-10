import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

const TIMEOUT = 30_000

afterAll(async () => {
  await closeBrowser()
})

const open = async () => {
  const mounted = await mountComponent({ url: `${HARNESS_URL}login` })
  await mounted.page.waitForSelector('[data-login-method]')
  // A fresh acceptance for every test: the confirmation is remembered per browser, and a test
  // that inherited the previous one would assert the unblocked path while claiming the other.
  await mounted.page.evaluate(() => { window.localStorage.clear() })
  await mounted.page.reload()
  await mounted.page.waitForSelector('[data-login-method]')

  return mounted
}

describe('@owlmeans/web-panel — the sign-in screen', () => {
  test('offers one control per method, and starts NOTHING on its own', async () => {
    const { page, close } = await open()
    try {
      // `operator` is restricted and the configuration never named it, so it must not appear.
      expect(await page.locator('[data-login-method]').count()).toBe(2)
      expect(await page.locator('[data-login-method="primary"]').count()).toBe(1)
      expect(await page.locator('[data-login-method="operator"]').count()).toBe(0)

      // Nothing left the document. This is requirement one of the whole feature.
      expect(await page.evaluate(() => (window as never as { __loginStarted: string[] }).__loginStarted))
        .toEqual([])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('renders the logo the app supplied and the credit line', async () => {
    const { page, close } = await open()
    try {
      expect(await page.locator('#login-logo').count()).toBe(1)
      const credit = await page.locator('[data-login-credit]').textContent()
      expect(credit).toContain('Powered by OwlMeans')
      expect(credit).toContain('Harness')
      // A copyright NOTICE, not a name: the mark and the year are what make it one.
      expect(credit).toContain(`© ${new Date().getFullYear()} Acme`)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('centres the card in the viewport, rather than stacking it at the top', async () => {
    const { page, close } = await open()
    try {
      const screen = await page.locator('[data-login-screen]').boundingBox()
      const viewport = page.viewportSize()

      // A percentage minimum height resolves against a parent that HAS a height, and the
      // dispatcher renders this screen into a chain with none — so `min-h-full` collapsed the
      // box to its content and left the card at the top of an otherwise empty page.
      expect(screen?.height).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 1)

      // The height on its own is not the requirement — where the CARD ends up is. Asserted from
      // the card's own centre so the test fails on a lost `items-center` too, not only on a lost
      // height, and against the SCREEN box rather than the window because this harness mounts the
      // screen inside the app shell, one header down. A dispatcher renders it as the whole page,
      // where the two coincide.
      const card = await page.locator('[data-login-screen] > *').first().boundingBox()
      const cardCentre = (card?.y ?? 0) + (card?.height ?? 0) / 2
      const screenCentre = (screen?.y ?? 0) + (screen?.height ?? 0) / 2

      expect(Math.abs(cardCentre - screenCentre)).toBeLessThanOrEqual(2)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('an attempt that goes nowhere SAYS so, instead of reading as a dead button', async () => {
    const { page, close } = await open()
    try {
      await page.locator('[data-login-terms]').check()
      expect(await page.locator('[data-login-error]').count()).toBe(0)

      // `secondary` finishes as `Passed` — it ran, and the document did not move. That is a valid
      // answer to a dispatcher, which has a continuation, and a dead end on a screen.
      await page.locator('[data-login-method="secondary"]').click()
      await page.waitForSelector('[data-login-error]', { timeout: 10_000 })

      expect(await page.evaluate(() => (window as never as { __loginStarted: string[] }).__loginStarted))
        .toContain('secondary')
      expect(await page.locator('[data-login-error]').textContent()).toBeTruthy()
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('offers the methods with a pointer cursor', async () => {
    const { page, close } = await open()
    try {
      // The screen renders through the CONSUMER's vendored button, and an older shadcn copy has
      // no cursor rule — so the one control on the page showed an arrow.
      const cursor = await page.locator('[data-login-method]').first()
        .evaluate(node => window.getComputedStyle(node).cursor)

      expect(cursor).toBe('pointer')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('centres the terms confirmation, like every other row in the card', async () => {
    const { page, close } = await open()
    try {
      const align = await page.locator('[data-login-terms]').evaluate(
        node => window.getComputedStyle(node.closest('label') as Element).textAlign
      )

      expect(align).toBe('center')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a click while the terms are unconfirmed starts nothing AND says why', async () => {
    const { page, close } = await open()
    try {
      // `force`, because the control reports itself `aria-disabled` and Playwright's actionability
      // check honours that — which is the point: the button IS clickable (it keeps its pointer
      // events precisely so the refusal can explain itself), it merely announces that acting on it
      // will not proceed. A real user's click lands here too.
      await page.locator('[data-login-method="primary"]').click({ force: true })

      // Nothing started…
      expect(await page.evaluate(() => (window as never as { __loginStarted: string[] }).__loginStarted))
        .toEqual([])
      // …and the reason is announced, rather than the button silently doing nothing. This is why
      // the control carries `aria-disabled` and not `disabled`: a disabled button eats the click.
      expect(await page.locator('[role="alert"]').count()).toBe(1)
      expect(await page.locator('[data-login-method="primary"]').getAttribute('aria-disabled'))
        .toBe('true')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('confirming the terms unblocks the methods', async () => {
    const { page, close } = await open()
    try {
      await page.locator('[data-login-terms]').check()
      await page.locator('[data-login-method="primary"]').click()

      expect(await page.evaluate(() => (window as never as { __loginStarted: string[] }).__loginStarted))
        .toEqual(['primary'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the confirmation is remembered across a reload', async () => {
    const { page, close } = await open()
    try {
      await page.locator('[data-login-terms]').check()
      await page.reload()
      await page.waitForSelector('[data-login-method]')

      expect(await page.locator('[data-login-terms]').isChecked()).toBe(true)
      expect(await page.locator('[data-login-method="primary"]').getAttribute('aria-disabled'))
        .toBe('false')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the terms links point where the configuration says', async () => {
    const { page, close } = await open()
    try {
      const hrefs = await page.locator('a[target="_blank"]').evaluateAll(
        nodes => nodes.map(node => (node as HTMLAnchorElement).href)
      )
      expect(hrefs).toContain('https://example.test/terms')
      expect(hrefs).toContain('https://example.test/privacy')
    } finally {
      await close()
    }
  }, TIMEOUT)
})
