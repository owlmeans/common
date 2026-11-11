import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createServer, type ViteDevServer } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
let server: ViteDevServer | null = null
let url: string | null = null

/**
 * A Vite dev server over `tests/harness/` — a real origin for the browser, with Tailwind processing
 * the package's dev-only `globals.css`. React is deduped so hooks cross the workspace links.
 */
export const harnessUrl = async (): Promise<string> => {
  if (url != null) return url
  server = await createServer({
    configFile: false,
    root: resolve(here, './harness'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': resolve(here, '../src/@') },
      dedupe: ['react', 'react-dom'],
    },
    // Pre-bundled at start: a dependency discovered mid-navigation re-optimizes and reloads the page
    // underneath the first `goto`.
    optimizeDeps: {
      include: [
        'react', 'react-dom/client', 'react/jsx-runtime', 'lucide-react', 'clsx', 'tailwind-merge', 'class-variance-authority',
        'axios', 'i18next', 'react-i18next', 'ajv', 'ajv-formats',
      ],
    },
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'warn',
  })
  await server.listen()
  url = server.resolvedUrls?.local?.[0] ?? null
  if (url == null) throw new Error('Vite did not expose a web-upload harness URL')
  return url
}

export const closeHarness = async (): Promise<void> => {
  await server?.close()
  server = null
  url = null
}
