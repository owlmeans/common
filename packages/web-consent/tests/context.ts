import { createServer } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { consentModeHelper } from '@owlmeans/consent'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Stamp the real bootstrap snippet into `<head>`, the way every consumer does.
 *
 * A test that hand-wrote the snippet would pass while the shipped emitter was broken, and one that
 * loaded it as a module would defer it — which is precisely the defect the ordering exists to
 * prevent. Injecting the emitter's own output, inline and classic, is what makes the ordering
 * assertions in `bootstrap.spec.ts` mean anything.
 */
const consentBootstrap = (): Plugin => ({
  name: 'owlmeans-consent-bootstrap',
  transformIndexHtml: html =>
    html.replace('<!--owlmeans:consent-->', `<script>${consentModeHelper.consentBootstrapScript()}</script>`),
})

/**
 * Answer `/cdn-cgi/trace` the way Cloudflare's edge does, steered by the PAGE's own query string —
 * a same-origin fetch sends the full page URL as its referrer, so every case is still chosen by URL:
 *
 * - `?geo=<CC>` — a trace with `loc=<CC>`;
 * - `?geo=fail` (and no `geo` at all) — 404, a host not behind Cloudflare;
 * - `?geo=html` — 200 with an HTML page, an SPA serving `index.html` for every path;
 * - `?geo=hang` — never answers;
 * - `&geoDelay=<ms>` — answers that much later.
 */
const cdnTrace = (): Plugin => ({
  name: 'owlmeans-cdn-trace',
  configureServer: server => {
    server.middlewares.use('/cdn-cgi/trace', (req, res) => {
      let params = new URLSearchParams()
      try {
        params = new URL(req.headers.referer ?? '').searchParams
      } catch { /* no referrer: the fail case */ }
      const geo = params.get('geo') ?? 'fail'
      const delay = Number(params.get('geoDelay') ?? 0)
      const answer = (): void => {
        if (geo === 'hang') {
          return
        }
        if (geo === 'fail') {
          res.statusCode = 404
          res.end('not found')

          return
        }
        res.statusCode = 200
        if (geo === 'html') {
          res.setHeader('content-type', 'text/html')
          res.end('<!doctype html><html><body><div id="root"></div></body></html>')

          return
        }
        res.setHeader('content-type', 'text/plain')
        res.end(`fl=0f0\nh=localhost\nip=203.0.113.7\nts=0\nvisit_scheme=http\ncolo=TST\nloc=${geo}\n`)
      }
      if (delay > 0) {
        setTimeout(answer, delay)
      } else {
        answer()
      }
    })
  },
})

let url: string | null = null

/**
 * Boot a Vite dev server over `tests/harness/` — a real HTTP origin, because everything under
 * test reads and writes `localStorage` and a document cookie, and neither exists on a `data:` URL.
 *
 * React is deduped so hooks cross the workspace links.
 */
export const getHarnessUrl = async (): Promise<string> => {
  if (url != null) return url
  const server = await createServer({
    configFile: false,
    root: resolve(here, './harness'),
    plugins: [react(), tailwindcss(), consentBootstrap(), cdnTrace()],
    resolve: { dedupe: ['react', 'react-dom'] },
    server: { port: 0 },
    logLevel: 'warn'
  })
  await server.listen()
  const local = server.resolvedUrls?.local?.[0]
  if (local == null) throw new Error('vite did not expose a local URL')
  url = local

  return url
}

export const HARNESS_URL = await getHarnessUrl()
