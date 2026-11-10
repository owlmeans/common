import type { Origin } from './origin.js'

export interface FakeDrive {
  readonly base: string
  readonly accounts: string
  /** Requests seen, as path + query. */
  paths: string[]
  stop: () => void
}

export interface FakeDriveFiles {
  small: Uint8Array
  large: Uint8Array
  docx: Uint8Array
  xlsx: Uint8Array
  pptx: Uint8Array
}

/**
 * Google Drive's download flow in miniature: a small file downloads at once, a large one answers
 * the "can't scan for viruses" page whose form carries `confirm` and `uuid`, editor files export,
 * a quota page, a private file bouncing to the sign-in origin, a form posting elsewhere.
 */
export const startFakeDrive = (files: FakeDriveFiles, foreign: Origin): FakeDrive => {
  const paths: string[] = []
  const accounts = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: () => new Response('<html><body>Sign in</body></html>', { headers: { 'content-type': 'text/html' } }),
  })
  const accountsBase = `http://127.0.0.1:${accounts.port}`

  const attachment = (bytes: Uint8Array, name: string, type = 'application/octet-stream'): Response =>
    new Response(bytes, { headers: { 'content-type': type, 'content-disposition': `attachment; filename="${name}"` } })

  const html = (body: string): Response => new Response(`<!DOCTYPE html><html><body>${body}</body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })

  let base = ''
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request: Request): Response => {
      const url = new URL(request.url)
      paths.push(`${url.pathname}${url.search}`)
      const id = url.searchParams.get('id')
      if (url.pathname === '/download') {
        switch (id) {
          case 'SMALLFILE0001':
            return attachment(files.small, 'small.png', 'image/png')
          case 'LARGEFILE0001':
            if (url.searchParams.get('confirm') === 't' && url.searchParams.get('uuid') === 'u-123') {
              return attachment(files.large, 'large.bin')
            }
            return html(`<p>Google Drive can&#39;t scan this file for viruses.</p>`
              + `<form id="download-form" action="${base}/download" method="get">`
              + `<input type="hidden" name="id" value="LARGEFILE0001"><input type="hidden" name="export" value="download">`
              + `<input type="hidden" name="confirm" value="t"><input type="hidden" name="uuid" value="u-123">`
              + `<input type="submit" value="Download anyway"></form>`)
          case 'QUOTAFILE0001':
            return html('<p>Sorry, you can&#39;t view or download this file at this time. Too many users have viewed or downloaded this file recently.</p>')
          case 'PRIVATEFILE01':
            return new Response(null, { status: 302, headers: { location: `${accountsBase}/ServiceLogin?continue=x` } })
          case 'FOREIGNFORM01':
            return html(`<form id="download-form" action="${foreign.base}/files/x" method="get"><input type="hidden" name="id" value="FOREIGNFORM01"></form>`)
          default:
            return new Response('no such file', { status: 404 })
        }
      }
      const exported = /^\/(document|spreadsheets|presentation)\/d\/([^/]+)\/export(?:\/([a-z]+))?$/.exec(url.pathname)
      if (exported != null) {
        const format = exported[3] ?? url.searchParams.get('format')
        if (exported[1] === 'document' && format === 'docx') return attachment(files.docx, 'doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        if (exported[1] === 'spreadsheets' && format === 'xlsx') return attachment(files.xlsx, 'sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        if (exported[1] === 'presentation' && format === 'pptx') return attachment(files.pptx, 'deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      }
      return new Response('not found', { status: 404 })
    },
  })
  base = `http://127.0.0.1:${server.port}`

  return {
    base,
    accounts: accountsBase,
    paths,
    stop: () => {
      server.stop(true)
      accounts.stop(true)
    },
  }
}
