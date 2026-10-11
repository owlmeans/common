import { describe, expect, test } from 'bun:test'
import { createMemoHelper, memoHelper } from '../src/memo.js'

describe('@owlmeans/context — memoHelper', () => {
  test('once builds on the first call only, even when the value is undefined', () => {
    let builds = 0
    const lazy = memoHelper.once(() => { builds++; return undefined })
    expect(builds).toBe(0)
    lazy(); lazy(); lazy()
    expect(builds).toBe(1)
  })

  test('once answers the same object every time', () => {
    const lazy = memoHelper.once(() => ({ id: Math.random() }))
    expect(lazy()).toBe(lazy())
  })

  test('oncePer builds one value per target and keeps targets apart', () => {
    let builds = 0
    const helperOf = createMemoHelper().oncePer((ctx: { name: string }) => { builds++; return { owner: ctx.name } })
    const a = { name: 'a' }
    const b = { name: 'b' }
    expect(helperOf(a)).toBe(helperOf(a))
    expect(helperOf(b).owner).toBe('b')
    expect(builds).toBe(2)
  })
})
