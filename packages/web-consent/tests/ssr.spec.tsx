import { describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { CookieConsent } from '../src/index.js'

describe('@owlmeans/web-consent — server rendering', () => {
  test('renders nothing on the server, gate or no gate — no surface flashes into static HTML', () => {
    // An Astro island is rendered to HTML first: a surface in that HTML would show for every
    // visitor until hydration, including the ones who already decided or are never asked.
    for (const props of [{}, { geo: { cloudflare: true } }, { mode: 'window' as const }]) {
      expect(renderToString(<CookieConsent policyHref="/cookies" {...props} />)).not.toContain('data-consent')
    }
  })
})
