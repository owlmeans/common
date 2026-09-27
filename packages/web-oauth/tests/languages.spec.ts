import { afterAll, describe, expect, test } from 'bun:test'
import { closeBrowser } from '@owlmeans/test-ui'
import { OAUTH_CONSENT_PATH } from '@owlmeans/oauth'
import en from '../src/i18n/en.json' with { type: 'json' }
import pl from '../src/i18n/pl.json' with { type: 'json' }
import ru from '../src/i18n/ru.json' with { type: 'json' }
import be from '../src/i18n/be.json' with { type: 'json' }
import uk from '../src/i18n/uk.json' with { type: 'json' }
import es from '../src/i18n/es.json' with { type: 'json' }
import de from '../src/i18n/de.json' with { type: 'json' }
import { deviceView, open, TIMEOUT } from './helpers.js'

afterAll(async () => { await closeBrowser() })

const LANGUAGES = { en, pl, ru, be, uk, es, de }

describe('consent screen — all seven languages render', () => {
  for (const [lng, strings] of Object.entries(LANGUAGES)) {
    test(`${lng}: the buttons and the switch link carry the translation, never a key path`, async () => {
      const { page, close } = await open(`${OAUTH_CONSENT_PATH}?ref=ABCD-EFGH`, {
        signedIn: true, lng, stubs: { load: { json: deviceView() } },
      })
      try {
        await page.getByTestId('oauth-consent-approve').waitFor({ state: 'visible', timeout: 45_000 })

        expect(await page.getByTestId('oauth-consent-approve').textContent()).toBe(strings.consent.approve)
        expect(await page.getByTestId('oauth-consent-deny').textContent()).toBe(strings.consent.deny)
        expect(await page.getByTestId('oauth-consent-switch').textContent()).toBe(strings.consent['switch-account'])
        expect(await page.getByTestId('oauth-consent-code').textContent())
          .toBe(strings.consent['device-code'].replace('{{code}}', 'ABCD-EFGH'))
        // A missing key would print its own path.
        expect(await page.getByTestId('oauth-consent-card').textContent()).not.toMatch(/consent\.[a-z-]+/)
      } finally {
        await close()
      }
    }, TIMEOUT)
  }
})
