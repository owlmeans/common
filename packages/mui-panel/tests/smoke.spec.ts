import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'

const harness = `data:text/html,${encodeURIComponent(`
<!doctype html>
<html><body>
  <h1 id="title">@owlmeans/mui-panel pilot</h1>
</body></html>
`)}`

afterAll(async () => {
  await closeBrowser()
})

describe('@owlmeans/mui-panel — Playwright-library smoke', () => {
  test('mounts a static page in chromium and reads the heading', async () => {
    const { page, close } = await mountComponent({ url: harness })
    try {
      expect(await page.locator('#title').textContent()).toBe('@owlmeans/mui-panel pilot')
    } finally {
      await close()
    }
  })
})
