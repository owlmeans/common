import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import type { FC } from 'react'
import { handler } from '../src/helper.js'

const Screen: FC = () => null

const bind = (Component: Parameters<typeof handler>[0]) => {
  const module: Record<string, unknown> = { alias: 'screen', path: () => '/screen', ctx: {} }
  return handler(Component)({ ref: module as never })
}

const request = (id: string) => ({ alias: 'screen', path: '/screen', params: { id }, body: {}, headers: {}, query: {} })

const reply = () => {
  const resolved: unknown[] = []
  return { resolved, response: { resolve: (value: unknown) => { resolved.push(value) } } as never }
}

describe('@owlmeans/client — handler()', () => {
  test('answers ONE component per bound entrypoint, whatever the request', () => {
    const handle = bind(Screen)

    const first = handle(request('1') as never, reply().response)
    const second = handle(request('2') as never, reply().response)

    expect(typeof first).toBe('function')
    expect(second).toBe(first)
  })

  test('two entrypoints bound to one screen get components of their own', () => {
    expect(bind(Screen)(request('1') as never, reply().response))
      .not.toBe(bind(Screen)(request('1') as never, reply().response))
  })

  test('an element renderer still resolves the reply with the element itself', () => {
    const element = createElement('div')
    const { resolved, response } = reply()

    expect(bind(element)(request('1') as never, response)).toBe(element)
    expect(resolved).toEqual([element])
  })
})
