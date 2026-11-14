import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BUNDLE_MANIFEST, CollectKind, createDirectoryCollectSink, createLlmReader, createPageFetcher, createProxyPlugin, PageType,
} from '../src/index.js'
import { gates, liveModels, liveSkip, reason, titled } from './context.js'
import { startHttpProxy, startSocksServer } from './servers.js'

const webSkip = reason(gates.web)
const credentials = { username: 'web', password: 'pw' }
const httpProxy = await startHttpProxy(credentials)
const socks = await startSocksServer(credentials)
afterAll(async () => {
  await Promise.all([httpProxy.stop(), socks.stop()])
})

const EXAMPLE = 'https://example.com/'

describe('@owlmeans/llm-reader — the public web', () => {
  test.skipIf(webSkip != null)(titled('a public page is fetched directly, the guard letting it through', webSkip), async () => {
    const page = await createPageFetcher().fetch({ url: EXAMPLE })
    expect(page.status).toBe(200)
    expect(page.text).toContain('Example Domain')
  }, 30_000)

  test.skipIf(webSkip != null)(titled('HTTPS through an HTTP proxy with credentials: a CONNECT tunnel', webSkip), async () => {
    const before = httpProxy.hits.length
    const page = await createPageFetcher({ plugins: [createProxyPlugin({ proxies: [httpProxy.url] })] }).fetch({ url: EXAMPLE })
    expect(page.text).toContain('Example Domain')
    expect(httpProxy.hits.slice(before)).toEqual(['CONNECT example.com:443'])
  }, 30_000)

  test.skipIf(webSkip != null)(titled('HTTPS through SOCKS5 with credentials: the bridge tunnels it', webSkip), async () => {
    for (const scheme of ['socks5h', 'socks5']) {
      const before = socks.hits.length
      const plugin = createProxyPlugin({ proxies: [socks.url.replace('socks5', scheme)] })
      const page = await createPageFetcher({ plugins: [plugin] }).fetch({ url: EXAMPLE })
      expect(page.text).toContain('Example Domain')
      // socks5h hands the proxy the name; socks5 resolves it here and hands over the address.
      expect(socks.hits.slice(before)[0]).toMatch(scheme === 'socks5h' ? /^CONNECT example\.com:443$/ : /^CONNECT [\d.:a-f]+:443$/)
      await plugin.close()
    }
  }, 60_000)

  const describeSkip = webSkip ?? liveSkip
  test.skipIf(describeSkip != null)(titled('a real article is read and described', describeSkip), async () => {
    const reader = createLlmReader({ models: liveModels('reader-web') })
    const description = await reader.describe('https://en.wikipedia.org/wiki/Tide_pool', { content: 'summary' })
    await reader.close()

    expect([PageType.Article, PageType.Docs, PageType.Other]).toContain(description.pageType)
    expect(description.markdown).toMatch(/tide pool/i)
    expect(description.markdown).toContain('## Summary')
  }, 300_000)

  test.skipIf(webSkip != null)(titled('a real public page is collected as a bundle with its stylesheets and pictures', webSkip), async () => {
    const root = await mkdtemp(join(tmpdir(), 'llm-reader-web-collect-'))
    try {
      const result = await createLlmReader().collect('https://en.wikipedia.org/wiki/Tide_pool', {
        sink: createDirectoryCollectSink(root), limits: { maxAssets: 20 },
      })
      expect(result).toMatchObject({ kind: CollectKind.Bundle, entry: 'wiki/Tide_pool.html', manifest: BUNDLE_MANIFEST })
      const html = await readFile(join(root, 'wiki/Tide_pool.html'), 'utf8')
      expect(html).not.toContain('<script')
      expect(html).toMatch(/tide pool/i)
      expect(result.items.filter(item => item.status === 'written' && item.role !== 'page' && item.role !== 'manifest').length).toBeGreaterThan(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 120_000)
})
