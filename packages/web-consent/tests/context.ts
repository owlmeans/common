import { createServer } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { consentBootstrapScript } from '@owlmeans/consent'

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
    html.replace('<!--owlmeans:consent-->', `<script>${consentBootstrapScript()}</script>`),
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
    plugins: [react(), tailwindcss(), consentBootstrap()],
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
