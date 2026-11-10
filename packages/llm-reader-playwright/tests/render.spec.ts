import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createBrowserHelper } from '@owlmeans/test-ui'
import { lint } from '@google/design.md/linter'
import { createAddressGuard, createLlmReader, createProxyPlugin } from '@owlmeans/llm-reader'
import { createPlaywrightRenderer, makePlaywrightFetchPlugin } from '../src/index.js'
// The reader's own test servers — a fixture site, an HTTP proxy and a SOCKS server.
import { startHttpProxy, startSite, startSocksServer } from '../../llm-reader/tests/servers.js'
import { liveModels, liveSkip } from '../../llm-reader/tests/context.js'

const skip = existsSync(chromium.executablePath()) ? null : `no Chromium at ${chromium.executablePath()}`
const titled = (name: string, reason: string | null) => reason != null ? `${name} — SKIPPED: ${reason}` : name

const site = startSite()
const credentials = { username: 'pw', password: 'right' }
const httpProxy = await startHttpProxy(credentials)
const socks = await startSocksServer(credentials)
const browsers = createBrowserHelper()
/** Chromium sends loopback targets direct unless told otherwise — the fixture site is on loopback. */
const browser = () => browsers.launchBrowser({ args: ['--proxy-bypass-list=<-loopback>'] })
const renderer = createPlaywrightRenderer({ browser })
const guard = createAddressGuard({ allowHosts: ['127.0.0.1'] })

afterAll(async () => {
  site.stop()
  await Promise.all([httpProxy.stop(), socks.stop()])
  await browsers.closeBrowser()
})

describe('@owlmeans/llm-reader-playwright — rendering', () => {
  test.skipIf(skip != null)(titled('an app shell is rendered: content, computed styles, variables, a screenshot', skip), async () => {
    const page = await renderer.render({ url: `${site.url}/app`, guard, styles: true, screenshot: true })

    expect(page.status).toBe(200)
    expect(page.html).toContain('Revenue overview')
    const h1 = page.styles!.find(sample => sample.role === 'heading-1')!
    expect(h1).toMatchObject({ fontSize: '48px', fontWeight: '700' })
    expect(h1.fontFamily).toContain('Fraunces')
    expect(page.variables!['--color-primary']).toBe('#0b5fff')
    expect([...page.screenshot!.subarray(0, 2)]).toEqual([0xff, 0xd8])
  }, 60_000)

  test.skipIf(skip != null)(titled('an HTTP proxy with credentials carries the page and its sub-requests', skip), async () => {
    const lease = await createProxyPlugin({ proxies: [httpProxy.url] }).lease({ url: `${site.url}/app` })
    const before = httpProxy.hits.length
    const page = await renderer.render({ url: `${site.url}/app`, guard, lease })

    expect(page.html).toContain('Revenue overview')
    expect(httpProxy.hits.slice(before)).toContain(`GET ${site.url}/app`)
  }, 60_000)

  test.skipIf(skip != null)(titled('SOCKS5 with credentials: Chromium goes through the bridge', skip), async () => {
    const plugin = createProxyPlugin({ proxies: [socks.url] })
    const lease = await plugin.lease({ url: `${site.url}/app` })
    const before = socks.hits.length
    const page = await renderer.render({ url: `${site.url}/app`, guard, lease })

    expect(page.html).toContain('Revenue overview')
    expect(socks.hits.slice(before)).toContain(`CONNECT 127.0.0.1:${new URL(site.url).port}`)
    await plugin.close()
  }, 60_000)

  test.skipIf(skip != null)(titled('a sub-request into private space is refused and reported; an allowed one is not', skip), async () => {
    const page = await renderer.render({ url: `${site.url}/mixed`, guard })

    expect(page.blocked).toEqual(['http://169.254.169.254/latest/meta-data'])
    expect(site.hits).toContain('/images/logo.svg')
  }, 60_000)

  test.skipIf(skip != null)(titled('as a fetch plugin: every page is rendered inside the reader', skip), async () => {
    const reader = createLlmReader({ allowHosts: ['127.0.0.1'], plugins: [makePlaywrightFetchPlugin(createPlaywrightRenderer({ browser }))] })
    const page = await reader.page(`${site.url}/app`)
    expect(page.rendered?.html).toContain('Revenue overview')
    expect(page.signals().appShell).toBe(false)
  }, 60_000)

  const liveReason = skip ?? liveSkip
  test.skipIf(liveReason != null)(titled('design from computed styles: a DESIGN.md the linter accepts', liveReason), async () => {
    const reader = createLlmReader({ allowHosts: ['127.0.0.1'], renderer, models: liveModels('playwright-live') })
    const report = await reader.design(`${site.url}/`)

    expect(report.facts.source).toBe('both')
    expect(lint(report.markdown).summary.errors).toBe(0)
    expect(Object.values(report.tokens.colors)).toContain('#0B5FFF')
  }, 300_000)
})
