import { afterAll, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'
import { COLOR_SCHEME_KEY, colorSchemeBootstrapScript } from '../src/scheme/index.js'

const TIMEOUT = 30_000

afterAll(async () => {
  await closeBrowser()
})

const open = async (path: string) => mountComponent({ url: `${HARNESS_URL.replace(/\/$/, '')}${path}` })

const rootClasses = (page: Awaited<ReturnType<typeof open>>['page']) =>
  page.evaluate(() => ['light', 'dark'].filter(name => document.documentElement.classList.contains(name)))

const stored = (page: Awaited<ReturnType<typeof open>>['page']) =>
  page.evaluate(key => window.localStorage.getItem(key), COLOR_SCHEME_KEY)

describe('@owlmeans/web-panel/scheme — the React-free half', () => {
  test('imports nothing outside its own folder, so a Node build script can load it', () => {
    // It was just imported above by this very (non-browser) test process as well.
    const dir = join(import.meta.dir, '../src/scheme')
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8')
      const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1])
      expect({ file, outside: specifiers.filter(specifier => !specifier.startsWith('./')) })
        .toEqual({ file, outside: [] })
    }
    expect(COLOR_SCHEME_KEY).toBe('owlmeans:color-scheme')
  })

  test('the head bootstrap applies a stored choice, and nothing without one', async () => {
    const { page, close } = await open('/prefs')
    try {
      await page.waitForSelector('#prefs')
      const run = (value: string | null) => page.evaluate(({ key, value, script }) => {
        if (value == null) {
          window.localStorage.removeItem(key)
        } else {
          window.localStorage.setItem(key, value)
        }
        document.documentElement.classList.remove('light', 'dark')
        // Indirect eval — the script runs as the head would run it, in global scope.
        ;(0, eval)(script)
        return ['light', 'dark'].filter(name => document.documentElement.classList.contains(name))
      }, { key: COLOR_SCHEME_KEY, value, script: colorSchemeBootstrapScript() })

      expect(await run('dark')).toEqual(['dark'])
      expect(await run('light')).toEqual(['light'])
      expect(await run(null)).toEqual([])
      expect(await run('sepia')).toEqual([])
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('@owlmeans/web-panel — the footer theme switcher', () => {
  test('renders beside the credit, flips the class on <html> and persists the choice', async () => {
    const { page, close } = await open('/prefs?themeToggle=1')
    try {
      await page.waitForSelector('#prefs')
      const toggle = page.locator('footer > div [data-footer-bottom] [data-theme-toggle]')
      await toggle.waitFor()
      expect(await page.locator('footer [data-footer-bottom] > [data-shell-credit] + [data-theme-toggle]').count()).toBe(1)
      const box = await toggle.boundingBox()
      expect((box?.width ?? 0) >= 44 && (box?.height ?? 0) >= 44).toBe(true)
      expect(await toggle.getAttribute('type')).toBe('button')

      // No choice stored, the system light: the page is light, so the press means "dark".
      expect(await toggle.getAttribute('aria-label')).toBe('Switch to dark mode')
      expect(await rootClasses(page)).toEqual([])

      await toggle.click()
      expect(await rootClasses(page)).toEqual(['dark'])
      expect(await stored(page)).toBe('dark')
      expect(await toggle.getAttribute('aria-label')).toBe('Switch to light mode')

      await toggle.click()
      expect(await rootClasses(page)).toEqual(['light'])
      expect(await stored(page)).toBe('light')

      // The choice outlives the page: a reload comes back to it.
      await page.reload()
      await page.waitForSelector('#prefs')
      await toggle.waitFor()
      expect(await toggle.getAttribute('aria-label')).toBe('Switch to dark mode')
      expect(await rootClasses(page)).toEqual(['light'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('flips the RESOLVED scheme when the system prefers dark and nothing is stored', async () => {
    const { page, close } = await open('/prefs?themeToggle=1')
    try {
      await page.waitForSelector('#prefs')
      const toggle = page.locator('footer [data-theme-toggle]')
      await toggle.waitFor()
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.waitForFunction(() =>
        document.querySelector('[data-theme-toggle]')?.getAttribute('data-scheme') === 'dark')
      expect(await toggle.getAttribute('aria-label')).toBe('Switch to light mode')
      expect(await rootClasses(page)).toEqual([])

      await toggle.click()
      expect(await rootClasses(page)).toEqual(['light'])
      expect(await stored(page)).toBe('light')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('works with a node footer and keeps the footer pins', async () => {
    const { page, close } = await open('/prefs?themeToggle=1&footer=node')
    try {
      await page.waitForSelector('#prefs')
      await page.locator('footer [data-theme-toggle]').waitFor()
      expect(await page.locator('footer > div > [data-footer-content]').count()).toBe(1)
      const container = page.locator('footer > div').first()
      expect(await container.evaluate(el => window.getComputedStyle(el).alignItems)).toBe('center')
      const box = async (sel: string) => {
        const b = await page.locator(sel).first().boundingBox()
        if (b == null) throw new Error(`no box for ${sel}`)
        return { x: Math.round(b.x), w: Math.round(b.width) }
      }
      expect(await box('footer > div')).toEqual(await box('header > div'))
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('absent, the footer is unchanged: no switcher, the credit is the last child', async () => {
    const { page, close } = await open('/prefs')
    try {
      await page.waitForSelector('#prefs')
      await page.locator('footer [data-shell-credit]').waitFor()
      expect(await page.locator('[data-theme-toggle]').count()).toBe(0)
      expect(await page.locator('[data-footer-bottom]').count()).toBe(0)
      expect(await page.locator('footer > div').first()
        .evaluate(el => el.lastElementChild?.hasAttribute('data-shell-credit'))).toBe(true)
    } finally {
      await close()
    }
  }, TIMEOUT)
})
