import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'
import { closeHarness, harnessUrl } from './context.js'

const TIMEOUT = 60_000

afterAll(async () => {
  await closeBrowser()
  await closeHarness()
})

describe('AmountCheckoutDialog', () => {
  test('renders presets and the net, adjustment, and pre-tax amounts', async () => {
    const { page, close } = await mountComponent({ url: await harnessUrl() })
    try {
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      for (const amount of ['$10.00', '$20.00', '$50.00', '$100.00']) {
        await expect(dialog.getByRole('button', { name: amount }).count()).resolves.toBe(1)
      }
      expect(await dialog.innerText()).toContain('Credit value')
      expect(await dialog.innerText()).toContain('Processing adjustment')
      expect(await dialog.innerText()).toContain('$0.21')
      expect(await dialog.innerText()).toContain('$10.21')
      expect(await dialog.innerText()).toContain('Stripe calculates any applicable tax')
    } finally { await close() }
  }, TIMEOUT)

  test('keeps custom cents, reports both bounds without clamping, and submits minor units', async () => {
    const { page, close } = await mountComponent({ url: await harnessUrl() })
    try {
      const input = page.getByLabel('Custom amount')
      const confirm = page.getByRole('button', { name: 'Continue to Stripe' })

      await input.fill('4.99')
      expect(await input.getAttribute('aria-invalid')).toBe('true')
      expect(await confirm.isDisabled()).toBe(true)
      expect(await page.getByText('The minimum amount is $5.00.').count()).toBe(1)

      await input.fill('500.01')
      expect(await input.inputValue()).toBe('500.01')
      expect(await page.getByText('The maximum amount is $500.00.').count()).toBe(1)

      await input.fill('5.01')
      expect(await input.getAttribute('aria-invalid')).toBe('false')
      await confirm.click()
      expect(await page.locator('#confirmed').textContent()).toBe('501')
    } finally { await close() }
  }, TIMEOUT)

  test('disables changes while pending and closes on cancel otherwise', async () => {
    const pendingMount = await mountComponent({ url: `${await harnessUrl()}?pending=true` })
    try {
      expect(await pendingMount.page.getByLabel('Custom amount').isDisabled()).toBe(true)
      expect(await pendingMount.page.getByRole('button', { name: 'Opening checkout…' }).isDisabled()).toBe(true)
      expect(await pendingMount.page.getByRole('button', { name: 'Cancel' }).isDisabled()).toBe(true)
    } finally { await pendingMount.close() }

    const readyMount = await mountComponent({ url: await harnessUrl() })
    try {
      await readyMount.page.getByRole('button', { name: 'Cancel' }).click()
      expect(await readyMount.page.getByRole('dialog').count()).toBe(0)
      expect(await readyMount.page.locator('#dialog-state').textContent()).toBe('closed')
    } finally { await readyMount.close() }
  }, TIMEOUT)
})
