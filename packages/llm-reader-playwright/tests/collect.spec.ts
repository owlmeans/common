import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { createBrowserHelper } from '@owlmeans/test-ui'
import {
  BUNDLE_MANIFEST, CollectKind, createAddressGuard, createDirectoryCollectSink, createLlmReader, createLocalBundlePlugin,
} from '@owlmeans/llm-reader'
import type { BundleManifest } from '@owlmeans/llm-reader'
import { createPlaywrightRenderer } from '../src/index.js'
// The reader's own fixture servers, and the pinned fetch a consumer injects (test-only reach into file-streams).
import { startCdn, startCollectSite } from '../../llm-reader/tests/servers.js'
import { createPinnedFetch } from '../../file-streams/src/fetch.js'

const skip = existsSync(chromium.executablePath()) ? null : `no Chromium at ${chromium.executablePath()}`
const titled = (name: string, reason: string | null) => reason != null ? `${name} — SKIPPED: ${reason}` : name

const browsers = createBrowserHelper()
const browser = () => browsers.launchBrowser()
const scratch = await mkdtemp(join(tmpdir(), 'llm-reader-playwright-collect-'))
afterAll(async () => {
  await browsers.closeBrowser()
  await rm(scratch, { recursive: true, force: true })
})

describe('@owlmeans/llm-reader-playwright — collected bundles and the pinned fetch', () => {
  test.skipIf(skip != null)(titled('a collected bundle renders offline: imported stylesheets, the external web font, no live network', skip), async () => {
    const cdn = startCdn()
    const site = startCollectSite(cdn.url)
    const root = join(scratch, 'offline')
    await createLlmReader({ allowHosts: ['127.0.0.1'] }).collect(`${site.url}/`, { sink: createDirectoryCollectSink(root) })
    site.stop()
    cdn.stop()

    const bundle = createLocalBundlePlugin({ root })
    const guard = createAddressGuard({ allowHosts: ['127.0.0.1'] })
    const page = await createPlaywrightRenderer({ browser, bundles: [bundle] }).render({ url: bundle.urlOf('index.html'), guard, styles: true })
    expect(page.status).toBe(200)
    expect(page.html).toContain('Collected page')
    const h1 = page.styles!.find(sample => sample.role === 'heading-1')!
    expect(h1.color).toBe('rgb(10, 20, 30)') // from print.css, @imported by site.css
    expect(page.styles!.find(sample => sample.role === 'body')!.fontFamily).toContain('Inter') // the CDN's stylesheet
    // Only the address the bundle left absolute because the guard refused it was tried, and refused again.
    expect(page.blocked).toEqual(['http://169.254.169.254/latest/meta-data/logo.png'])

    // The original URL renders from disk too, through the reader — its servers are gone.
    const offline = createLlmReader({ renderer: createPlaywrightRenderer({ browser }), plugins: [bundle], allowHosts: ['127.0.0.1'] })
    const original = await offline.page(`${site.url}/`, { render: true })
    expect(original.rendered?.html).toContain('Collected page')
    expect(original.rendered?.styles?.find(sample => sample.role === 'heading-1')?.color).toBe('rgb(10, 20, 30)')
  }, 90_000)

  test.skipIf(skip != null)(titled('an app shell is collected as its rendered snapshot: CSSOM rules inlined, scripts gone', skip), async () => {
    const cdn = startCdn()
    const site = startCollectSite(cdn.url)
    try {
      const root = join(scratch, 'shell')
      const reader = createLlmReader({ renderer: createPlaywrightRenderer({ browser }), allowHosts: ['127.0.0.1'] })
      const result = await reader.collect(`${site.url}/shell`, { sink: createDirectoryCollectSink(root) })
      expect(result).toMatchObject({ kind: CollectKind.Bundle, entry: 'shell.html' })
      const html = await readFile(join(root, 'shell.html'), 'utf8')
      expect(html).toContain('Rendered by script')
      expect(html).not.toContain('<script')
      expect(html).toMatch(/<style>[^<]*\.shell-title\s*\{[^}]*color: rgb\(200, 30, 30\)/)
      expect(html).toContain('src="img/logo.png"')
      const manifest = JSON.parse(await readFile(join(root, BUNDLE_MANIFEST), 'utf8')) as BundleManifest
      expect(manifest.rendered).toBe(true)
      expect(manifest.files[`${site.url}/img/logo.png`]).toBe('img/logo.png')
    } finally {
      site.stop()
      cdn.stop()
    }
  }, 90_000)

  test.skipIf(skip != null)(titled('with an injected fetch, guarded sub-requests are fulfilled through it — its pinning refuses what Chromium would load', skip), async () => {
    const cdn = startCdn('127.0.0.2')
    const site = startCollectSite(cdn.url)
    try {
      const fetch = createPinnedFetch({ network: { allowCidrs: ['127.0.0.1/32'] }, resolvers: [], timeouts: { connectMs: 3000, headersMs: 3000, idleMs: 3000 } })
      const guard = createAddressGuard({ allowHosts: ['127.0.0.1', '127.0.0.2'] })
      const page = await createPlaywrightRenderer({ browser, fetch }).render({ url: `${site.url}/`, guard, styles: true })
      expect(page.status).toBe(200)
      expect(page.styles!.find(sample => sample.role === 'heading-1')!.color).toBe('rgb(10, 20, 30)')
      // The guard let the CDN through; the pinned connect refused it.
      expect(page.blocked?.some(url => url.startsWith(cdn.url))).toBe(true)
      expect(cdn.hits).toEqual([])
      expect(site.hits).toContain('/css/print.css')

      // A fulfilled redirect goes back to Chromium, whose next request is routed (and guarded) again.
      const moved = await createPlaywrightRenderer({ browser, fetch }).render({ url: `${site.url}/moved`, guard })
      expect(moved.finalUrl).toBe(`${site.url}/docs/`)
      expect(moved.html).toContain('Docs home')
    } finally {
      site.stop()
      cdn.stop()
    }
  }, 90_000)
})
