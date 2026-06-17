import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Packages that must resolve to a single copy so the React context instances created
// by providers and read by hooks are the same object.
const owlMeansSingletons = [
  '@owlmeans/client',
  '@owlmeans/client-i18n',
  '@owlmeans/web-client',
  '@owlmeans/web-panel',
]

export default defineConfig({
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  server: {
    port: 3001,
    host: '0.0.0.0',
    strictPort: true,
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
    dedupe: ['react', 'react-dom', 'react-i18next', 'i18next', ...owlMeansSingletons],
  },
})
