import { afterAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { browserHelper, mountComponent } from '@owlmeans/test-ui'
import type { Page } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'
import { PICKER_COLOR_KEYS, PICKER_ICON_CATEGORIES } from '../src/picker/vocabulary.js'

const TIMEOUT = 30_000

afterAll(async () => {
  await browserHelper.closeBrowser()
})

const url = (path: string): string => `${HARNESS_URL.replace(/\/$/, '')}${path}`
const open = async (path: string) => mountComponent({ url: url(path) })

/** A phone: 375px wide, touch, a coarse pointer. */
const phone = async (path: string) => {
  const browser = await browserHelper.launchBrowser()
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await page.goto(url(path), { waitUntil: 'domcontentloaded' })

  return { page, close: () => context.close() }
}

const mark = async (page: Page): Promise<Record<string, string>> =>
  JSON.parse(await page.locator('#mark-value').textContent() ?? '{}') as Record<string, string>

const active = (page: Page) => page.evaluate(() => {
  const element = document.activeElement as HTMLElement | null

  return {
    trigger: element?.hasAttribute('data-picker-trigger') === true,
    search: element?.hasAttribute('data-picker-search') === true,
    icon: element?.getAttribute('data-picker-icon') ?? null,
    inSurface: element?.closest('[data-picker-surface]') != null,
  }
})

/** Focus goes back to the trigger once the surface's focus scope has unmounted — a tick after it detaches. */
const backOnTrigger = async (page: Page): Promise<boolean> => {
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-picker-trigger') === true)

  return (await active(page)).trigger
}

describe('@owlmeans/web-panel/picker — IconColorPicker on a desktop', () => {
  test('opens a popover, commits a colour and an icon, searches, and Esc gives focus back', async () => {
    const { page, close } = await open('/picker')
    try {
      const trigger = page.locator('[data-picker-trigger]').first()
      await trigger.click()
      const surface = page.locator('[data-picker-surface="popover"]')
      await surface.waitFor()
      expect(await surface.locator('[data-picker-swatches] [data-picker-color]').count()).toBe(24)
      // A fine pointer lands in the search field.
      expect((await active(page)).search).toBe(true)

      await surface.locator('[data-picker-color="emerald"]').click()
      expect(await mark(page)).toEqual({ icon: 'rocket', color: 'emerald' })
      expect(await surface.locator('[data-picker-color="emerald"]').getAttribute('aria-pressed')).toBe('true')
      // The composite stays open for its other half.
      expect(await surface.isVisible()).toBe(true)

      await surface.locator('[data-picker-search]').fill('hand')
      expect(await surface.locator('[data-picker-icon]').first().getAttribute('data-picker-icon')).toBe('hand')
      expect(await surface.locator('[data-picker-icon="handshake"]').count()).toBe(1)
      await surface.locator('[data-picker-icon="handshake"]').click()
      expect(await mark(page)).toEqual({ icon: 'handshake', color: 'emerald' })

      await surface.locator('[data-picker-search]').fill('zzzz')
      await surface.locator('[data-picker-empty]').waitFor()

      await page.keyboard.press('Escape')
      await surface.waitFor({ state: 'detached' })
      expect(await backOnTrigger(page)).toBe(true)
      expect(await trigger.getAttribute('aria-label')).toBe('Mark: Handshake · Emerald')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the keyboard walks the grid: ArrowDown from the search, arrows in two dimensions, Enter picks', async () => {
    const { page, close } = await open('/picker')
    try {
      await page.locator('[data-picker-trigger]').first().click()
      await page.locator('[data-picker-surface]').waitFor()
      await page.keyboard.press('ArrowDown')
      // The selected icon is the grid's tab stop.
      expect((await active(page)).icon).toBe('rocket')
      const columns = await page.locator('[data-picker-surface] [data-picker-icon]').evaluateAll(cells => {
        const top = (cells[0] as HTMLElement).offsetTop

        return cells.filter(cell => (cell as HTMLElement).offsetTop === top).length
      })
      expect(columns).toBeGreaterThanOrEqual(8)
      await page.keyboard.press('ArrowRight')
      expect((await active(page)).icon).toBe('lightbulb')
      const before = await page.locator('[data-picker-surface] [data-picker-icon]').evaluateAll(
        cells => cells.map(cell => cell.getAttribute('data-picker-icon'))
      )
      await page.keyboard.press('ArrowDown')
      expect((await active(page)).icon).toBe(before[before.indexOf('lightbulb') + columns])
      await page.keyboard.press('Home')
      expect((await active(page)).icon).toBe('briefcase')
      await page.keyboard.press('Enter')
      expect((await mark(page)).icon).toBe('briefcase')
      // ArrowUp from the first row goes back to the search field.
      await page.keyboard.press('ArrowUp')
      expect((await active(page)).search).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a pick never submits the form, and the parts are plain buttons with names', async () => {
    const { page, close } = await open('/picker')
    try {
      await page.locator('[data-picker-trigger]').nth(1).click()
      const surface = page.locator('[data-picker-surface]')
      await surface.waitFor()
      const buttons = surface.locator('button')
      expect(await buttons.count()).toBeGreaterThan(20)
      expect(await surface.locator('button:not([type="button"]), button:not([aria-label])').count()).toBe(0)
      expect(await page.locator('[data-picker-surface] [data-slot="button"], [data-picker-surface] [data-tone]').count()).toBe(0)
      expect(await page.locator('[data-picker-trigger][data-slot="button"], [data-picker-trigger][data-tone]').count()).toBe(0)
      // A single-purpose picker closes on the pick.
      await surface.locator('[data-picker-color="violet"]').click()
      await surface.waitFor({ state: 'detached' })
      expect(await page.locator('#color-value').textContent()).toBe('violet')

      await page.locator('[data-picker-trigger]').nth(2).click()
      await page.locator('[data-picker-surface] [data-picker-icon="bug"]').click()
      expect(await page.locator('#icon-value').textContent()).toBe('bug')
      expect(await page.locator('#submits').textContent()).toBe('0')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('inside an application\'s own Sheet the popover scrolls with the wheel and keeps focus', async () => {
    const { page, close } = await open('/picker?inSheet=1')
    try {
      await page.locator('#open-sheet').click()
      const sheet = page.locator('[data-slot="sheet-content"]:not([data-picker-surface])')
      await sheet.waitFor()
      await sheet.locator('[data-picker-trigger]').first().click()
      const surface = page.locator('[data-picker-surface="popover"]')
      await surface.waitFor()
      expect((await active(page)).inSurface).toBe(true)

      const body = surface.locator('[data-picker-scroll]')
      const box = await body.boundingBox()
      await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2)
      await page.mouse.wheel(0, 600)
      await page.waitForFunction(
        () => (document.querySelector('[data-picker-surface] [data-picker-scroll]')?.scrollTop ?? 0) > 100
      )
      expect((await active(page)).inSurface).toBe(true)

      await surface.locator('[data-picker-icon="truck"]').click()
      expect((await mark(page)).icon).toBe('truck')
      await page.keyboard.press('Escape')
      await surface.waitFor({ state: 'detached' })
      // Only the picker closed; the application's sheet is still there, focus on the trigger in it.
      expect(await sheet.isVisible()).toBe(true)
      expect(await backOnTrigger(page)).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('@owlmeans/web-panel/picker — on a phone', () => {
  test('opens a bottom sheet with 44px cells, seven icons a row and a Done button', async () => {
    const { page, close } = await phone('/picker')
    try {
      const trigger = page.locator('[data-picker-trigger]').first()
      await trigger.waitFor()
      expect((await trigger.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
      await trigger.tap()
      const surface = page.locator('[data-picker-surface="sheet"]')
      await surface.waitFor()
      // No on-screen keyboard: the search field does not take focus on a touch screen.
      expect((await active(page)).search).toBe(false)

      const sizes = async (selector: string) => surface.locator(selector).evaluateAll(cells => cells.map(cell => {
        const rect = cell.getBoundingClientRect()

        return { width: rect.width, height: rect.height, top: Math.round(rect.top) }
      }))
      const swatches = await sizes('[data-picker-swatches] [data-picker-color]')
      expect(swatches.every(cell => cell.width >= 44 && cell.height >= 44)).toBe(true)
      expect(swatches.filter(cell => cell.top === swatches[0].top).length).toBe(6)
      const icons = await sizes('[data-picker-icon]')
      expect(icons.every(cell => cell.width >= 44 && cell.height >= 44)).toBe(true)
      expect(icons.filter(cell => cell.top === icons[0].top).length).toBe(7)
      const chips = await sizes('[data-picker-category]')
      expect(chips.every(cell => cell.height >= 44)).toBe(true)

      const done = surface.locator('[data-picker-done]')
      const doneBox = await done.boundingBox()
      expect((doneBox?.width ?? 0) >= 44 && (doneBox?.height ?? 0) >= 44).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

      await surface.locator('[data-picker-color="navy"]').tap()
      expect((await mark(page)).color).toBe('navy')
      await done.tap()
      await surface.waitFor({ state: 'detached' })
      expect(await backOnTrigger(page)).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('@owlmeans/web-panel/picker — custom colours', () => {
  test('a valid hex commits normalized; an invalid one is marked and changes nothing', async () => {
    const { page, close } = await open('/picker?custom=1')
    try {
      await page.locator('[data-picker-trigger]').first().click()
      const surface = page.locator('[data-picker-surface]')
      await surface.locator('[data-picker-color="custom"]').click()
      const hex = surface.locator('[data-picker-hex]')
      await hex.fill('#0F766E')
      expect((await mark(page)).color).toBe('#0f766e')
      expect(await surface.locator('[data-picker-color="custom"]').getAttribute('data-selected')).toBe('true')
      expect(await surface.locator('[data-picker-swatches] [aria-pressed="true"]').count()).toBe(0)

      await hex.fill('#12')
      await hex.press('Enter')
      expect(await hex.getAttribute('aria-invalid')).toBe('true')
      expect((await mark(page)).color).toBe('#0f766e')

      await hex.fill('ABC')
      await hex.press('Enter')
      expect(await hex.getAttribute('aria-invalid')).toBeNull()
      expect((await mark(page)).color).toBe('#aabbcc')
      expect(await page.locator('#submits').textContent()).toBe('0')
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('@owlmeans/web-panel/picker — strings', () => {
  test('renders and opens with no PanelApp and no i18n instance, in English', async () => {
    const { page, close } = await open('/picker?bare=1')
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      const trigger = page.locator('[data-picker-trigger]').first()
      await trigger.click()
      const surface = page.locator('[data-picker-surface]')
      await surface.waitFor()
      expect(await surface.locator('[data-picker-search]').getAttribute('placeholder')).toBe('Search icons…')
      expect(await surface.locator('[data-picker-category="all"]').textContent()).toBe('All')
      expect(errors).toEqual([])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('usePickerTranslate reads the packaged bundle in the current language', async () => {
    const browser = await browserHelper.launchBrowser()
    const context = await browser.newContext()
    await context.addInitScript(() => window.localStorage.setItem('owlmeans-lng', 'de'))
    const page = await context.newPage()
    try {
      await page.goto(url('/picker'), { waitUntil: 'domcontentloaded' })
      // Icon names stay English; colour names and chrome translate.
      await page.locator('[data-picker-trigger]').nth(1).waitFor()
      expect(await page.locator('[data-picker-trigger]').nth(1).textContent()).toBe('Petrol')
      await page.locator('[data-picker-trigger]').first().click()
      expect(await page.locator('[data-picker-surface] [data-picker-search]').getAttribute('placeholder')).toBe('Symbole suchen…')
      expect(await page.locator('[data-picker-surface] [data-picker-summary]').textContent()).toBe('Rocket · Indigo')
    } finally {
      await context.close()
    }
  }, TIMEOUT)

  test('the picker bundle carries the same keys in all eight languages', () => {
    const dir = join(import.meta.dir, '../src/components/picker/i18n')
    const keysOf = (value: unknown, prefix = ''): string[] => typeof value === 'object' && value != null
      ? Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix === '' ? key : `${prefix}.${key}`))
      : [prefix]
    const english = JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8')) as Record<string, Record<string, string>>
    expect(Object.keys(english.colors)).toEqual([...PICKER_COLOR_KEYS])
    expect(Object.keys(english.categories)).toEqual([...PICKER_ICON_CATEGORIES])
    for (const language of ['pl', 'ru', 'be', 'uk', 'es', 'de', 'fr']) {
      const bundle = JSON.parse(readFileSync(join(dir, `${language}.json`), 'utf8')) as unknown
      expect({ language, keys: keysOf(bundle) }).toEqual({ language, keys: keysOf(english) })
    }
  })
})

describe('@owlmeans/web-panel/picker — light and dark', () => {
  test('a stored mark follows .dark and the system dark unless .light', async () => {
    const { page, close } = await open('/picker')
    try {
      const tile = page.locator('#samples [data-icon-tile][data-color="blue"]').first()
      await tile.waitFor()
      const look = () => tile.evaluate(element => {
        const style = window.getComputedStyle(element)

        return [style.color, style.backgroundColor]
      })
      const dot = () => page.locator('#samples [data-color-dot][data-color="blue"]')
        .evaluate(element => window.getComputedStyle(element).backgroundColor)
      const classes = (names: string[]) => page.evaluate(list => {
        document.documentElement.classList.remove('light', 'dark')
        document.documentElement.classList.add(...list)
      }, names)
      const LIGHT = ['rgb(29, 78, 216)', 'rgb(219, 234, 254)']
      const DARK = ['rgb(147, 197, 253)', 'rgb(23, 37, 84)']

      expect(await look()).toEqual(LIGHT)
      expect(await dot()).toBe(LIGHT[0])
      await classes(['dark'])
      expect(await look()).toEqual(DARK)
      expect(await dot()).toBe(DARK[0])
      await classes([])
      await page.emulateMedia({ colorScheme: 'dark' })
      expect(await look()).toEqual(DARK)
      await classes(['light'])
      expect(await look()).toEqual(LIGHT)
    } finally {
      await close()
    }
  }, TIMEOUT)
})
