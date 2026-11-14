import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BUNDLE_MANIFEST, CollectKind, CollectRole, CollectStatus, createCollector, createDirectoryCollectSink, createLlmReader,
  createLocalBundlePlugin, createPageFetcher,
} from '../src/index.js'
import type { BundleManifest, CollectItem, CollectSink } from '../src/index.js'
import { FONT, PNG, startCdn, startCollectSite } from './servers.js'

const cdn = startCdn()
const site = startCollectSite(cdn.url)
const scratch = await mkdtemp(join(tmpdir(), 'llm-reader-collect-'))
afterAll(async () => {
  cdn.stop()
  site.stop()
  await rm(scratch, { recursive: true, force: true })
})

const cdnHost = new URL(cdn.url).host.replace(':', '_')
const reader = createLlmReader({ allowHosts: ['127.0.0.1'], timeout: 5000 })
let dirs = 0
const target = (): { root: string, sink: CollectSink } => {
  const root = join(scratch, `run-${++dirs}`)
  return { root, sink: createDirectoryCollectSink(root) }
}
const files = async (root: string): Promise<string[]> =>
  (await readdir(root, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(root.length + 1)).sort()
const byUrl = (items: CollectItem[], suffix: string): CollectItem | undefined => items.find(item => item.url.endsWith(suffix))

describe('@owlmeans/llm-reader — collect', () => {
  test('a page becomes a bundle: stylesheets with @import chains, fonts, pictures, the cross-origin web font, a manifest', async () => {
    const { root, sink } = target()
    const result = await reader.collect(`${site.url}/`, { sink })

    expect(result).toMatchObject({ kind: CollectKind.Bundle, entry: 'index.html', manifest: BUNDLE_MANIFEST })
    const written = await files(root)
    const fontCss = written.find(path => /^external\/[^/]+\/css2-[0-9a-f]{8}\.css$/.test(path))!
    expect(written).toEqual([
      'bundle.json', 'css/print.css', 'css/site.css', `external/${cdnHost}/base.css`, fontCss,
      `external/${cdnHost}/fonts/inter.woff2`, `external/${cdnHost}/img/pattern.png`,
      'favicon.png', 'fonts/local.woff2', 'img/bg.png', 'img/hero.png', 'img/hero.webp', 'img/logo.png', 'img/logo@2x.png',
      'img/pattern.png', 'img/poster.png', 'index.html',
    ].sort())
    expect(new Uint8Array(await readFile(join(root, `external/${cdnHost}/fonts/inter.woff2`)))).toEqual(new Uint8Array(FONT))
    expect(new Uint8Array(await readFile(join(root, 'img/logo.png')))).toEqual(new Uint8Array(PNG))

    const html = await readFile(join(root, 'index.html'), 'utf8')
    // Nothing that runs, navigates or re-bases is kept; the page is UTF-8 now.
    expect(html).not.toMatch(/<script|onload=|onclick=|javascript:|http-equiv|modulepreload|windows-1252/i)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('Café résumé')
    expect(html).toContain('href="css/site.css"')
    expect(html).toMatch(new RegExp(`href="external/${cdnHost}/css2-[0-9a-f]{8}\\.css"`))
    expect(html).toContain('srcset="img/logo.png 1x, img/logo@2x.png 2x"')
    expect(html).toContain('<source srcset="img/hero.webp"')
    expect(html).toContain('url(&quot;img/pattern.png&quot;)')
    expect(html).toContain('.hero { background: url("img/hero.png") }')
    expect(html).toContain('poster="img/poster.png"')
    expect(html).toContain(`href="${site.url}/about"`)
    // What was not kept stays absolute, so the page still names it.
    expect(html).toContain('src="http://169.254.169.254/latest/meta-data/logo.png"')
    expect(html).toContain(`src="${site.url}/img/missing.png"`)

    const siteCss = await readFile(join(root, 'css/site.css'), 'utf8')
    expect(siteCss).toContain('@import url("print.css")')
    expect(siteCss).toContain('url("../img/bg.png")')
    expect(siteCss).toContain('url("../fonts/local.woff2")')
    expect(await readFile(join(root, 'css/print.css'), 'utf8')).toContain('@import url("site.css")')
    const webFont = await readFile(join(root, fontCss), 'utf8')
    expect(webFont).toContain('@import url("base.css")')
    expect(webFont).toContain('url("fonts/inter.woff2")')

    const manifest = JSON.parse(await readFile(join(root, BUNDLE_MANIFEST), 'utf8')) as BundleManifest
    expect(manifest).toMatchObject({ version: 1, url: `${site.url}/`, entry: 'index.html', rendered: false })
    expect(manifest.files[`${site.url}/`]).toBe('index.html')
    expect(manifest.files[`${cdn.url}/fonts/inter.woff2`]).toBe(`external/${cdnHost}/fonts/inter.woff2`)
    expect(manifest.files[`${site.url}/css/print.css`]).toBe('css/print.css')
    expect(manifest.skipped).toContainEqual({ url: 'http://169.254.169.254/latest/meta-data/logo.png', status: CollectStatus.Refused, reason: expect.stringContaining('non-public-address') })
    expect(manifest.skipped).toContainEqual({ url: `${site.url}/img/missing.png`, status: CollectStatus.Failed, reason: 'status-404' })

    expect(byUrl(result.items, '/fonts/local.woff2')).toMatchObject({ role: CollectRole.Font, status: CollectStatus.Written, mime: 'font/woff2' })
    expect(byUrl(result.items, '/img/hero.webp')).toMatchObject({ role: CollectRole.Image, status: CollectStatus.Written })
    expect(result.items[0]).toMatchObject({ role: CollectRole.Page, status: CollectStatus.Written, path: 'index.html' })
    expect(result.items.at(-1)).toMatchObject({ role: CollectRole.Manifest, status: CollectStatus.Written })
    expect(result.files).toBe(17)
    expect(site.hits).not.toContain('/app.js')
  }, 30_000)

  test('limits skip and report, never throw: assets per page, files, bytes of a file and in total', async () => {
    const few = target()
    const assets = await reader.collect(`${site.url}/many`, { sink: few.sink, limits: { maxAssets: 3 } })
    expect(assets.items.filter(item => item.status === CollectStatus.Written && item.role === CollectRole.Image)).toHaveLength(3)
    expect(assets.items.filter(item => item.reason === 'max-assets')).toHaveLength(7)

    const capped = target()
    const total = await reader.collect(`${site.url}/many`, { sink: capped.sink, limits: { maxFiles: 4 } })
    expect(total.items.filter(item => item.status === CollectStatus.Written && item.role !== CollectRole.Manifest)).toHaveLength(4)
    expect(total.items.filter(item => item.reason === 'max-files')).toHaveLength(7)

    const big = target()
    const tooBig = await reader.collect(`${site.url}/files/big.bin`, { sink: big.sink, limits: { maxFileBytes: 1024 * 1024 } })
    expect(tooBig).toMatchObject({ kind: CollectKind.File, files: 0 })
    expect(tooBig.items).toEqual([expect.objectContaining({ status: CollectStatus.Skipped, reason: 'max-file-bytes' })])
    expect(existsSync(big.root) ? await files(big.root) : []).toEqual([])

    // No declared length: the cap is met mid-stream, and the half-written file is gone.
    const streamed = target()
    const midway = await reader.collect(`${site.url}/files/streamed.bin`, { sink: streamed.sink, limits: { maxTotalBytes: 1024 * 1024 } })
    expect(midway.items).toEqual([expect.objectContaining({ status: CollectStatus.Skipped, reason: 'max-total-bytes' })])
    expect(await files(streamed.root)).toEqual([])
  }, 30_000)

  test('a file is streamed under its declared name; a prefix holds everything', async () => {
    const { root, sink } = target()
    const report = await reader.collect(`${site.url}/to-report`, { sink, prefix: 'links/01-report' })
    expect(report).toMatchObject({ kind: CollectKind.File, finalUrl: `${site.url}/files/report`, entry: 'links/01-report/Quarterly Report.pdf', files: 1 })
    expect(report.items[0]).toMatchObject({ mime: 'application/pdf', role: CollectRole.File })
    expect(await readFile(join(root, 'links/01-report/Quarterly Report.pdf'), 'utf8')).toBe('%PDF-1.4 report %%EOF')

    expect((await reader.collect(`${site.url}/files/data`, { sink })).entry).toBe('résumé.txt')
    // A declared name keeps only its last part, so it cannot climb out of its folder.
    expect((await reader.collect(`${site.url}/files/sneaky`, { sink })).entry).toBe('passwd.txt')
    const streamed = await reader.collect(`${site.url}/files/streamed.bin`, { sink })
    expect(streamed.bytes).toBe(48 * 64 * 1024)
    await expect(reader.collect(`${site.url}/files/data`, { sink, prefix: '../out' })).rejects.toThrow('prefix')
  }, 30_000)

  test('a refused or failing link is a result, not an exception', async () => {
    const { sink } = target()
    const refused = await reader.collect('http://10.0.0.1/admin', { sink })
    expect(refused.items).toEqual([expect.objectContaining({ status: CollectStatus.Refused })])
    const missing = await reader.collect(`${site.url}/nope`, { sink })
    expect(missing.items).toEqual([expect.objectContaining({ status: CollectStatus.Failed, reason: 'status-404' })])
  }, 30_000)

  test('a page in hand is bundled too — its assets fetched from where it points', async () => {
    const { root, sink } = target()
    const collector = createCollector({ fetcher: createPageFetcher({ allowHosts: ['127.0.0.1'] }) })
    const result = await collector.bundle({
      url: 'https://drive.example/file/index.html', entry: 'index.html',
      html: `<html><head><link rel="stylesheet" href="${cdn.url}/css2?family=Inter"></head><body><img src="logo.svg"></body></html>`,
    }, { sink })
    expect(result.kind).toBe(CollectKind.Bundle)
    expect((await files(root)).filter(path => path.startsWith('external/'))).toHaveLength(4)
    expect(await readFile(join(root, 'index.html'), 'utf8')).toMatch(new RegExp(`href="external/${cdnHost}/css2-[0-9a-f]{8}\\.css"`))
  }, 30_000)

  test('a collected bundle reads offline: its synthetic origin, its original URLs, its external ones', async () => {
    const otherCdn = startCdn()
    const otherSite = startCollectSite(otherCdn.url)
    const { root, sink } = target()
    await reader.collect(`${otherSite.url}/`, { sink })
    otherSite.stop()
    otherCdn.stop()

    const bundle = createLocalBundlePlugin({ root })
    expect(bundle.manifest?.entry).toBe('index.html')
    const offline = createLlmReader({ plugins: [bundle], allowHosts: ['127.0.0.1'], timeout: 2000 })
    const page = await offline.page(bundle.urlOf('index.html'))
    expect(page.meta().title?.value).toBe('Collected page')
    // The original page URL and what it loaded are answered from disk — the servers are gone.
    expect((await offline.page(`${otherSite.url}/`)).meta().title?.value).toBe('Collected page')
    const css = await offline.fetcher.fetch({ url: `${otherSite.url}/css/site.css`, purpose: 'stylesheet' })
    expect(css.text).toContain('../img/bg.png')
    const font = await offline.fetcher.fetch({ url: `${otherCdn.url}/fonts/inter.woff2`, purpose: 'any' })
    expect(font.status).toBe(200)
    expect(bundle.serves(`${otherCdn.url}/img/pattern.png`)).toBe(true)
    expect(bundle.serves(`${otherCdn.url}/never-collected.png`)).toBe(false)
  }, 30_000)
})
