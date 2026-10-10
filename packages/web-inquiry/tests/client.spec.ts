import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { INQUIRY_OPEN_EVENT, type InquiryWidgetConfig } from '@owlmeans/common-inquiry'
import { addLogPlugin, configureLog, memoryPlugin, resetLog, type MemoryPlugin } from '@owlmeans/log'
import { INQUIRY_SCRIPT_ATTRIBUTE, InquiryLoadError, makeInquiryClient } from '@owlmeans/web-inquiry'
import { makePage, makeRuntime, type FakePage } from './dom.js'

const config: InquiryWidgetConfig = {
  id: 'owlmeans-quote',
  tabs: [{ alias: 'quote', title: 'Get a quote' }],
  legal: { terms: '/legal/terms', privacy: '/legal/privacy' },
}

/** The loader is page-wide state, so every spec gets a CRM url of its own. */
let counter = 0
const nextUrl = (): string => `https://crm-${++counter}.example/crm`

let page: FakePage
let memory: MemoryPlugin

const settle = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))

beforeEach(() => {
  resetLog()
  configureLog({ level: 'silent' })
  memory = memoryPlugin()
  addLogPlugin(memory)
  page = makePage()
})

afterEach(() => {
  page.uninstall()
  resetLog()
})

describe('load', () => {
  test('injects the versioned runtime script once for every client and call', async () => {
    const url = nextUrl()
    const fake = makeRuntime()
    page.onScript = script => page.install(fake.runtime, script)
    const first = makeInquiryClient({ url: `${url}/` })
    const second = makeInquiryClient({ url })

    const [a, b] = await Promise.all([first.load(), second.load()])
    await first.load()

    expect(a).toBe(fake.runtime)
    expect(b).toBe(fake.runtime)
    expect(page.scripts()).toHaveLength(1)
    const script = page.scripts()[0]!
    expect(script.src).toBe(`${url}/inquiry.js?v=1`)
    expect(script.async).toBe(true)
    expect(script.getAttribute(INQUIRY_SCRIPT_ATTRIBUTE)).toBe('')
    expect(fake.configured.at(-1)?.url).toBe(url)
  })

  test('reuses a runtime script another copy of the SDK already injected', async () => {
    const url = nextUrl()
    const fake = makeRuntime()
    page.add('script', { src: `${url}/inquiry.js?v=1`, [INQUIRY_SCRIPT_ATTRIBUTE]: '' })

    const loading = makeInquiryClient({ url }).load()
    await settle(10)
    page.install(fake.runtime)

    expect(await loading).toBe(fake.runtime)
    expect(page.scripts()).toHaveLength(1)
  })

  test('refuses a runtime of another version and removes its script', async () => {
    const fake = makeRuntime(2)
    page.onScript = script => page.install(fake.runtime, script)

    const error = await makeInquiryClient({ url: nextUrl() }).load().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(InquiryLoadError)
    expect((error as InquiryLoadError).failure).toBe('version')
    expect(page.scripts()).toHaveLength(0)
  })

  test('rejects after the timeout, and a later load injects again', async () => {
    const client = makeInquiryClient({ url: nextUrl(), timeoutMs: 80 })

    const error = await client.load().catch((caught: unknown) => caught)
    expect((error as InquiryLoadError).failure).toBe('timeout')
    expect(page.scripts()).toHaveLength(0)

    const fake = makeRuntime()
    page.onScript = script => page.install(fake.runtime, script)
    expect(await client.load()).toBe(fake.runtime)
    expect(page.scripts()).toHaveLength(1)
  })
})

describe('bind', () => {
  test('passes a lazy client email provider to opens and lets a trigger override it', async () => {
    const fake = makeRuntime()
    page.onScript = script => page.install(fake.runtime, script)
    let calls = 0
    const email = () => { calls++; return Promise.resolve('account@example.test') }
    const client = makeInquiryClient({ url: nextUrl(), email })
    await client.load()
    await client.open(config)
    expect(fake.opened.at(-1)?.opts?.email).toBe(email)
    expect(calls).toBe(0)
    const link = page.add('a', { href: '/contact' })
    client.bind(link as unknown as Element, config, { email: 'override@example.test' })
    link.dispatch('click')
    await settle(10)
    expect(fake.opened.at(-1)?.opts?.email).toBe('override@example.test')
  })

  test('a click opens the dialog instead of following the link', async () => {
    const fake = makeRuntime()
    page.onScript = script => page.install(fake.runtime, script)
    const link = page.add('a', { href: '/contact', 'data-inquiry': 'quote' })
    makeInquiryClient({ url: nextUrl() }).bind('[data-inquiry="quote"]', config, { source: 'pricing-card' })

    const click = link.dispatch('click')
    await settle(10)

    expect(click.defaultPrevented).toBe(true)
    expect(fake.opened).toEqual([{ config, opts: { source: 'pricing-card' } }])
    expect(page.assigned).toEqual([])
  })

  test('follows the trigger\'s own href when the widget cannot load', async () => {
    page.onScript = script => { script.dispatch('error') }
    const link = page.add('a', { href: '/contact' })
    makeInquiryClient({ url: nextUrl() }).bind(link as unknown as Element, config)

    const click = link.dispatch('click')
    await settle(10)

    expect(click.defaultPrevented).toBe(true)
    expect(page.assigned).toEqual(['/contact'])
  })

  test('leaves a modified click to the browser, and unbinding stops taking clicks over', async () => {
    const link = page.add('a', { href: '/contact' })
    const unbind = makeInquiryClient({ url: nextUrl() }).bind(link as unknown as Element, config)

    expect(link.dispatch('click', { ctrlKey: true }).defaultPrevented).toBe(false)
    unbind()
    expect(link.dispatch('click').defaultPrevented).toBe(false)
    await settle(10)
    expect(page.scripts()).toHaveLength(0)
  })
})

describe('analytics', () => {
  test('every open is reported once, whatever opened it', async () => {
    const fake = makeRuntime()
    page.onScript = script => page.install(fake.runtime, script)
    const opens: unknown[] = []
    const client = makeInquiryClient({ url: nextUrl(), onOpen: event => opens.push(event) })

    await client.open(config, { source: 'menu' })
    const handle = await client.button(config)
    handle.open()

    expect(memory.events.map(event => [event.event, event.data])).toEqual([
      [INQUIRY_OPEN_EVENT, { inquiry_widget: 'owlmeans-quote', inquiry_tab: 'quote', inquiry_source: 'menu' }],
      [INQUIRY_OPEN_EVENT, { inquiry_widget: 'owlmeans-quote', inquiry_tab: 'quote', inquiry_source: 'fab' }],
    ])
    expect(memory.records).toEqual([])
    expect(opens).toEqual([
      { widget: 'owlmeans-quote', tab: 'quote', source: 'menu' },
      { widget: 'owlmeans-quote', tab: 'quote', source: 'fab' },
    ])
  })

  test('a custom event name, or none at all', async () => {
    const fake = makeRuntime()
    page.onScript = script => page.install(fake.runtime, script)
    const url = nextUrl()
    const opens: unknown[] = []

    await makeInquiryClient({ url, analytics: 'contact_open' }).open(config)
    await makeInquiryClient({ url, analytics: false, onOpen: event => opens.push(event) })
      .open({ ...config, id: 'viable' })

    expect(memory.events.map(event => event.event)).toEqual(['contact_open'])
    expect(opens).toHaveLength(1)
  })
})
