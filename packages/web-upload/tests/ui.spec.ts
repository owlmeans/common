import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { browserHelper, mountComponent } from '@owlmeans/test-ui'
import type { Page } from '@owlmeans/test-ui'
import { closeHarness, harnessUrl } from './context.js'
import { FAKE_PNG, MARKDOWN, PNG, TEXT, zipOf } from './fixtures.js'
import { MiB } from './harness/tree.js'
import { closeUploadServer, uploadServer } from './server.js'
import type { UploadServer } from './server.js'

const TIMEOUT = 60_000

let base = ''
let server: UploadServer
let folder = ''

beforeAll(async () => {
  server = await uploadServer()
  base = mkdtempSync(join(tmpdir(), 'web-upload-ui-'))
  folder = join(base, 'materials')
  mkdirSync(join(folder, 'docs', 'deep'), { recursive: true })
  writeFileSync(join(folder, 'docs', 'brief.md'), MARKDOWN)
  writeFileSync(join(folder, 'docs', 'deep', 'notes.md'), MARKDOWN)
  writeFileSync(join(folder, 'logo.png'), PNG)
  writeFileSync(join(folder, '.DS_Store'), 'junk')
})

afterAll(async () => {
  await browserHelper.closeBrowser()
  await closeHarness()
  await closeUploadServer()
  rmSync(base, { recursive: true, force: true })
})

const urlOf = async (query: Record<string, string> = {}): Promise<string> => {
  const params = new URLSearchParams({ api: String(server.port), ...query })
  return `${(await harnessUrl()).replace(/\/$/, '')}/?${params.toString()}`
}

const open = async (query: Record<string, string> = {}) => {
  const mounted = await mountComponent({ url: await urlOf(query) })
  await mounted.page.locator('[data-upload-add-files]').waitFor()
  return mounted
}

const rows = (page: Page) => page.locator('[data-upload-entry]')

const row = (page: Page, path: string) => page.locator(`[data-upload-entry][data-path="${path}"]`)

const paths = async (page: Page): Promise<string[]> =>
  (await rows(page).evaluateAll(items => items.map(item => item.getAttribute('data-path') ?? ''))).sort()

describe('@owlmeans/web-upload — drop zone, pickers, list', () => {
  test('dragging files over any part of the form raises the overlay; a drop adds them and is announced', async () => {
    const { page, close } = await open()
    try {
      const data = await page.evaluateHandle(() => {
        const transfer = new DataTransfer()
        transfer.items.add(new File(['# Brief\n'], 'brief.md', { type: 'text/markdown' }))
        transfer.items.add(new File(['body { color: red }'], 'site.css', { type: 'text/css' }))
        return transfer
      })
      const prompt = page.getByTestId('prompt')
      await prompt.dispatchEvent('dragenter', { dataTransfer: data })
      await prompt.dispatchEvent('dragover', { dataTransfer: data })
      await page.locator('[data-upload-overlay]').waitFor()
      expect(await page.locator('[data-upload-dropzone]').getAttribute('data-dragging')).toBe('true')
      expect(await page.locator('[data-upload-overlay]').textContent()).toContain('Drop to add')

      await prompt.dispatchEvent('drop', { dataTransfer: data })
      await page.locator('[data-upload-overlay]').waitFor({ state: 'detached' })
      await rows(page).nth(1).waitFor()
      expect(await paths(page)).toEqual(['brief.md', 'site.css'])
      expect(await row(page, 'brief.md').getAttribute('data-status')).toBe('queued')
      expect(await row(page, 'site.css').getAttribute('data-kind')).toBe('code')
      expect(await page.locator('[data-upload-announcement]').textContent()).toBe('Files added: 2')
      expect(await page.locator('[data-upload-totals]').textContent()).toContain('Files: 2')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('files pasted into the form are added; a queue held outside React is the one the parts render', async () => {
    const { page, close } = await open({ store: '1' })
    try {
      await page.getByTestId('prompt').evaluate(element => {
        const transfer = new DataTransfer()
        transfer.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'icon.svg', { type: 'image/svg+xml' }))
        element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }))
      })
      await row(page, 'icon.svg').waitFor()
      expect(await row(page, 'icon.svg').getAttribute('data-kind')).toBe('image')
      expect(await page.evaluate(() => (window as unknown as { __uploadStore: { state: () => { entries: Array<{ path: string }> } } })
        .__uploadStore.state().entries.map(entry => entry.path))).toEqual(['icon.svg'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a dropped folder is walked: nested files keep their relative paths, junk is skipped', async () => {
    const { page, close } = await open()
    try {
      const box = (await page.getByTestId('prompt').boundingBox())!
      const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      const cdp = await page.context().newCDPSession(page)
      const drag = { items: [], files: [folder], dragOperationsMask: 1 }
      await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', ...at, data: drag })
      await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', ...at, data: drag })
      await cdp.send('Input.dispatchDragEvent', { type: 'drop', ...at, data: drag })
      await rows(page).nth(2).waitFor()
      expect(await paths(page)).toEqual(['materials/docs/brief.md', 'materials/docs/deep/notes.md', 'materials/logo.png'])
      expect(await row(page, 'materials/logo.png').getAttribute('data-kind')).toBe('image')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('a folder picked through the folder input keeps its paths', async () => {
    const { page, close } = await open()
    try {
      await page.locator('[data-upload-input="folder"]').setInputFiles(folder)
      await rows(page).nth(2).waitFor()
      expect(await paths(page)).toEqual(['materials/docs/brief.md', 'materials/docs/deep/notes.md', 'materials/logo.png'])
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('limit violations show per row and for the queue; removing a row re-checks the rest', async () => {
    const { page, close } = await open({ policy: JSON.stringify({ maxFiles: 2, maxFileBytes: 64, maxTotalBytes: 1000 }) })
    try {
      await page.locator('[data-upload-input="files"]').setInputFiles([
        { name: 'a.md', mimeType: 'text/markdown', buffer: TEXT(10) },
        { name: 'big.md', mimeType: 'text/markdown', buffer: TEXT(100) },
        { name: 'c.md', mimeType: 'text/markdown', buffer: TEXT(10) },
        { name: 'd.md', mimeType: 'text/markdown', buffer: TEXT(10) },
      ])
      await rows(page).nth(3).waitFor()
      expect(await row(page, 'big.md').getAttribute('data-limit')).toBe('file-bytes')
      expect(await row(page, 'big.md').locator('[data-upload-entry-status]').textContent())
        .toBe('Rejected — Larger than 64 B, the limit for one file')
      expect(await row(page, 'd.md').locator('[data-upload-entry-status]').textContent())
        .toBe('Rejected — Past the limit on the number of files: 2')
      expect(await page.locator('[data-upload-violation="max-files"]').textContent()).toBe('Too many files: 3, at most 2')
      expect(await page.locator('[data-upload-violation="max-file-bytes"]').textContent()).toBe('Files larger than 64 B: 1')
      expect(await page.locator('[data-upload-hints]').textContent()).toBe('Limits — files: 2, one file: 64 B, in total: 1,000 B')

      await row(page, 'c.md').locator('[data-upload-remove]').click()
      await row(page, 'c.md').waitFor({ state: 'detached' })
      expect(await row(page, 'd.md').getAttribute('data-status')).toBe('queued')
      expect(await page.locator('[data-upload-violation="max-files"]').count()).toBe(0)
      expect(await page.locator('[data-upload-violation]').count()).toBe(1)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('uploads to a real server: progress, accepted and rejected rows, an archive\'s entries, a type mismatch', async () => {
    const { page, close } = await open()
    try {
      const zip = await zipOf({ 'pages/home.md': MARKDOWN, 'pages/evil.png': FAKE_PNG })
      await page.locator('[data-upload-input="files"]').setInputFiles([
        { name: 'brief.md', mimeType: 'text/markdown', buffer: MARKDOWN },
        { name: 'logo.png', mimeType: 'image/png', buffer: PNG },
        { name: 'fake.png', mimeType: 'image/png', buffer: FAKE_PNG },
        { name: 'site.zip', mimeType: 'application/zip', buffer: zip },
        { name: 'big.md', mimeType: 'text/markdown', buffer: TEXT(3 * MiB) },
      ])
      await rows(page).nth(4).waitFor()
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Network.enable')
      // Slow the upload down so its progress is observable: 3 MiB at 2 MiB/s.
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: 2 * MiB,
      })

      await page.getByTestId('create').click()
      await page.locator('[data-upload-progress]').waitFor()
      await page.waitForFunction(() => document.querySelector('[data-testid="session"]')?.textContent !== ''
        && document.querySelector('[data-testid="uploading"]')?.textContent === 'no', undefined, { timeout: 30_000 })

      expect(await paths(page)).toEqual(['big.md', 'brief.md', 'fake.png', 'logo.png', 'pages/evil.png', 'pages/home.md'])
      expect(await row(page, 'brief.md').getAttribute('data-status')).toBe('accepted')
      expect(await row(page, 'logo.png').getAttribute('data-status')).toBe('accepted')
      expect(await row(page, 'big.md').getAttribute('data-status')).toBe('accepted')
      expect(await row(page, 'fake.png').getAttribute('data-reason')).toBe('type-mismatch')
      expect(await row(page, 'fake.png').locator('[data-upload-entry-status]').textContent())
        .toBe('Rejected — Its content does not match its name or type')
      expect(await row(page, 'pages/home.md').getAttribute('data-status')).toBe('accepted')
      expect(await row(page, 'pages/home.md').getAttribute('data-from')).toBe('site.zip')
      expect(await row(page, 'pages/home.md').locator('[data-upload-entry-status]').textContent()).toBe('Uploaded — From site.zip')
      expect(await row(page, 'pages/evil.png').getAttribute('data-reason')).toBe('type-mismatch')
      expect(await row(page, 'pages/home.md').locator('[data-upload-remove]').count()).toBe(1)

      const trace = await page.evaluate(() => (window as unknown as { __uploadTrace: Record<string, number[]> }).__uploadTrace)
      expect(trace['big.md'].some(value => value > 0 && value < 1)).toBe(true)

      const session = (await page.getByTestId('session').textContent())!
      const held = (await server.uploads.state(session)).files.filter(file => file.status === 'accepted').map(file => file.path).sort()
      expect(held).toEqual(['big.md', 'brief.md', 'logo.png', 'pages/home.md'])

      await row(page, 'pages/home.md').locator('[data-upload-remove]').click()
      await row(page, 'pages/home.md').waitFor({ state: 'detached' })
      expect((await server.uploads.state(session)).files.some(file => file.path === 'pages/home.md')).toBe(false)
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('speaks the person\'s language through useUploadI18n', async () => {
    const { page, close } = await open({ lng: 'pl' })
    try {
      expect(await page.locator('[data-upload-add-files]').textContent()).toBe('Dodaj pliki')
      expect(await page.locator('[data-upload-add-folder]').textContent()).toBe('Dodaj folder')
      await page.locator('[data-upload-input="files"]').setInputFiles([{ name: 'a.md', mimeType: 'text/markdown', buffer: TEXT(2048) }])
      await rows(page).first().waitFor()
      expect(await row(page, 'a.md').locator('[data-upload-entry-status]').textContent()).toBe('Gotowy')
      expect(await page.locator('[data-upload-totals]').textContent()).toBe('Pliki: 1 · 2 kB')
    } finally {
      await close()
    }
  }, TIMEOUT)

  test('touch targets are at least 44px on a phone', async () => {
    const browser = await browserHelper.launchBrowser()
    const context = await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true })
    try {
      const page = await context.newPage()
      await page.goto(await urlOf(), { waitUntil: 'domcontentloaded' })
      await page.locator('[data-upload-input="files"]').setInputFiles([{ name: 'a.md', mimeType: 'text/markdown', buffer: TEXT(10) }])
      await rows(page).first().waitFor()
      for (const selector of ['[data-upload-add-files]', '[data-upload-add-folder]', '[data-upload-remove]']) {
        const box = (await page.locator(selector).first().boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.width).toBeGreaterThanOrEqual(44)
      }
    } finally {
      await context.close()
    }
  }, TIMEOUT)
})
