import { describe, expect, test } from 'bun:test'
import { createPageFetcher, createProxyPlugin } from '../src/index.js'
import { gates, reason, titled } from './context.js'

const skip = reason(gates.proxies)
const proxies = (process.env.LLM_READER_PROXIES ?? '').split(',').map(entry => entry.trim()).filter(entry => entry.length > 0)

describe('@owlmeans/llm-reader — real proxies', () => {
  test.skipIf(skip != null)(titled('every listed proxy carries an HTTPS request', skip), async () => {
    for (const proxy of proxies) {
      const plugin = createProxyPlugin({ proxies: [proxy], attempts: 1 })
      const page = await createPageFetcher({ plugins: [plugin] }).fetch({ url: 'https://example.com/' })
      expect(page.text).toContain('Example Domain')
      expect(page.via).toBeDefined()
      expect(page.via).not.toContain((/:([^:@/]+)@/.exec(proxy) ?? [])[1] ?? '\u0000')
      await plugin.close()
    }
  }, 120_000)
})
