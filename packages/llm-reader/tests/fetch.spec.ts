import { afterAll, describe, expect, test } from 'bun:test'
import { createAddressGuard, createPageFetcher, ReaderContentError, ReaderFetchError, ReaderRefusedError } from '../src/index.js'
import { startSite } from './servers.js'

const site = startSite()
afterAll(() => site.stop())

/** The fixture site lives on loopback, which the guard refuses unless allowed. */
const fetcher = createPageFetcher({ allowHosts: ['127.0.0.1'], timeout: 2000 })

describe('@owlmeans/llm-reader — fetching', () => {
  test('a page is fetched, decoded and described', async () => {
    const page = await fetcher.fetch({ url: `${site.url}/stories/tide-pools-winter` })

    expect(page.status).toBe(200)
    expect(page.contentType).toBe('text/html')
    expect(page.charset).toBe('utf-8')
    expect(page.text).toContain('How Tide Pools Survive Winter')
    expect(page.via).toBeUndefined()
  }, 10_000)

  test('redirects are followed and recorded; a loop and a hop into private space are not', async () => {
    const moved = await fetcher.fetch({ url: `${site.url}/old-story` })
    expect(moved.finalUrl).toBe(`${site.url}/stories/tide-pools-winter`)
    expect(moved.redirects).toEqual([`${site.url}/old-story`])

    await expect(fetcher.fetch({ url: `${site.url}/loop` })).rejects.toBeInstanceOf(ReaderFetchError)
    // Allowed hosts do not extend to where they redirect.
    await expect(fetcher.fetch({ url: `${site.url}/to-private` })).rejects.toBeInstanceOf(ReaderRefusedError)
  }, 10_000)

  test('the declared charset wins over UTF-8', async () => {
    const page = await fetcher.fetch({ url: `${site.url}/latin1` })
    expect(page.charset).toBe('windows-1251')
    expect(page.text).toContain('Привет')
  }, 10_000)

  test('limits: byte cap, deadline, a binary page', async () => {
    await expect(fetcher.fetch({ url: `${site.url}/big`, maxBytes: 1024 })).rejects.toBeInstanceOf(ReaderContentError)
    await expect(fetcher.fetch({ url: `${site.url}/slow`, timeout: 200 })).rejects.toBeInstanceOf(ReaderFetchError)
    await expect(fetcher.fetch({ url: `${site.url}/pdf` })).rejects.toBeInstanceOf(ReaderContentError)
    const image = await fetcher.fetch({ url: `${site.url}/images/logo.svg`, purpose: 'image' })
    expect(image.bytes?.byteLength).toBeGreaterThan(0)
  }, 10_000)

  test('private space is refused by default, by literal and by resolution', async () => {
    const strict = createPageFetcher()
    await expect(strict.fetch({ url: `${site.url}/` })).rejects.toBeInstanceOf(ReaderRefusedError)
    await expect(strict.fetch({ url: 'http://localhost:1/' })).rejects.toBeInstanceOf(ReaderRefusedError)
    await expect(strict.fetch({ url: 'http://169.254.169.254/latest/meta-data' })).rejects.toBeInstanceOf(ReaderRefusedError)
    await expect(strict.fetch({ url: 'http://user:pass@example.com/' })).rejects.toBeInstanceOf(ReaderRefusedError)
  })

  test('the guard knows the forms that hide private addresses', () => {
    const guard = createAddressGuard()
    for (const address of ['10.1.2.3', '100.64.0.1', '172.20.0.5', '198.18.0.1', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '64:ff9b::a00:1', '2002:c0a8:101::1']) {
      expect(guard.isNonPublic(address)).toBe(true)
    }
    for (const address of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
      expect(guard.isNonPublic(address)).toBe(false)
    }
  })

  test('the user agent and headers go out as configured', async () => {
    const custom = createPageFetcher({ allowHosts: ['127.0.0.1'], userAgent: 'TestReader/1.0' })
    const echo = JSON.parse((await custom.fetch({ url: `${site.url}/echo`, purpose: 'any', headers: { 'x-trace': 't1' } })).text!)
    expect(echo.headers['user-agent']).toBe('TestReader/1.0')
    expect(echo.headers['x-trace']).toBe('t1')
  }, 10_000)
})
