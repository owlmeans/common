import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, withPage } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

const at = (path: string) => new URL(path, HARNESS_URL).toString()

afterAll(async () => { await closeBrowser() })

describe('@owlmeans/web-router — OwlMeans browser routing (chromium e2e)', () => {
  test('renders the index route inside the layout at /', async () => {
    await withPage(async page => {
      await page.goto(HARNESS_URL)
      await page.waitForSelector('#home')
      expect(await page.locator('#layout').isVisible()).toBe(true)
      expect(await page.locator('#home').textContent()).toContain('home-screen')
    })
  })

  test('programmatic navigate resolves nested route, params and search', async () => {
    await withPage(async page => {
      await page.goto(HARNESS_URL)
      await page.waitForSelector('#nav-user')
      await page.click('#nav-user')
      await page.waitForSelector('#user')
      // real browser URL updated via the History API
      expect(new URL(page.url()).pathname).toBe('/users/42')
      expect(new URL(page.url()).search).toBe('?token=abc')
      // nested outlet renders parent + child
      expect(await page.locator('#users').textContent()).toContain('users-screen')
      // useParams + useSearchParams resolve
      expect(await page.locator('#user').textContent()).toBe('user:42:token:abc')
    })
  })

  test('nested index route renders at /users', async () => {
    await withPage(async page => {
      await page.goto(HARNESS_URL)
      await page.waitForSelector('#nav-users')
      await page.click('#nav-users')
      await page.waitForSelector('#users-index')
      expect(new URL(page.url()).pathname).toBe('/users')
      expect(await page.locator('#users-index').textContent()).toContain('users-index-screen')
    })
  })

  test('static segment outranks the :id dynamic sibling', async () => {
    await withPage(async page => {
      await page.goto(at('users/settings'))
      await page.waitForSelector('#settings')
      expect(await page.locator('#settings').textContent()).toContain('settings-screen')
      expect(await page.locator('#user').count()).toBe(0)
    })
  })

  test('deep-links directly to a :param URL (synchronous initial match)', async () => {
    await withPage(async page => {
      await page.goto(at('users/7?token=xyz'))
      await page.waitForSelector('#user')
      expect(await page.locator('#user').textContent()).toBe('user:7:token:xyz')
    })
  })

  test('renders through a component-less group at the top of the chain', async () => {
    await withPage(async page => {
      await page.goto(at('group/leaf'))
      await page.waitForSelector('#leaf')
      expect(await page.locator('#leaf').textContent()).toContain('leaf-screen')
      // the group carries no Component — it must not swallow the whole subtree
      expect(await page.locator('#layout').count()).toBe(0)
    })
  })

  test('outlet falls through a component-less group in the middle of the chain', async () => {
    await withPage(async page => {
      await page.goto(at('users/nested/deep'))
      await page.waitForSelector('#deep')
      expect(await page.locator('#layout').isVisible()).toBe(true)
      expect(await page.locator('#users').textContent()).toContain('users-screen')
      expect(await page.locator('#deep').textContent()).toContain('deep-screen')
    })
  })

  test('browser back/forward restores the matched route', async () => {
    await withPage(async page => {
      await page.goto(HARNESS_URL)
      await page.waitForSelector('#home')
      await page.click('#nav-user')
      await page.waitForSelector('#user')

      await page.goBack()
      await page.waitForSelector('#home')
      expect(new URL(page.url()).pathname).toBe('/')

      await page.goForward()
      await page.waitForSelector('#user')
      expect(new URL(page.url()).pathname).toBe('/users/42')
      expect(await page.locator('#user').textContent()).toBe('user:42:token:abc')
    })
  })
})
