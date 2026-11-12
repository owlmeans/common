import { afterAll, describe, expect, test } from 'bun:test'
import { browserHelper } from '@owlmeans/test-ui'
import type { Page } from '@owlmeans/test-ui'
import { getBaseHarnessUrl } from './context.js'

// A cold harness compiles the app on its first request.
const TIMEOUT = 30_000

const MOUNTED = await getBaseHarnessUrl('/app/')
const ROOT = await getBaseHarnessUrl('/')

const pathOf = (page: Page) => new URL(page.url()).pathname
const searchOf = (page: Page) => new URL(page.url()).search
const where = async (page: Page) => await page.locator('#where').textContent()

afterAll(async () => { await browserHelper.closeBrowser() })

describe('@owlmeans/web-router — an application served under /app (chromium e2e)', () => {
  test('deep-links to a :param URL under the base, matching the base-less route', async () => {
    await browserHelper.withPage(async page => {
      await page.goto(new URL('/app/users/7?token=xyz', MOUNTED).toString())
      await page.waitForSelector('#user')
      expect(await page.locator('#user').textContent()).toBe('user:7:token:xyz')
      // The router's own location never carries the base.
      expect(await where(page)).toBe('/users/7?token=xyz')
    })
  }, TIMEOUT)

  test('navigate joins the base onto the address: params, search and the object form', async () => {
    await browserHelper.withPage(async page => {
      await page.goto(MOUNTED)
      await page.waitForSelector('#home')
      expect(await where(page)).toBe('/')

      await page.click('#nav-user')
      await page.waitForSelector('#user')
      expect(pathOf(page)).toBe('/app/users/42')
      expect(searchOf(page)).toBe('?token=abc')
      expect(await page.locator('#users').textContent()).toContain('users-screen')
      expect(await page.locator('#user').textContent()).toBe('user:42:token:abc')
      expect(await where(page)).toBe('/users/42?token=abc')

      await page.click('#nav-object')
      await page.waitForSelector('#user:has-text("user:9")')
      expect(`${pathOf(page)}${searchOf(page)}`).toBe('/app/users/9?token=obj')

      await page.click('#nav-replace')
      await page.waitForSelector('#settings')
      expect(pathOf(page)).toBe('/app/users/settings')

      await page.click('#nav-home')
      await page.waitForSelector('#home')
      expect(pathOf(page)).toBe('/app/')
      expect(await where(page)).toBe('/')
    })
  }, TIMEOUT)

  test('useSearchParams rewrites the query and keeps the base', async () => {
    await browserHelper.withPage(async page => {
      await page.goto(new URL('/app/users/42?token=abc', MOUNTED).toString())
      await page.waitForSelector('#user')
      await page.click('#set-token')
      await page.waitForSelector('#user:has-text("token:zzz")')
      expect(`${pathOf(page)}${searchOf(page)}`).toBe('/app/users/42?token=zzz')
      expect(await where(page)).toBe('/users/42?token=zzz')
    })
  }, TIMEOUT)

  test('browser back/forward restores the matched route under the base', async () => {
    await browserHelper.withPage(async page => {
      await page.goto(MOUNTED)
      await page.waitForSelector('#home')
      await page.click('#nav-user')
      await page.waitForSelector('#user')

      await page.goBack()
      await page.waitForSelector('#home')
      expect(pathOf(page)).toBe('/app/')

      await page.goForward()
      await page.waitForSelector('#user')
      expect(pathOf(page)).toBe('/app/users/42')
      expect(await page.locator('#user').textContent()).toBe('user:42:token:abc')
    })
  }, TIMEOUT)

  test('an absolute URL is followed as it is, never prefixed', async () => {
    await browserHelper.withPage(async page => {
      await page.goto(MOUNTED)
      await page.waitForSelector('#nav-out')
      await Promise.all([page.waitForURL(url => url.pathname === '/outside'), page.click('#nav-out')])
      expect(page.url()).toBe(new URL('/outside', MOUNTED).toString())
    })
  }, TIMEOUT)
})

describe('@owlmeans/web-router — the same application at the root keeps today\'s URLs', () => {
  test('navigation, search and back/forward address exactly what they did before', async () => {
    await browserHelper.withPage(async page => {
      await page.goto(ROOT)
      await page.waitForSelector('#home')
      expect(pathOf(page)).toBe('/')

      await page.click('#nav-user')
      await page.waitForSelector('#user')
      expect(`${pathOf(page)}${searchOf(page)}`).toBe('/users/42?token=abc')
      expect(await where(page)).toBe('/users/42?token=abc')

      await page.click('#set-token')
      await page.waitForSelector('#user:has-text("token:zzz")')
      expect(`${pathOf(page)}${searchOf(page)}`).toBe('/users/42?token=zzz')

      await page.click('#nav-object')
      await page.waitForSelector('#user:has-text("user:9")')
      expect(`${pathOf(page)}${searchOf(page)}`).toBe('/users/9?token=obj')

      await page.click('#nav-home')
      await page.waitForSelector('#home')
      expect(pathOf(page)).toBe('/')

      await page.goBack()
      await page.waitForSelector('#user')
      expect(pathOf(page)).toBe('/users/9')
    })
  }, TIMEOUT)

  test('deep links match without any prefix', async () => {
    await browserHelper.withPage(async page => {
      await page.goto(new URL('/users/7?token=xyz', ROOT).toString())
      await page.waitForSelector('#user')
      expect(await page.locator('#user').textContent()).toBe('user:7:token:xyz')
      expect(await where(page)).toBe('/users/7?token=xyz')
    })
  }, TIMEOUT)
})
