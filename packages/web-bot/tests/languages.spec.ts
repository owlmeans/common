import { afterAll, describe, expect, test } from 'bun:test'
import { browserHelper } from '@owlmeans/test-ui'
import en from '../src/i18n/en.json' with { type: 'json' }
import pl from '../src/i18n/pl.json' with { type: 'json' }
import ru from '../src/i18n/ru.json' with { type: 'json' }
import be from '../src/i18n/be.json' with { type: 'json' }
import uk from '../src/i18n/uk.json' with { type: 'json' }
import es from '../src/i18n/es.json' with { type: 'json' }
import de from '../src/i18n/de.json' with { type: 'json' }
import fr from '../src/i18n/fr.json' with { type: 'json' }
import { connectionOf, open, TIMEOUT } from './helpers.js'

afterAll(async () => { await browserHelper.closeBrowser() })

const LANGUAGES = { en, pl, ru, be, uk, es, de, fr }

describe('connections panel — every shipped language renders', () => {
  for (const [lng, strings] of Object.entries(LANGUAGES)) {
    test(`${lng}: the panel and its status pill carry the translation, never a key path`, async () => {
      const { page, close } = await open({ panel: 'connections', lng }, call =>
        call.method === 'GET' && call.path === 'connections' ? { json: [connectionOf()] } : undefined)
      try {
        const panel = page.locator('[data-bot-connections]')
        await panel.locator('[data-bot-connection="c1"]').waitFor()
        expect(await panel.locator('[data-slot="card-title"]').textContent()).toBe(strings.connections.title)
        expect(await panel.locator('[data-bot-action="add"]').textContent()).toBe(strings.connections.add)
        expect(await panel.locator('[data-bot-status-pill]').textContent()).toBe(strings.status.pending)
        expect(await panel.textContent()).not.toMatch(/\b(connections|status|common|receive)\.[a-z-]+/)
      } finally {
        await close()
      }
    }, TIMEOUT)
  }
})
