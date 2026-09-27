import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

let url: string | null = null

/**
 * Boot a Vite dev server serving `tests/harness/` — a real HTTP origin, because a lazily-loaded
 * piece is a module request of its own and a failed one ends in a real page reload, neither of
 * which a `data:` URL can host. One server per `bun test` process.
 */
export const getHarnessUrl = async (): Promise<string> => {
  if (url != null) return url
  const server = await createServer({
    configFile: false,
    root: resolve(here, './harness'),
    plugins: [react()],
    // Single React instance so hooks work across the workspace-linked packages.
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
