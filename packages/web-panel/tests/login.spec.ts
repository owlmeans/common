import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mountComponent, browserHelper } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

const TIMEOUT = 30_000

afterAll(async () => {
  await browserHelper.closeBrowser()
})

const open = async (query?: string) => {
  const mounted = await mountComponent({ url: `${HARNESS_URL}login${query ?? ''}` })
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
      expect(await page.locator('[data-login-credit] a[data-login-powered]').getAttribute('href'))
        .toBe('https://owlmeans.com')
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
      // Omitted rather than `"false"`: `aria-disabled={blocked || undefined}` drops the attribute
      // entirely once unblocked, which is what lets a deferred screen (no `blocked` state at all)
      // render the same way with no special case.
      expect(await page.locator('[data-login-method="primary"]').getAttribute('aria-disabled'))
        .toBeNull()
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

  test('login documents and the separate privacy notice follow an explicit live PL/FR locale map', async () => {
    const { page, close } = await open('?terms=localized')
    try {
      for (const key of ['terms', 'billing', 'privacy', 'cookies']) {
        expect(await page.locator(`[data-login-document="${key}"]`).getAttribute('href'))
          .toBe(`https://example.test/pl/${key}`)
      }
      expect(await page.locator('[data-login-privacy] a').count()).toBe(2)
      expect(await page.locator('label:has([data-login-terms]) [data-login-privacy]').count()).toBe(0)
      const revision = await page.locator('[data-login-revised]').textContent()
      await page.locator('#login-language-fr').click()
      for (const key of ['terms', 'billing', 'privacy', 'cookies']) {
        expect(await page.locator(`[data-login-document="${key}"]`).getAttribute('href'))
          .toBe(`https://example.test/fr/${key}`)
      }
      expect(await page.locator('[data-login-revised]').textContent()).toBe(revision)
      expect(await page.locator('[data-login-terms]').count()).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('[data-login-revised] is absent when the configuration never asked to show it', async () => {
    const { page, close } = await open()
    try {
      expect(await page.locator('[data-login-revised]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  describe('with billing, product and custom documents configured', () => {
    test('there is still exactly one [data-login-terms] checkbox', async () => {
      const { page, close } = await open('?terms=extended')
      try {
        expect(await page.locator('[data-login-terms]').count()).toBe(1)
      } finally {
        await close()
      }
    }, TIMEOUT)

    test('[data-login-privacy] renders OUTSIDE the checkbox\'s label', async () => {
      const { page, close } = await open('?terms=extended')
      try {
        expect(await page.locator('label:has([data-login-terms]) [data-login-privacy]').count())
          .toBe(0)
        expect(await page.locator('[data-login-privacy]').count()).toBe(1)
      } finally {
        await close()
      }
    }, TIMEOUT)

    test('[data-login-revised] shows the latest revision date', async () => {
      const { page, close } = await open('?terms=extended')
      try {
        expect(await page.locator('[data-login-revised]').count()).toBe(1)
        expect(await page.locator('[data-login-revised]').textContent()).toContain('2026-01-01')
      } finally {
        await close()
      }
    }, TIMEOUT)

    test('every configured document renders its own [data-login-document] link', async () => {
      const { page, close } = await open('?terms=extended')
      try {
        const hrefByKey = async (key: string) =>
          await page.locator(`[data-login-document="${key}"]`).getAttribute('href')

        expect(await hrefByKey('terms')).toBe('https://example.test/terms')
        expect(await hrefByKey('billing')).toBe('https://example.test/billing')
        expect(await hrefByKey('product')).toBe('https://example.test/product')
        expect(await hrefByKey('custom-a')).toBe('https://example.test/custom-a')
        expect(await hrefByKey('custom-b')).toBe('https://example.test/custom-b')
        // The notice line, not the consented one.
        expect(await hrefByKey('privacy')).toBe('https://example.test/privacy')
      } finally {
        await close()
      }
    }, TIMEOUT)

    test('confirming the single checkbox still unblocks the methods', async () => {
      const { page, close } = await open('?terms=extended')
      try {
        await page.locator('[data-login-terms]').check()
        await page.locator('[data-login-method="primary"]').click()

        expect(await page.evaluate(() => (window as never as { __loginStarted: string[] }).__loginStarted))
          .toEqual(['primary'])
      } finally {
        await close()
      }
    }, TIMEOUT)
  })

  describe('the Terms confirmation deferred to a step', () => {
    test('bound: no checkbox, the privacy notice still renders, and methods are never blocked', async () => {
      const { page, close } = await open('?defer=bound')
      try {
        expect(await page.locator('[data-login-terms]').count()).toBe(0)
        expect(await page.locator('[data-login-privacy]').count()).toBe(1)
        expect(await page.locator('[role="alert"]').count()).toBe(0)

        const disabled = await page.locator('[data-login-method="primary"]').getAttribute('aria-disabled')
        expect(disabled).not.toBe('true')

        await page.locator('[data-login-method="primary"]').click()
        expect(await page.evaluate(() => (window as never as { __loginStarted: string[] }).__loginStarted))
          .toEqual(['primary'])
      } finally {
        await close()
      }
    }, TIMEOUT)

    test('bound + extended documents: still no checkbox, still no blocking', async () => {
      const { page, close } = await open('?defer=bound&terms=extended')
      try {
        expect(await page.locator('[data-login-terms]').count()).toBe(0)
        expect(await page.locator('[data-login-privacy]').count()).toBe(1)

        await page.locator('[data-login-method="primary"]').click()
        expect(await page.evaluate(() => (window as never as { __loginStarted: string[] }).__loginStarted))
          .toEqual(['primary'])
      } finally {
        await close()
      }
    }, TIMEOUT)

    test('unbound: the checkbox stays — a step nobody can reach never removes the confirmation', async () => {
      const { page, close } = await open('?defer=unbound')
      try {
        expect(await page.locator('[data-login-terms]').count()).toBe(1)
        expect(await page.locator('[data-login-method="primary"]').getAttribute('aria-disabled'))
          .toBe('true')
      } finally {
        await close()
      }
    }, TIMEOUT)
  })

  describe('the provider disclosure', () => {
    test('no provider configured: no note, no stage, the ordinary title', async () => {
      const { page, close } = await open()
      try {
        expect(await page.locator('[data-login-provider]').count()).toBe(0)
        expect(await page.locator('[data-login-stage]').count()).toBe(0)
        expect(await page.locator('[data-login-screen] [data-slot="card-title"]').textContent())
          .toBe('Sign in')
      } finally {
        await close()
      }
    }, TIMEOUT)

    test('top: the strip is the FIRST child of the screen and sits at its top edge, full width', async () => {
      const { page, close } = await open('?provider=top')
      try {
        expect(await page.locator('[data-login-provider]').count()).toBe(1)
        expect(await page.locator('[data-login-screen] > :first-child').getAttribute('data-login-provider'))
          .not.toBeNull()
        expect(await page.locator('[data-login-provider]').getAttribute('data-placement')).toBe('top')
        expect(await page.locator('[data-login-provider]').getAttribute('role')).toBe('note')

        const screen = await page.locator('[data-login-screen]').boundingBox()
        const strip = await page.locator('[data-login-provider]').boundingBox()
        expect(Math.abs((strip?.y ?? -1) - (screen?.y ?? 0))).toBeLessThanOrEqual(1)
        expect(Math.abs((strip?.width ?? 0) - (screen?.width ?? 0))).toBeLessThanOrEqual(1)

        // A disclosure, not page chrome: no landmark inside the screen.
        expect(await page.locator('[data-login-screen] header, [data-login-screen] nav').count()).toBe(0)
      } finally {
        await close()
      }
    }, TIMEOUT)

    test('top: names both parties, links to more information and titles the card with the product', async () => {
      const { page, close } = await open('?provider=top')
      try {
        const note = await page.locator('[data-login-provider]').textContent()
        expect(note).toContain('This app is hosted by Harness Hosting on behalf of Harness App.')
        expect(note).toContain('You sign in with Harness IAM.')

        const info = page.locator('[data-login-provider] a[data-login-provider-info]')
        expect(await info.count()).toBe(1)
        expect(await info.getAttribute('href')).toBe('https://example.test/about')
        expect(await info.getAttribute('target')).toBe('_blank')
        expect(await info.getAttribute('rel')).toBe('noopener noreferrer')
        expect(await info.textContent()).toBe('More information')

        expect(await page.locator('[data-login-screen] [data-slot="card-title"]').textContent())
          .toBe('Sign in to Harness App')
      } finally {
        await close()
      }
    }, TIMEOUT)

    test('top: the card is centred within [data-login-stage], with exactly one terms checkbox', async () => {
      const { page, close } = await open('?provider=top')
      try {
        const screen = await page.locator('[data-login-screen]').boundingBox()
        const strip = await page.locator('[data-login-provider]').boundingBox()
        const stage = await page.locator('[data-login-screen] > [data-login-stage]').boundingBox()
        const card = await page.locator('[data-login-stage] > *').first().boundingBox()

        // The stage takes the rest of the screen, below the strip.
        expect(Math.abs((stage?.y ?? 0) - ((strip?.y ?? 0) + (strip?.height ?? 0)))).toBeLessThanOrEqual(1)
        expect(Math.abs(((stage?.y ?? 0) + (stage?.height ?? 0)) - ((screen?.y ?? 0) + (screen?.height ?? 0))))
          .toBeLessThanOrEqual(1)

        const cardCentreY = (card?.y ?? 0) + (card?.height ?? 0) / 2
        const stageCentreY = (stage?.y ?? 0) + (stage?.height ?? 0) / 2
        const cardCentreX = (card?.x ?? 0) + (card?.width ?? 0) / 2
        const stageCentreX = (stage?.x ?? 0) + (stage?.width ?? 0) / 2
        expect(Math.abs(cardCentreY - stageCentreY)).toBeLessThanOrEqual(2)
        expect(Math.abs(cardCentreX - stageCentreX)).toBeLessThanOrEqual(2)

        expect(await page.locator('[data-login-terms]').count()).toBe(1)
        // Inside the card there is no second note.
        expect(await page.locator('[data-login-stage] [data-login-provider]').count()).toBe(0)
      } finally {
        await close()
      }
    }, TIMEOUT)

    test('inline: one note inside the card, under the methods; the screen keeps its ordinary shape', async () => {
      const { page, close } = await open('?provider=inline')
      try {
        expect(await page.locator('[data-login-provider]').count()).toBe(1)
        expect(await page.locator('[data-login-provider]').getAttribute('data-placement')).toBe('inline')
        expect(await page.locator('[data-login-stage]').count()).toBe(0)
        // Inside the card, not a child of the screen.
        expect(await page.locator('[data-login-screen] > [data-login-provider]').count()).toBe(0)
        expect(await page.locator('[data-login-screen] > * [data-login-provider]').count()).toBe(1)

        const note = await page.locator('[data-login-provider]').boundingBox()
        const lastMethod = await page.locator('[data-login-method]').last().boundingBox()
        expect(note?.y ?? 0).toBeGreaterThanOrEqual((lastMethod?.y ?? 0) + (lastMethod?.height ?? 0))

        expect(await page.locator('[data-login-provider]').textContent())
          .toContain('Sign-in is provided by Harness IAM on behalf of Harness App.')
        expect(await page.locator('[data-login-provider] a[data-login-provider-info]').getAttribute('href'))
          .toBe('https://example.test/about')
        expect(await page.locator('[data-login-terms]').count()).toBe(1)

        // Still centred exactly as without a provider.
        const screen = await page.locator('[data-login-screen]').boundingBox()
        const card = await page.locator('[data-login-screen] > *').first().boundingBox()
        const cardCentre = (card?.y ?? 0) + (card?.height ?? 0) / 2
        const screenCentre = (screen?.y ?? 0) + (screen?.height ?? 0) / 2
        expect(Math.abs(cardCentre - screenCentre)).toBeLessThanOrEqual(2)
      } finally {
        await close()
      }
    }, TIMEOUT)
  })
})
