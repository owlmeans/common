import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createBrowserHelper } from '@owlmeans/test-ui'
import type { LlmModel } from '@owlmeans/llm'
import { createAddressGuard, createLlmReader, createLocalBundlePlugin, makeDesignAnalyst } from '@owlmeans/llm-reader'
import type { ReaderModels } from '@owlmeans/llm-reader'
import { createPlaywrightRenderer } from '../src/index.js'
// The reader's own fixture site, for a sub-request the guard lets through.
import { startSite } from '../../llm-reader/tests/servers.js'

const skip = existsSync(chromium.executablePath()) ? null : `no Chromium at ${chromium.executablePath()}`
const titled = (name: string, reason: string | null) => reason != null ? `${name} — SKIPPED: ${reason}` : name

const ROOT = fileURLToPath(new URL('../../llm-reader/tests/fixtures/bundle', import.meta.url))
const site = startSite()
const browsers = createBrowserHelper()
const browser = () => browsers.launchBrowser()
const guard = createAddressGuard({ allowHosts: ['127.0.0.1'] })
const bundle = createLocalBundlePlugin({ root: ROOT })
const home = bundle.urlOf('home.html')
const scratch = await mkdtemp(join(tmpdir(), 'llm-reader-playwright-bundle-'))

/** Facts are measured without a model; one that is never called stands in. */
const unused = new Proxy({}, { get: () => () => { throw new Error('no model call expected') } }) as LlmModel
const models: ReaderModels = { model: () => unused, helper: () => undefined }

afterAll(async () => {
  site.stop()
  await browsers.closeBrowser()
  await rm(scratch, { recursive: true, force: true })
})

describe('@owlmeans/llm-reader-playwright — local bundles', () => {
  test.skipIf(skip != null)(titled('a prototype renders from its bundle: computed styles, variables, a screenshot', skip), async () => {
    const renderer = createPlaywrightRenderer({ browser, bundles: [bundle] })
    const page = await renderer.render({ url: home, guard, styles: true, screenshot: true })

    expect(page.status).toBe(200)
    expect(page.finalUrl).toBe(home)
    expect(page.html).toContain('Care for the whole family')
    const h1 = page.styles!.find(sample => sample.role === 'heading-1')!
    expect(h1).toMatchObject({ fontSize: '44px', fontWeight: '700' })
    expect(h1.fontFamily).toContain('Merriweather')
    expect(page.variables!['--brand']).toBe('#2f7d5b')
    expect(page.blocks!.length).toBeGreaterThan(0)
    expect([...page.screenshot!.subarray(0, 2)]).toEqual([0xff, 0xd8])
    expect(page.blocked).toBeUndefined()
  }, 60_000)

  test.skipIf(skip != null)(titled('through the reader: a bundle URL renders with no proxy and no DNS, and design facts merge it', skip), async () => {
    const reader = createLlmReader({ renderer: createPlaywrightRenderer({ browser }), plugins: [bundle], allowHosts: ['127.0.0.1'] })
    const page = await reader.page(home, { render: true })

    expect(page.rendered?.html).toContain('Book a visit')
    const facts = await makeDesignAnalyst(page, { models, fetcher: reader.fetcher }).facts()
    expect(facts.source).toBe('both')
    expect(facts.variables).toContainEqual({ name: '--brand', value: '#2f7d5b' })
    expect(facts.typeScale.find(type => type.role === 'h1')?.fontSize).toBe('44px')
  }, 60_000)

  test.skipIf(skip != null)(titled('what a bundle page loads from elsewhere still passes the guard', skip), async () => {
    await writeFile(join(scratch, 'index.html'), [
      '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body>',
      `<h1>Mixed</h1><img src="${site.url}/img/logo.svg" alt="allowed"><img src="http://169.254.169.254/latest/meta-data" alt="refused">`,
      '</body></html>',
    ].join(''))
    await writeFile(join(scratch, 'style.css'), 'h1 { font-size: 30px; }')
    const mixed = createLocalBundlePlugin({ root: scratch, origin: 'https://mixed.local' })
    const page = await createPlaywrightRenderer({ browser }).render({ url: mixed.urlOf(''), guard, bundle: mixed, styles: true })

    expect(page.styles!.find(sample => sample.role === 'heading-1')!.fontSize).toBe('30px')
    // The allowed host passed the guard (Chromium's own local-network rules may still stop an https
    // page reaching loopback); the cloud-metadata address was refused and reported.
    expect(page.blocked).toEqual(['http://169.254.169.254/latest/meta-data'])
  }, 60_000)
})
