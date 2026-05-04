import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser, mountComponent } from '@owlmeans/test-ui'

const harness = `data:text/html,${encodeURIComponent(`
<!doctype html>
<html><body>
  <h1 id="title">@owlmeans/web-panel pilot</h1>
</body></html>
`)}`

afterAll(async () => {
  await closeBrowser()
})

describe('@owlmeans/web-panel — Playwright-library smoke', () => {
  test('mounts a static page in chromium and reads the heading', async () => {
    const { page, close } = await mountComponent({ url: harness })
    try {
      expect(await page.locator('#title').textContent()).toBe('@owlmeans/web-panel pilot')
    } finally {
      await close()
    }
  })
})
