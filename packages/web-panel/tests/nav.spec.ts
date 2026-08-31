import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

// Browser work does not fit the 5s default: a cold harness compiles the app on first request.
const TIMEOUT = 30_000

afterAll(async () => {
  await closeBrowser()
})

const open = async (path: string) => mountComponent({ url: `${HARNESS_URL.replace(/\/$/, '')}${path}` })

describe('@owlmeans/web-panel — two-layer navigation', () => {
  test('a deep link resolves the active section with no history state', async () => {
    // The hard-load case: `location.state` is null here, so the section can only come from
    // the pathname. A menu that highlights nothing on a deep link is the bug this pins.
    const { page, close } = await open('/dash')
    try {
      await page.waitForSelector('#dash')
      expect(await page.locator('header nav').first().isVisible()).toBe(true)
      const active = page.locator('[data-slot="navigation-menu-link"][data-active]')
      expect(await active.textContent()).toBe('Work')
      // Two screens in the section — the side menu renders.
      expect(await page.locator('aside nav button').count()).toBe(2)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a one-screen section renders no side menu', async () => {
    const { page, close } = await open('/prefs')
    try {
      await page.waitForSelector('#prefs')
      expect(await page.locator('aside').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('pressing a section navigates to its first screen', async () => {
    const { page, close } = await open('/prefs')
    try {
      await page.waitForSelector('#prefs')
      await page.getByRole('link', { name: 'Work' }).click()
      await page.waitForSelector('#dash')
      expect(new URL(page.url()).pathname).toBe('/dash')
      expect(await page.locator('aside').count()).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the side menu navigates and marks the current screen', async () => {
    const { page, close } = await open('/dash')
    try {
      await page.waitForSelector('#dash')
      expect(await page.locator('aside button[aria-current="page"]').textContent()).toBe('Dashboard')
      await page.locator('aside').getByRole('button', { name: 'Reports' }).click()
      await page.waitForSelector('#reports')
      expect(await page.locator('aside button[aria-current="page"]').textContent()).toBe('Reports')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('an unlisted nested screen keeps its ancestor section', async () => {
    const { page, close } = await open('/reports')
    try {
      await page.waitForSelector('#reports')
      // Navigating in-app puts an alias the menu does not list into the router state; the
      // section must still resolve, by walking up to the ancestor that IS listed.
      await page.locator('#to-detail').click()
      await page.waitForSelector('#detail')
      const active = page.locator('[data-slot="navigation-menu-link"][data-active]')
      expect(await active.textContent()).toBe('Work')
      expect(await page.locator('aside button[aria-current="page"]').count()).toBe(0)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the footer resolves aliases, keeps literal hrefs, and never prints a raw key', async () => {
    const { page, close } = await open('/dash')
    try {
      await page.waitForSelector('#dash')
      const links = page.locator('footer a')
      expect(await links.count()).toBe(2)
      expect(await links.nth(0).getAttribute('href')).toBe('/dash')
      expect(await links.nth(1).getAttribute('href')).toBe('https://owlmeans.com')
      expect(await links.nth(1).getAttribute('target')).toBe('_blank')
      // No i18n instance is mounted: an unlabelled section falls back to a humanized alias.
      expect(await page.getByRole('link', { name: 'Extra' }).count()).toBe(1)
      expect(await page.locator('footer').textContent()).not.toContain('modules.')
    } finally {
      await close()
    }
  }, TIMEOUT)
})

/**
 * Perceptual lightness of a computed colour, 0 (black) to 1 (white).
 *
 * The theme is authored in `oklch(L C H)` and Chromium hands that back from
 * `getComputedStyle` unchanged — it does not convert to `rgb()`, and neither does a canvas
 * `fillStyle` round-trip — so L is read straight off. `rgb()` still turns up for the
 * transparent case, and is approximated through its luminance.
 *
 * Comparing lightness rather than colour strings is the point: the failure being pinned is
 * not a wrong colour, it is two colours too CLOSE to tell apart, which equality never sees.
 */
const lightness = (value: string): number => {
  const oklch = /^oklch\(\s*([\d.]+%?)/i.exec(value.trim())
  if (oklch != null) {
    const raw = oklch[1]

    return raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw)
  }

  const [r, g, b] = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
  const channel = (c: number): number => {
    const v = c / 255

    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }

  // The cube root maps luminance onto roughly the same perceptual scale as OKLab's L.
  return (0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)) ** (1 / 3)
}

/** The gap below which text stops being readable on its surface — as `ensureReadableTheme`. */
const READABLE = 0.35

describe('@owlmeans/web-panel — the header is its own surface', () => {
  // The harness root carries `bg-primary text-primary-foreground`: a dark application shell,
  // both halves of the pair correct. The header paints `bg-background` over it and is
  // therefore a DIFFERENT surface — a near-white foreground inherited from the root lands on
  // a near-white bar, and every child stating no colour of its own goes invisible. Nothing
  // fails at build or at run time, so this is pinned from outside, on rendered pixels.
  test('header content stays legible when the shell around it is dark', async () => {
    const { page, close } = await open('/dash')
    try {
      await page.waitForSelector('#dash')
      const style = async (selector: string, property: 'color' | 'backgroundColor') =>
        page.locator(selector).first().evaluate(
          (el, prop) => window.getComputedStyle(el)[prop as 'color'], property
        )

      const surface = lightness(await style('header', 'backgroundColor'))
      const legible = async (selector: string) =>
        Math.abs(lightness(await style(selector, 'color')) - surface) >= READABLE

      // The brand and the action slot state no colour of their own, so they are exactly the
      // elements that inherit across the boundary. The action slot is the reported case: a
      // ghost-variant button rendered white on a white bar.
      expect({
        brand: await legible('a.brand'),
        actions: await legible('#action-slot'),
        section: await legible('[data-slot="navigation-menu-link"]'),
      }).toEqual({ brand: true, actions: true, section: true })
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('the header keeps an opaque background of its own', async () => {
    // This is what makes it a separate surface, and therefore what makes the pairing above
    // mandatory rather than redundant: it is sticky, so content scrolls beneath it and a
    // transparent bar would show that content through the menu.
    const { page, close } = await open('/dash')
    try {
      await page.waitForSelector('#dash')
      const background = await page.locator('header').first()
        .evaluate(el => window.getComputedStyle(el).backgroundColor)

      expect(background).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    } finally {
      await close()
    }
  }, TIMEOUT)
})

describe('@owlmeans/web-panel — layout rhythm and link styling', () => {
  test('header, content and footer share one horizontal rhythm', async () => {
    // A content area with a width of its own sits visibly inset from a full-width header, which
    // is what "the screen padding is much narrower than the header" looks like from outside.
    const { page, close } = await open('/prefs')
    try {
      await page.waitForSelector('#prefs')
      const box = async (sel: string) => {
        const b = await page.locator(sel).first().boundingBox()
        if (b == null) throw new Error(`no box for ${sel}`)
        return { x: Math.round(b.x), w: Math.round(b.width) }
      }
      const header = await box('header > div')
      const content = await box('main > div')
      const footer = await box('footer > div')

      expect({ ...content, of: 'content' }).toEqual({ ...header, of: 'content' })
      expect({ ...footer, of: 'footer' }).toEqual({ ...header, of: 'footer' })
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a width-only rhythm override keeps the side padding', async () => {
    // The harness passes `containerClassName="max-w-[1280px]"` — a width and nothing else.
    // `containerClassName` is merged over the shell's default rhythm rather than substituted
    // for it, so `px-4` and `mx-auto` survive an override that never mentioned them. Replacing
    // instead produced a header, content and footer all flush to the window edge.
    const { page, close } = await open('/prefs')
    try {
      await page.waitForSelector('#prefs')
      const padding = async (selector: string) => page.locator(selector).first().evaluate(el => {
        const style = window.getComputedStyle(el)

        return [parseFloat(style.paddingLeft), parseFloat(style.paddingRight)]
      })

      const [header, content, footer] = await Promise.all([
        padding('header > div'), padding('main > div'), padding('footer > div'),
      ])

      expect({
        header: header.every(value => value > 0),
        content: content.every(value => value > 0),
        footer: footer.every(value => value > 0),
      }).toEqual({ header: true, content: true, footer: true })
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('section entries render as links, not buttons', async () => {
    const { page, close } = await open('/dash')
    try {
      await page.waitForSelector('#dash')
      const active = page.locator('[data-slot="navigation-menu-link"][data-active]')
      const style = await active.evaluate(el => {
        const s = window.getComputedStyle(el)
        return { bg: s.backgroundColor, radius: s.borderTopLeftRadius, deco: s.textDecorationLine }
      })
      // A filled background plus a radius is the tile look the shadcn primitive ships; a link
      // carries neither, and marks the current section with an underline instead.
      expect(style.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
      expect(style.radius).toBe('0px')
      expect(style.deco).toBe('underline')
    } finally {
      await close()
    }
  }, TIMEOUT)
})
