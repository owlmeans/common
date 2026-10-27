import { afterAll, describe, expect, test } from 'bun:test'
import { browserHelper, mountComponent } from '@owlmeans/test-ui'
import { HARNESS_URL } from './context.js'

afterAll(async () => {
  await browserHelper.closeBrowser()
})

describe('web-panel JSON editor', () => {
  test('highlights JSON, formats without changing values, and preserves undo', async () => {
    const { page, close } = await mountComponent({ url: `${HARNESS_URL}?editor=1` })
    try {
      await page.getByTestId('json-input').waitFor()
      const original = await page.getByTestId('draft').textContent()
      expect(await page.locator('.cm-line span').count()).toBeGreaterThan(2)
      await page.getByRole('button', { name: 'Format', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('[data-testid=draft]')?.textContent?.includes('\n'))
      expect(JSON.parse((await page.getByTestId('draft').textContent())!)).toEqual(JSON.parse(original!))
      await page.getByTestId('json-input').fill('{"next":3}')
      await page.getByTestId('json-input').press('ControlOrMeta+z')
      expect(await page.getByTestId('draft').textContent()).not.toBe('{"next":3}')
    } finally {
      await close()
    }
  }, 60_000)

  test('retains invalid drafts and prevents saving until JSON is valid', async () => {
    const { page, close } = await mountComponent({ url: `${HARNESS_URL}?editor=1` })
    try {
      await page.getByTestId('json-input').fill('{"broken":')
      await page.waitForSelector('[data-json-editor][data-valid=false]')
      expect(await page.getByTestId('draft').textContent()).toBe('{"broken":')
      expect(await page.getByRole('button', { name: 'Save document' }).isDisabled()).toBe(true)
      expect(await page.getByRole('button', { name: 'Format', exact: true }).isDisabled()).toBe(true)
      await page.getByTestId('json-input').fill('{"fixed":true}')
      await page.waitForSelector('[data-json-editor][data-valid=true]')
      await page.getByRole('button', { name: 'Save document' }).click()
      expect(await page.getByTestId('saved').textContent()).toBe('{"fixed":true}')
    } finally {
      await close()
    }
  }, 60_000)

  test('accepts external documents and enforces read only mode', async () => {
    const { page, close } = await mountComponent({ url: `${HARNESS_URL}?editor=1` })
    try {
      await page.getByTestId('json-input').waitFor()
      await page.getByRole('button', { name: 'Load another document' }).click()
      await page.waitForFunction(() => document.querySelector('.cm-content')?.textContent === '{"loaded":true}')
      await page.getByRole('button', { name: 'Toggle read only' }).click()
      expect(await page.getByTestId('json-input').getAttribute('contenteditable')).toBe('false')
      expect(await page.getByRole('button', { name: 'Format', exact: true }).count()).toBe(0)
      expect(await page.getByRole('button', { name: 'Copy', exact: true }).isEnabled()).toBe(true)
    } finally {
      await close()
    }
  }, 60_000)
})
