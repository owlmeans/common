import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { browserHelper } from '@owlmeans/test-ui'
import type { Page } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

/**
 * Visual review material, not an assertion suite: every picker scenario at 1280 and 375, light
 * and dark, written as PNGs for a person to look at. Runs only when `PICKER_SHOTS_DIR` names the
 * directory to write to — `PICKER_SHOTS_DIR=/tmp/shots bun test tests/picker-shots.spec.ts`.
 */
const dir = process.env.PICKER_SHOTS_DIR
const TIMEOUT = 120_000

afterAll(async () => {
  await browserHelper.closeBrowser()
})

interface Shot {
  name: string
  path: string
  phone?: boolean
  dark?: 'class' | 'os'
  act?: (page: Page) => Promise<void>
}

const openMark = async (page: Page): Promise<void> => {
  await page.locator('[data-picker-trigger]').first().click()
  await page.locator('[data-picker-surface]').waitFor()
  await page.waitForTimeout(250)
}

const shots: Shot[] = [
  { name: 'desktop-closed', path: '/picker' },
  { name: 'desktop-open', path: '/picker', act: openMark },
  { name: 'desktop-open-dark', path: '/picker?dark=1', dark: 'class', act: openMark },
  { name: 'desktop-open-os-dark', path: '/picker', dark: 'os', act: openMark },
  { name: 'desktop-closed-dark', path: '/picker?dark=1', dark: 'class' },
  {
    name: 'desktop-search', path: '/picker', act: async page => {
      await openMark(page)
      await page.locator('[data-picker-search]').fill('user')
      await page.waitForTimeout(150)
    },
  },
  {
    name: 'desktop-empty-search', path: '/picker', act: async page => {
      await openMark(page)
      await page.locator('[data-picker-search]').fill('zzzz')
      await page.waitForTimeout(150)
    },
  },
  {
    name: 'desktop-category', path: '/picker', act: async page => {
      await openMark(page)
      await page.locator('[data-picker-category="commerce"]').click()
      await page.waitForTimeout(150)
    },
  },
  {
    name: 'desktop-keyboard', path: '/picker', act: async page => {
      await openMark(page)
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(150)
    },
  },
  {
    name: 'desktop-custom', path: '/picker?custom=1', act: async page => {
      await openMark(page)
      await page.locator('[data-picker-color="custom"]').click()
      await page.locator('[data-picker-hex]').fill('#0f766e')
      await page.waitForTimeout(150)
    },
  },
  {
    name: 'desktop-custom-dark', path: '/picker?custom=1&dark=1', dark: 'class', act: async page => {
      await openMark(page)
      await page.locator('[data-picker-color="custom"]').click()
      await page.locator('[data-picker-hex]').fill('#ff8800')
      await page.waitForTimeout(150)
    },
  },
  {
    name: 'desktop-color-picker', path: '/picker', act: async page => {
      await page.locator('[data-picker-trigger]').nth(1).click()
      await page.locator('[data-picker-surface]').waitFor()
      await page.waitForTimeout(250)
    },
  },
  {
    name: 'desktop-icon-picker', path: '/picker', act: async page => {
      await page.locator('[data-picker-trigger]').nth(2).click()
      await page.locator('[data-picker-surface]').waitFor()
      await page.waitForTimeout(250)
    },
  },
  { name: 'desktop-empty', path: '/picker?empty=1' },
  { name: 'desktop-compact', path: '/picker?compact=1' },
  { name: 'desktop-compact-open', path: '/picker?compact=1', act: openMark },
  {
    name: 'desktop-in-sheet', path: '/picker?inSheet=1', act: async page => {
      await page.locator('#open-sheet').click()
      await page.locator('[data-slot="sheet-content"]').waitFor()
      await page.waitForTimeout(400)
      await openMark(page)
    },
  },
  { name: 'desktop-inline', path: '/picker?inline=1&custom=1' },
  { name: 'desktop-bare', path: '/picker?bare=1' },
  { name: 'phone-closed', path: '/picker', phone: true },
  { name: 'phone-open', path: '/picker', phone: true, act: openMark },
  { name: 'phone-open-dark', path: '/picker?dark=1', dark: 'class', phone: true, act: openMark },
  {
    name: 'phone-scrolled', path: '/picker', phone: true, act: async page => {
      await openMark(page)
      await page.locator('[data-picker-surface] [data-picker-scroll]').evaluate(element => { element.scrollTop = 420 })
      await page.waitForTimeout(150)
    },
  },
  {
    name: 'phone-custom', path: '/picker?custom=1', phone: true, act: async page => {
      await openMark(page)
      await page.locator('[data-picker-color="custom"]').click()
      await page.waitForTimeout(150)
    },
  },
  {
    name: 'phone-color-picker', path: '/picker', phone: true, act: async page => {
      await page.locator('[data-picker-trigger]').nth(1).click()
      await page.locator('[data-picker-surface]').waitFor()
      await page.waitForTimeout(250)
    },
  },
  { name: 'phone-inline', path: '/picker?inline=1', phone: true },
  {
    name: 'phone-in-sheet', path: '/picker?inSheet=1', phone: true, act: async page => {
      await page.locator('#open-sheet').click()
      await page.locator('[data-slot="sheet-content"]').waitFor()
      await page.waitForTimeout(400)
      await openMark(page)
    },
  },
  { name: 'phone-empty', path: '/picker?empty=1', phone: true, act: openMark },
  { name: 'phone-compact', path: '/picker?compact=1', phone: true },
]

describe.skipIf(dir == null)('@owlmeans/web-panel/picker — screenshots', () => {
  test('every scenario', async () => {
    const out = dir ?? ''
    mkdirSync(out, { recursive: true })
    const browser = await browserHelper.launchBrowser()
    for (const shot of shots) {
      const context = await browser.newContext(shot.phone === true
        ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
        : { viewport: { width: 1280, height: 800 } })
      const page = await context.newPage()
      try {
        if (shot.dark === 'os') {
          await page.emulateMedia({ colorScheme: 'dark' })
        }
        await page.goto(`${HARNESS_URL.replace(/\/$/, '')}${shot.path}`, { waitUntil: 'domcontentloaded' })
        await page.locator('#picker').waitFor()
        await shot.act?.(page)
        await page.screenshot({ path: join(out, `${shot.name}.png`) })
      } finally {
        await context.close()
      }
    }
    expect(shots.length).toBeGreaterThan(0)
  }, TIMEOUT * 3)
})
