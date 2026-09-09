import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

// Browser work does not fit the 5s default: a cold harness compiles the app on first request.
const TIMEOUT = 30_000

afterAll(async () => {
  await closeBrowser()
})

const openMenu = async () => {
  const mounted = await mountComponent({ url: `${HARNESS_URL.replace(/\/$/, '')}/menu` })
  await mounted.page.waitForSelector('#menu-screen')
  await mounted.page.getByTestId('panel-menu').click()
  await mounted.page.waitForSelector('[data-slot="dropdown-menu-content"]')

  return mounted
}

describe('@owlmeans/web-panel — PanelMenu', () => {
  test('a widget row keeps the menu open and its button works', async () => {
    // The whole reason a widget is a ROW and not a `DropdownMenuItem`: an item takes both the
    // focus and the activation, so the click would dismiss the menu before the button's own
    // handler was observed. A "Top up" button that closes the menu instead of charging is the
    // bug this pins.
    const { page, close } = await openMenu()
    try {
      await page.locator('#widget-button').click()
      expect(await page.locator('#widget-count').textContent()).toBe('1')
      expect(await page.locator('[data-slot="dropdown-menu-content"]').count()).toBe(1)
      await page.locator('#widget-button').click()
      expect(await page.locator('#widget-count').textContent()).toBe('2')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a hidden entry takes the separator it orphaned with it', async () => {
    // Two separators frame one hidden entry, and a third trails the list. Filtering the entries
    // alone would render a doubled rule and a trailing one — so exactly ONE survives, between
    // the widget row and the section label.
    const { page, close } = await openMenu()
    try {
      expect(await page.getByText('Secret').count()).toBe(0)
      expect(await page.locator('[data-slot="dropdown-menu-separator"]').count()).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('an alias row is a real link carrying a resolved path', async () => {
    // An `<a>` without `href` is not focusable, does not answer the keyboard, cannot be opened
    // in a new tab and does not carry the `link` role. The path is resolved synchronously, so
    // it is there on the first paint of the content rather than a frame later.
    const { page, close } = await openMenu()
    try {
      const link = page.getByRole('menuitem', { name: 'Dashboard' })
      expect(await link.getAttribute('href')).toBe('/dash')
      const external = page.getByRole('menuitem', { name: 'Docs' })
      expect(await external.getAttribute('href')).toBe('https://owlmeans.com/docs')
      expect(await external.getAttribute('target')).toBe('_blank')
      expect(await external.getAttribute('rel')).toBe('noopener noreferrer')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('an alias row navigates in-app and closes the menu', async () => {
    const { page, close } = await openMenu()
    try {
      await page.getByRole('menuitem', { name: 'Dashboard' }).click()
      await page.waitForSelector('#dash')
      expect(new URL(page.url()).pathname).toBe('/dash')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a submenu renders one level and marks the active entry', async () => {
    const { page, close } = await openMenu()
    try {
      await page.getByRole('menuitem', { name: /Language/ }).hover()
      await page.waitForSelector('[data-slot="dropdown-menu-sub-content"]')
      const current = page.locator('[data-slot="dropdown-menu-sub-content"] [aria-current="true"]')
      expect(await current.textContent()).toContain('English')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the indicator renders on the trigger', async () => {
    const mounted = await mountComponent({ url: `${HARNESS_URL.replace(/\/$/, '')}/menu` })
    try {
      await mounted.page.waitForSelector('#menu-screen')
      // On the trigger itself, not in the content — it has to be visible while the menu is shut.
      expect(await mounted.page.locator('[data-testid="panel-menu"] #menu-indicator').count()).toBe(1)
    } finally {
      await mounted.close()
    }
  }, TIMEOUT)
})
