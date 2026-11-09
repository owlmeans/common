import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { configureLog, logger, logStateHelper, overrideConsole, redactHelper, resetLog } from '@owlmeans/log'
import type { NativeConsole } from '@owlmeans/log'

const written: string[] = []
let saved: NativeConsole
beforeEach(() => {
  resetLog(); written.length = 0
  const native = logStateHelper.nativeConsole(); saved = { ...native }
  for (const method of Object.keys(native) as Array<keyof NativeConsole>) native[method] = (...args) => { written.push(String(args[0])) }
})
afterEach(() => { Object.assign(logStateHelper.nativeConsole(), saved); resetLog() })

const messageOf = (message: string): unknown => redactHelper.errorData(new Error(message)).message
const withField = (key: string, descriptor: PropertyDescriptor, error = new Error('x')): Error =>
  Object.defineProperty(error, key, { configurable: true, ...descriptor })
const throwing: PropertyDescriptor = { get: () => { throw new Error('getter exploded') } }

describe('error text redaction', () => {
  test('prose that only looks like a secret survives', () => {
    for (const prose of [
      'task-sk-12 failed',
      'device-authorization:503',
      'Invalid password: must contain 8 characters',
      'Cookie: header too large',
      'Bearer token missing',
    ]) expect(messageOf(prose)).toBe(prose)
  })

  test('keys, bearer tokens and token-like values of secret-named keys go', () => {
    expect(messageOf('x-api-key: sk-ant-api03-AbCdEfGhIjKlMnOp')).toBe('x-api-key: [redacted]')
    expect(messageOf('body {"api_key":"0123456789abcdef"} refused')).toBe('body {"api_key":"[redacted]"} refused')
    expect(messageOf('Authorization=Bearer eyJhbGciOiJIUzI1NiJ9.e30.sig')).toBe('Authorization=Bearer [redacted]')
    expect(messageOf('upstream said Authorization: Basic dXNlcjpwYXNzd29yZA== refused')).toBe('upstream said Authorization: Basic [redacted] refused')
    expect(messageOf('Authorization: Basic realm needed')).toBe('Authorization: Basic realm needed')
    const key = 'sk-proj-' + 'a1B2c3D4e5F6g7H8i9J0kL'
    expect(key).toHaveLength(30)
    expect(messageOf(`failed with ${key}.`)).toBe('failed with [redacted-key].')
  })
})

describe('error data never throws', () => {
  test('a missing, array or throwing message reads as text', () => {
    expect(redactHelper.errorData(withField('message', { value: undefined })).message).toBe('')
    expect(redactHelper.errorData(withField('message', { value: ['first', 'second'] })).message).toBe('first; second')
    expect(redactHelper.errorData(withField('message', throwing)).message).toBe('')
    const cause = withField('message', { value: undefined })
    expect(redactHelper.errorData(new Error('outer', { cause })).cause).toMatchObject({ name: 'Error', message: '' })
  })

  test('the name falls back to the constructor, and a non-string stack is left out', () => {
    class ProviderError extends Error {}
    const error = withField('stack', { value: { frames: [] } }, withField('name', { value: undefined }, new ProviderError('down')))
    const data = redactHelper.errorData(error)
    expect(data).toMatchObject({ name: 'ProviderError', message: 'down' })
    expect(data).not.toHaveProperty('stack')
  })

  test('an error none of which can be read is unserializable', () => {
    const hostile = new Proxy(new Error('x'), { getPrototypeOf: () => { throw new Error('nope') } })
    expect(redactHelper.errorData(new Error('outer', { cause: hostile }))).toEqual({ name: 'Error', message: '[unserializable]' })
  })

  test('both sinks and the console override write such errors without throwing', () => {
    const errors = [withField('message', { value: undefined }), withField('message', throwing),
      new Error('outer', { cause: withField('message', { value: undefined }) })]
    for (const format of ['text', 'json']) {
      configureLog({ format })
      for (const error of errors) {
        expect(() => logger('t').error('Failed', error)).not.toThrow()
        expect(() => logger('t').error(error)).not.toThrow()
      }
    }
    overrideConsole()
    expect(() => console.error(withField('message', throwing))).not.toThrow()
    expect(written.length).toBe(13)
  })
})

test('text and JSON sinks write the same redacted stack', () => {
  const error = new Error('Request failed')
  error.stack = 'Error: Request failed\n    at call (sk-proj-a1B2c3D4e5F6g7H8i9J0kL)\n    headers {"authorization":"Bearer eyJhbGciOiJIUzI1NiJ9.e30.sig"}'
  const stack = redactHelper.errorData(error).stack as string
  expect(stack).toContain('[redacted-key]'); expect(stack).toContain('Bearer [redacted]')
  logger('t').error('Failed', error)
  configureLog({ format: 'json' }); logger('t').error('Failed', error)
  expect(written[0]).toEndWith('\n' + stack)
  expect(JSON.parse(written[1]!).err.stack).toBe(stack)
  for (const line of written) {
    expect(line).not.toContain('sk-proj-'); expect(line).not.toContain('eyJhbGci')
  }
})
