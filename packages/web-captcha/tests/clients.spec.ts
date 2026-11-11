import { describe, expect, test } from 'bun:test'
import { captchaClients, createCaptchaClients } from '../src/clients.js'
import { CaptchaLoadError } from '../src/errors.js'
import { makeTestClient } from './context.js'

describe('@owlmeans/web-captcha — the client registry', () => {
  test('keeps clients by provider id; the same id replaces; no id = the only one', async () => {
    const clients = createCaptchaClients()
    expect(clients.get()).toBeNull()
    expect(clients.get('test')).toBeNull()

    const first = clients.register(makeTestClient('one'))
    expect(clients.get()).toBe(first)
    expect(clients.get('one')).toBe(first)

    const second = clients.register(makeTestClient('two'))
    expect(clients.get()).toBeNull()
    expect(clients.get('two')).toBe(second)
    expect(await clients.get('two')?.execute('k', 'email_pin')).toBe('token:k:email_pin')

    const replaced = clients.register(makeTestClient('one'))
    expect(clients.get('one')).toBe(replaced)
    expect(clients.list().map(client => client.id)).toEqual(['two', 'one'])
  })

  test('the page registry starts empty: nothing is registered as a side effect of an import', () => {
    expect(captchaClients.list()).toEqual([])
  })

  test('a load error names its step and keeps the neutral marker', () => {
    const error = new CaptchaLoadError('timeout')

    expect(error.reason).toBe('timeout')
    expect(error.name).toBe('CaptchaLoadError')
    expect(error.message).toBe('captcha:timeout')
  })
})
