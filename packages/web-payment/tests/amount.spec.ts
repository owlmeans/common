import { describe, expect, test } from 'bun:test'
import { inputAmount, parseAmountMinor } from '../src/amount.js'
import { openCheckout } from '../src/service.js'

describe('localized amount input', () => {
  test('preserves cent precision', () => {
    expect(parseAmountMinor('5.01', 'en')).toBe(501)
    expect(inputAmount(501, 'en')).toBe('5.01')
  })
  test('accepts locale decimal separators', () => {
    expect(parseAmountMinor('10,21', 'pl')).toBe(1021)
  })
  test('rejects excess precision and non-numeric input', () => {
    expect(parseAmountMinor('5.001', 'en')).toBeNull()
    expect(parseAmountMinor('five', 'en')).toBeNull()
  })
})

describe('checkout navigation', () => {
  test('redirects in the same window by default and supports an explicit new tab', () => {
    const assigned: string[] = []
    const opened: unknown[][] = []
    const previous = globalThis.window
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { assign: (url: string) => assigned.push(url) },
        open: (...args: unknown[]) => opened.push(args),
      },
    })
    try {
      openCheckout('https://checkout.example/session')
      openCheckout('https://checkout.example/second', '_blank')
      expect(assigned).toEqual(['https://checkout.example/session'])
      expect(opened).toEqual([['https://checkout.example/second', '_blank', 'noopener,noreferrer']])
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: previous })
    }
  })
})
