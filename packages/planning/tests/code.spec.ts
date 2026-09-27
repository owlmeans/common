import { describe, expect, test } from 'bun:test'
import { CodeScope, CodeStyle } from '../src/consts.js'
import { CodeTaken } from '../src/errors.js'
import { codeScopeOf, mintCode } from '../src/helpers/code.js'
import { STORY_TYPE } from './fixtures.js'

const free = () => false

describe('mintCode', () => {
  test('random: prefix plus an upper-cased Base58 part of the policy length', async () => {
    const code = await mintCode(STORY_TYPE.code!, free)

    expect(code).toMatch(/^US-[1-9A-Z]{5}$/)
  })

  test('slug: derived from the seed, then suffixed while taken', async () => {
    const policy = { style: CodeStyle.Slug, uniqueWithin: CodeScope.Entity }
    const taken = new Set(['shop-dashboard', 'shop-dashboard-2'])

    expect(await mintCode(policy, free, 8, { seed: 'Shop Dashboard!' })).toBe('shop-dashboard')
    expect(await mintCode(policy, code => taken.has(code), 8, { seed: 'Shop Dashboard!' })).toBe('shop-dashboard-3')
    expect(await mintCode(policy, free)).toMatch(/^[a-z]+-[a-z]+$/)
  })

  test('sequential: counts on from the scope, zero-padded to the length', async () => {
    const policy = { prefix: 'REQ-', style: CodeStyle.Sequential, length: 3, uniqueWithin: CodeScope.Parent }

    expect(await mintCode(policy, free, 8, { count: 41 })).toBe('REQ-042')
    expect(await mintCode(policy, async code => code === 'REQ-042', 8, { count: 41 })).toBe('REQ-043')
  })

  test('refuses with CodeTaken after the attempt cap, asking exactly that many times', async () => {
    let asked = 0
    const always = async () => { asked++; return true }

    await expect(mintCode(STORY_TYPE.code!, always, 3)).rejects.toThrow(CodeTaken)
    expect(asked).toBe(3)
    expect(codeScopeOf(STORY_TYPE.code!, { parent: 'p1' })).toEqual({ parent: 'p1' })
  })
})
