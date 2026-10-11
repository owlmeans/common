import { describe, expect, test } from 'bun:test'
import { openBrowser } from '../src/open-browser.js'

describe('openBrowser suppression', () => {
  test('OWLMEANS_NO_BROWSER and BROWSER=none refuse without spawning anything', () => {
    expect(openBrowser('https://example.test/', { OWLMEANS_NO_BROWSER: '1' })).toBe(false)
    expect(openBrowser('https://example.test/', { BROWSER: 'none' })).toBe(false)
  })

  test('a Linux session with no display refuses', () => {
    if (process.platform !== 'linux') return
    expect(openBrowser('https://example.test/', {})).toBe(false)
  })
})
