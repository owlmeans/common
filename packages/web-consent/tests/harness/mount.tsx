import type { FC } from 'react'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CookieConsent, CookiePolicy, DEFAULT_CONSENT_CATEGORIES } from '../../src/index.js'
import type { ConsentCategory, ConsentService } from '../../src/index.js'

/**
 * The harness renders whatever the query string asks for, so a spec chooses its case by URL and
 * every case runs against one real mount of the shipped components.
 *
 * - `?locale=<lng>` — render the dialog in that language.
 * - `?categories=custom` — a category set that is NOT the default, with its own global var.
 * - `?view=policy` — the cookie-policy page instead of the dialog.
 * - `?services=1` — with `view=policy`, disclose {@link SERVICES} on it.
 * - `?styled=1` — compile a real theme (`styled.css`), for the accessibility spec only.
 * - `?theme=dark` — with `styled=1`, the dark scheme.
 */
const params = new URLSearchParams(window.location.search)

if (params.get('styled') != null) {
  await import('./styled.css')
  if (params.get('theme') === 'dark') {
    document.documentElement.classList.add('dark')
  }
}

/**
 * A deliberately non-default set: a different key, a different global var, and a signal list that
 * does not match the built-in one. A component that quietly fell back to the defaults would still
 * render three plausible rows, so the assertions key on THESE names.
 */
const CUSTOM: ConsentCategory[] = [
  {
    key: 'essential', required: true,
    labelKey: 'consent.essential.label', descriptionKey: 'consent.essential.description',
  },
  {
    key: 'telemetry',
    labelKey: 'consent.telemetry.label', descriptionKey: 'consent.telemetry.description',
    globalVar: 'harnessTelemetry',
    signals: ['analytics_storage'],
  },
]

const categories = params.get('categories') === 'custom' ? CUSTOM : DEFAULT_CONSENT_CATEGORIES

/**
 * One service under a category in force, and one under a category that is not — the second is
 * what proves a service is never silently dropped for want of a matching category.
 */
const SERVICES: ConsentService[] = [
  {
    name: 'Example Analytics', provider: 'Example Corp', category: 'analytics',
    purpose: 'Counts page views.', cookies: ['_ex', '_ex_1'],
    privacyHref: 'https://example.test/vendor-privacy',
  },
  { name: 'Orphan Pixel', provider: 'Orphan Ltd', category: 'nowhere' },
]

const translate = params.get('categories') === 'custom'
  // Only the custom keys need wording; everything else falls through to the packaged bundle,
  // which is exactly how a consumer with one extra category is expected to wire it.
  ? (key: string, defaultValue: string): string => key === 'consent.telemetry.label'
    ? 'Telemetry'
    : key === 'consent.telemetry.description' ? 'Product telemetry.' : defaultValue
  : undefined

const App: FC = () => {
  // Re-mounting on demand proves a decision SURVIVES a mount rather than merely a render — the
  // migration case is meaningless otherwise.
  const [generation, setGeneration] = useState(0)

  return <div>
    <button id="remount" onClick={() => setGeneration(g => g + 1)}>remount</button>
    <span id="generation">{generation}</span>
    {params.get('view') === 'policy' && <CookiePolicy
      key={`policy-${generation}`}
      locale={params.get('locale') ?? undefined}
      categories={categories}
      operator="Acme"
      privacyHref="https://example.test/privacy"
      termsHref="https://example.test/terms"
      services={params.get('services') != null ? SERVICES : undefined}
    />}
    {/*
      Mounted in EVERY view, including alongside the policy page — that is how an application
      wires it (once, at the root) and it is what makes the policy's "manage preferences" button
      mean anything: the button asks the store to open, and something has to be listening.
    */}
    <CookieConsent
      key={`consent-${generation}`}
      locale={params.get('locale') ?? undefined}
      categories={categories}
      translate={translate}
      policyHref="/cookies"
      links={[{ href: 'https://example.test/privacy', labelKey: 'consent.privacy', defaultLabel: 'Privacy Policy' }]}
    />
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
