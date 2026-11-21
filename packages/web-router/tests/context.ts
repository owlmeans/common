import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

let url: string | null = null

/**
 * Boot a Vite dev server serving `tests/harness/` (a real HTTP origin — the
 * OwlMeans router needs the History API, which a `data:` URL cannot provide).
 * One server per `bun test` process; the harness renders the routing app.
 */
export const getHarnessUrl = async (): Promise<string> => {
  if (url != null) return url
  const server = await createServer({
    configFile: false,
    root: resolve(here, './harness'),
    plugins: [react()],
    // Single React instance so hooks work across the workspace-linked plugin.
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

const baseUrls = new Map<string, string>()

/**
 * Boot a Vite dev server serving `tests/harness-base/` under `base` (`/app/` — the page then lives
 * at `http://localhost:<port>/app/`, deep links included — or `/` for the root run). The harness
 * reads the same value as its frontend service's `base`, so the router sees the mount the host
 * serves it under. One server per base per `bun test` process.
 */
export const getBaseHarnessUrl = async (base: string): Promise<string> => {
  const known = baseUrls.get(base)
  if (known != null) return known
  const server = await createServer({
    configFile: false,
    root: resolve(here, './harness-base'),
    base,
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    server: { port: 0 },
    logLevel: 'warn'
  })
  await server.listen()
  const local = server.resolvedUrls?.local?.[0]
  if (local == null) throw new Error('vite did not expose a local URL')
  baseUrls.set(base, local)
  return local
}
