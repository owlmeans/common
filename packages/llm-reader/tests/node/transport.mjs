// Runs the BUILT package under Node: undici's ProxyAgent for an HTTP proxy, the SOCKS bridge for SOCKS.
// Args: <site url> <http proxy url> <socks proxy url>. Prints one JSON line.
import { createPageFetcher, createProxyPlugin } from '../../build/index.js'

const [site, http, socks] = process.argv.slice(2)
const page = `${site}/stories/tide-pools-winter`
const out = { runtime: process.versions.bun != null ? 'bun' : 'node' }
for (const [name, proxy] of [['http', http], ['socks', socks]]) {
  const plugin = createProxyPlugin({ proxies: [proxy], attempts: 1 })
  const fetcher = createPageFetcher({ allowHosts: ['127.0.0.1'], timeout: 5000, plugins: [plugin] })
  try {
    const fetched = await fetcher.fetch({ url: page })
    out[name] = { status: fetched.status, ok: (fetched.text ?? '').includes('Tide Pools'), via: fetched.via }
  } catch (e) {
    out[name] = { error: e.message }
  }
  await fetcher.close()
}
console.log(JSON.stringify(out))
