import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LlmModel } from '@owlmeans/llm'
import {
  createLlmReader, createLocalBundlePlugin, makeDesignAnalyst, ReaderContentError, ReaderRefusedError,
} from '../src/index.js'
import type { ReaderModels } from '../src/index.js'
import { startSite } from './servers.js'

const ROOT = fileURLToPath(new URL('./fixtures/bundle', import.meta.url))
const site = startSite()
const outside = await mkdtemp(join(tmpdir(), 'llm-reader-bundle-'))
afterAll(async () => {
  site.stop()
  await rm(outside, { recursive: true, force: true })
})

/** Facts and the page model are measured without a model; one that is never called stands in. */
const unused = new Proxy({}, { get: () => () => { throw new Error('no model call expected') } }) as LlmModel
const models: ReaderModels = { model: () => unused, helper: () => undefined }

const bundle = createLocalBundlePlugin({ root: ROOT })
const reader = createLlmReader({ plugins: [bundle], allowHosts: ['127.0.0.1'] })
const home = bundle.urlOf('home.html')

describe('@owlmeans/llm-reader — a local bundle', () => {
  test('files are served under the synthetic origin with their content types; a directory answers with its index', async () => {
    expect(home).toBe('https://bundle.local/home.html')
    expect(bundle.serves(home)).toBe(true)
    expect(bundle.serves('https://example.com/home.html')).toBe(false)

    const page = await reader.fetch(home)
    expect(page).toMatchObject({ status: 200, contentType: 'text/html', charset: 'utf-8', finalUrl: home })
    expect(page.text).toContain('Care for the whole family')
    const css = await reader.fetcher.fetch({ url: 'https://bundle.local/css/theme.css', purpose: 'stylesheet' })
    expect(css.contentType).toBe('text/css')
    const png = await reader.fetcher.fetch({ url: 'https://bundle.local/img/hero.png', purpose: 'image' })
    expect(png.contentType).toBe('image/png')
    expect([...png.bytes!.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect((await bundle.read('https://bundle.local/img/logo.svg'))!.contentType).toBe('image/svg+xml')
    expect((await bundle.read('https://bundle.local/about/'))!.path).toBe('about/index.html')
    expect((await reader.fetch('https://bundle.local/missing.html')).status).toBe(404)
  })

  test('the same refusals as the network: a picture as a page, a page as a picture, an oversized file', async () => {
    await expect(reader.fetch('https://bundle.local/img/hero.png')).rejects.toThrow(ReaderContentError)
    await expect(reader.fetcher.fetch({ url: home, purpose: 'image' })).rejects.toThrow(ReaderContentError)
    await expect(reader.fetcher.fetch({ url: home, maxBytes: 64 })).rejects.toThrow('too-large')
  })

  test('nothing outside the root: `..`, encoded separators, absolute paths', async () => {
    for (const path of ['../package.json', '/etc/passwd', 'C:\\Windows\\win.ini', 'css/../../package.json']) {
      expect(() => bundle.urlOf(path)).toThrow(ReaderRefusedError)
    }
    // The URL parser folds a plain `..` away, so it can only name something inside the root.
    expect(await bundle.read('https://bundle.local/../../package.json')).toBeNull()
    await expect(bundle.read('https://bundle.local/css/..%2F..%2Fpackage.json')).rejects.toThrow(ReaderRefusedError)
    await expect(bundle.read('https://bundle.local/%2e%2e%5cpackage.json')).rejects.toThrow(ReaderRefusedError)
    await expect(bundle.read('https://bundle.local/a%00.html')).rejects.toThrow(ReaderRefusedError)
  })

  test('a symbolic link is followed inside the root and refused when it resolves outside', async () => {
    const root = join(outside, 'root')
    await mkdir(join(root, 'pages'), { recursive: true })
    await writeFile(join(root, 'pages', 'inside.html'), '<p>inside</p>')
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(join(root, 'pages', 'inside.html'), join(root, 'alias.html'))
    await symlink(join(outside, 'secret.txt'), join(root, 'leak.txt'))
    await symlink(outside, join(root, 'up'))
    const linked = createLocalBundlePlugin({ root, origin: 'https://proto.test' })

    expect((await linked.read('https://proto.test/alias.html'))!.path).toBe('pages/inside.html')
    await expect(linked.read('https://proto.test/leak.txt')).rejects.toThrow('bundle-escape')
    await expect(linked.read('https://proto.test/up/secret.txt')).rejects.toThrow('bundle-escape')
  })

  test('any other URL still goes through the fetcher and its address guard', async () => {
    expect((await reader.fetch(`${site.url}/`)).text).toContain('Ship invoices in minutes')
    await expect(reader.fetch('http://169.254.169.254/latest/meta-data')).rejects.toThrow(ReaderRefusedError)
  })

  test('page(): the prototype as a page model — metadata, blocks, links and pictures resolved against the bundle', async () => {
    const page = await reader.page(home)

    expect(page.meta().title?.value).toBe('Fernhill Clinic — Book a visit')
    expect(page.stylesheets()).toEqual(['https://bundle.local/css/theme.css'])
    expect(page.links().find(link => link.text === 'About')!.url).toBe('https://bundle.local/about/')
    expect(page.images().map(image => image.url)).toEqual(expect.arrayContaining([
      'https://bundle.local/img/logo.svg', 'https://bundle.local/img/hero.png',
    ]))
    expect(page.signals()).toMatchObject({ appShell: false, prices: 2, forms: 1 })
    expect((await page.content()).markdown).toContain('# Care for the whole family')
  })

  test('design facts with no model: the bundle stylesheet parsed and weighted, the blocks told apart', async () => {
    const facts = await makeDesignAnalyst(await reader.page(home), { models, fetcher: reader.fetcher }).facts()

    expect(facts.stylesheets).toEqual([{ url: 'https://bundle.local/css/theme.css', ok: true, bytes: expect.any(Number) }])
    expect(facts.variables).toContainEqual({ name: '--brand', value: '#2f7d5b' })
    expect(facts.colors.find(color => color.value === '#2f7d5b')!.accent).toBeGreaterThan(0)
    expect(facts.typeScale.find(type => type.role === 'h1')).toMatchObject({ fontFamily: 'Merriweather', fontSize: '44px', fontWeight: '700' })
    expect(facts.radii.map(radius => radius.value)).toContain('12px')
    expect(facts.breakpoints).toEqual(['900px'])
    expect(facts.components.find(component => component.name === 'button-primary')!.declarations).toMatchObject({ background: '#2f7d5b' })
    expect(facts.blocks.map(block => block.kind)).toEqual(['header', 'hero', 'features', 'pricing', 'form', 'footer'])
  })
})
