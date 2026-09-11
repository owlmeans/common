import react from '@vitejs/plugin-react'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
let server: ViteDevServer | null = null
let url: string | null = null

export const harnessUrl = async (): Promise<string> => {
  if (url != null) return url
  server = await createServer({
    configFile: false,
    root: resolve(here, './harness'),
    plugins: [react()],
    resolve: {
      alias: { '@': resolve(here, '../src/@') },
      dedupe: ['react', 'react-dom'],
    },
    server: { port: 0 },
    logLevel: 'warn',
  })
  await server.listen()
  url = server.resolvedUrls?.local?.[0] ?? null
  if (url == null) throw new Error('Vite did not expose a web-payment harness URL')
  return url
}

export const closeHarness = async (): Promise<void> => {
  await server?.close()
  server = null
  url = null
}
