import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

let url: string | null = null

/**
 * Boot a Vite dev server over `tests/harness/` — a real HTTP origin, because the OwlMeans
 * router drives the History API and a `data:` URL has no history to drive.
 *
 * `@` resolves to the package's own dev-only primitive copy, exactly as a consuming app's
 * bundler resolves it to theirs. React is deduped so hooks cross the workspace links.
 */
export const getHarnessUrl = async (): Promise<string> => {
  if (url != null) return url
  const server = await createServer({
    configFile: false,
    root: resolve(here, './harness'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': resolve(here, '../src/@') },
      dedupe: ['react', 'react-dom'],
    },
    // Pre-bundled at server start rather than discovered while the first request is being
    // served: a dependency found mid-transform re-optimizes and reloads the page underneath
    // the navigation, which the first `goto` of a cold run pays for as a timeout.
    optimizeDeps: { include: ['sonner'] },
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
