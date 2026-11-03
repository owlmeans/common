import { afterEach, beforeEach, expect, test } from 'bun:test'
import { configureLog, logger, logStateHelper, redactHelper, resetLog } from '@owlmeans/log'
import type { NativeConsole } from '@owlmeans/log'

const written: string[] = []
let saved: NativeConsole
beforeEach(() => {
  resetLog(); written.length = 0
  const native = logStateHelper.nativeConsole(); saved = { ...native }
  for (const method of Object.keys(native) as Array<keyof NativeConsole>) native[method] = (...args) => { written.push(String(args[0])) }
})
afterEach(() => { Object.assign(logStateHelper.nativeConsole(), saved); resetLog() })

test('actual Error cause relations survive text and JSON native sinks', () => {
  const provider = Object.assign(new Error('401 Incorrect API key provided: sk-synthetic-invalid. You can find your API key at https://platform.openai.com/account/api-keys.'),
    { name: 'AuthenticationError', status: 401, code: 'invalid_api_key' })
  const wrapper = new Error('llm:retry-exceeded:max-retries', { cause: provider })
  expect(wrapper.cause).toBe(provider)
  for (const format of ['text', 'json']) {
    configureLog({ format }); logger('bot:capture-order').error('Could not capture the order', wrapper)
    const line = written.at(-1)!
    const cause = format === 'json' ? JSON.parse(line).err.cause
      : JSON.parse(JSON.parse(/errorCause=("(?:\\.|[^"\\])*")/.exec(line)![1]!))
    expect(cause).toMatchObject({ name: 'AuthenticationError', status: 401, code: 'invalid_api_key' })
    expect(cause.message).toContain('401 Incorrect API key provided: [redacted-key]')
    expect(line).not.toContain('sk-synthetic-invalid')
    if (format === 'text') expect(line).toContain('Error: llm:retry-exceeded:max-retries')
  }
})

test('non-Error, cyclic and deep causes stay omitted or explicitly bounded', () => {
  for (const cause of ['401 invalid key', { name: 'AuthenticationError', status: 401 }]) {
    expect(redactHelper.errorData(new Error('outer', { cause }))).not.toHaveProperty('cause')
  }
  const cycle = new Error('cycle'); cycle.cause = cycle
  expect(redactHelper.errorData(cycle)).toMatchObject({ causeTruncated: true })
  let deep = new Error('leaf')
  for (let i = 0; i < 10; i++) deep = new Error('outer', { cause: deep })
  let record = redactHelper.errorData(deep), depth = 0
  while (record.cause) { record = record.cause as Record<string, unknown>; depth++ }
  expect(depth).toBe(3); expect(record.causeTruncated).toBe(true)
})

test('cause fields are clipped/redacted and never carry SDK headers, request, config or arbitrary data', () => {
  const cause = Object.assign(new Error('Bearer private-value\nauthorization: hidden-header\napi_key=hidden-key\nsk-provider-secret'),
    { status: 401, headers: { authorization: 'hidden-header' }, request: { body: 'hidden-body' }, config: { apiKey: 'hidden-key' }, code: { nested: 'hidden-code' } })
  cause.stack = cause.message + '\n' + 'x'.repeat(5000)
  const data = redactHelper.errorData(new Error('outer', { cause }))
  const text = JSON.stringify(data)
  for (const secret of ['private-value', 'hidden-header', 'hidden-key', 'sk-provider-secret', 'hidden-body', 'hidden-code']) expect(text).not.toContain(secret)
  expect(data.cause).toHaveProperty('status', 401)
  expect(Object.keys(data.cause as object).sort()).toEqual(['message', 'name', 'stack', 'status'])
  expect(text.length).toBeLessThan(4000)
})

test('direct Error text behavior is unchanged and free-form stack text never becomes cause metadata', () => {
  const error = new Error('direct'); error.stack = 'Error: direct\nCaused by[1]: AuthenticationError401'
  logger('direct').error('Failed', error)
  expect(written[0]).toEndWith('\n' + error.stack)
  expect(written[0]).not.toContain(' errorCause=')
  configureLog({ format: 'json' }); logger('direct').error('Failed', error)
  expect(JSON.parse(written[1]!).err).not.toHaveProperty('cause')
})
