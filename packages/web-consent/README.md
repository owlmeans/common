# @owlmeans/web-consent

The React components of OwlMeans cookie consent: the preferences dialog with its persistent re-open
button, a menu row for hosts that reopen it from their own navigation, the generated cookie-policy
page, and the `useConsent` hooks. It re-exports a named selection of `@owlmeans/consent` (the store,
storage, Consent Mode and linker helpers, constants and types), so a web app usually needs one
import. Any React surface uses it — a panel app, a generated app, an Astro island — because it
depends on no shadcn primitive, no `@` alias and no OwlMeans context. An app built on
`@owlmeans/web-panel` mounts `PanelCookieConsent` / `PanelCookiePolicy` from
`@owlmeans/web-panel/consent` instead, which binds these components to OwlMeans i18n; code that only
needs the model (no React) imports `@owlmeans/consent`; the Google tag snippet is `@owlmeans/web-gtm`.
The `web-consent` skill covers the components, the `consent` skill the model behind them.

## Installation

```bash
bun add @owlmeans/web-consent@^0.1.18-rc.44
```

Peer dependencies the app provides: `react`, `tailwindcss`, `tailwind-merge`, `clsx`, `lucide-react`.

The components emit Tailwind classes that appear nowhere in the app's own sources, so the app's
Tailwind entry must scan the package's `src`:

```css
@import "tailwindcss";

@source "<relative path to node_modules>/@owlmeans/web-consent/src";
```

## Concepts

- **Category** — a `ConsentCategory` (`essential` required, `analytics`, `marketing` by default). A
  required category is disclosure, not a question: it renders locked and labelled *Required*.
- **Record** — the visitor's decision, `ConsentRecord`, stored under `site_cookie_consent` in both
  localStorage and a cookie.
- **Store** — `consentStore`, a module singleton: consent belongs to the document, not to a component
  tree. Both hooks subscribe to it through `useSyncExternalStore`.
- **Reason** — why the dialog is open: `'initial'` (no record), `'reopen'`, or `'login'` (raised by
  the sign-in precondition, which relabels the primary action *Accept & continue*).
- **Parity** — the category set, `storageKey`, `cookieDays` and `cookieDomain` given to the dialog
  must match what stamps the head snippet and what renders the policy page.
- **Linker** — optional cross-domain consent (`linker: { domains }`): a decision made on one listed
  first-party domain is carried to another by a decorated link.

## Usage

### 1. Mount it once

At the application root or layout. It opens itself when no decision is stored and renders only the
re-open button once one is. A first-time visitor is asked with a tall bar across the bottom of a
dimmed overlay — "Cookie preferences", "Accept only mandatory", "Accept all" — and every later
opening is the preferences window; `mode="window"` asks with the window straight away.

```tsx
import { CookieConsent } from '@owlmeans/web-consent'

export const Layout = ({ children, locale }: { children: ReactNode, locale: string }) => <>
  {children}
  <CookieConsent
    locale={locale}
    policyHref="/legal/cookies"
    links={[{ href: '/legal/privacy', labelKey: 'privacy', defaultLabel: 'Privacy Policy' }]}
  />
</>
```

Pass `geo={{ cloudflare: true }}` on a Cloudflare-proxied host to ask only visitors located in a
consent country (a spinner shows while they are located; anyone else is decided for automatically —
see `@owlmeans/consent`). Pass `linker={{ domains: ['owlmeans.com', 'owlmeans.pl'] }}` to share the
decision across domains; the surface then discloses the domain list. `noReopenButton` hides the floating button for an app
that offers a footer link calling `consentStore.open('reopen')`.

### 2. Read the decision

```tsx
import { consentStore, useConsentCategory, CONSENT_ANALYTICS } from '@owlmeans/web-consent'

export const AnalyticsChart = () => {
  const allowed = useConsentCategory(CONSENT_ANALYTICS)   // subscribes, does not init

  return allowed ? <Chart /> : <p>Enable analytics cookies to see this chart.</p>
}

// outside React — a click handler, a service
if (consentStore.granted(CONSENT_ANALYTICS)) {
  startTracking()
}
```

`useConsent(opts?)` returns the whole model (`record`, `open`, `reason`, `granted`, `save`,
`acceptAll`, `openDialog`, `close`) but also runs `consentStore.init(opts)` on mount — use it only
where the dialog's own options are in hand.

### 3. Reopen from a host menu

```tsx
import { ConsentMenuWidget } from '@owlmeans/web-consent'

<nav aria-label="Settings">
  <ConsentMenuWidget locale={locale} className="px-3 py-2" />
</nav>
```

The row calls `consentStore.open('reopen')` (or your `onSelect`). It does not hide the floating
button by itself; pass `noReopenButton` to `CookieConsent` when the menu fully replaces it.

### 4. Render the cookie policy

```tsx
import { CookiePolicy } from '@owlmeans/web-consent'
import { googleTagHelper } from '@owlmeans/web-gtm'

<CookiePolicy
  locale={locale}
  operator="Example Sp. z o.o."
  privacyHref="/legal/privacy"
  termsHref="/legal/terms"
  services={googleTag !== '' ? googleTagHelper.googleTagServices(googleTag) : undefined}
/>
```

The page lists the categories in force, the services each one gates (unmatched services go to a
trailing *Other services* item), the storage key, the retention and, with `linker`, the domains. It
ends with a *Manage preferences* button that reopens the dialog.

### 5. Build your own dialog body

`ConsentToggle` is one accessible category row; its wording is the caller's, already resolved.

```tsx
import { ConsentToggle } from '@owlmeans/web-consent'

<ConsentToggle
  id="cc-analytics" label="Analytics" description="Helps us understand usage."
  checked={draft.analytics === true} requiredLabel="Required"
  onChange={value => setDraft({ ...draft, analytics: value })}
/>
```

## API

### Components and hooks

| Symbol | Kind | Purpose |
|---|---|---|
| `CookieConsent` | component (`CookieConsentProps`) | The consent UI — the bar, the preferences window, the locating spinner — and the floating re-open button (`[data-consent-reopen]`) |
| `CONSENT_DEFAULT_MODE`, `ConsentDisplayMode` | const, type | `'bar'`; `'bar' \| 'window'` |
| `ConsentMenuWidget` | component (`ConsentMenuWidgetProps`) | One menu row reopening the dialog; never initialises the store |
| `CookiePolicy` | component (`CookiePolicyProps`) | The generated cookie-policy page |
| `ConsentToggle` | component (`ConsentToggleProps`) | One category row with a switch; locked when `required` |
| `useConsent(opts?)` | hook → `UseConsentModel` | Full consent state and actions; **initialises the store on mount** |
| `useConsentCategory(key)` | hook → `boolean` | Whether one category is granted (false while no record exists); no init |

### Props

| Type | Fields |
|---|---|
| `CookieConsentProps` | `locale?`, `categories?`, `translate?`, `mode?`, `geo?`, `policyHref?`, `links?: ConsentLink[]`, `storageKey?`, `cookieDays?`, `cookieDomain?`, `silent?`, `noReopenButton?`, `className?` (the window's card), `barClassName?`, `linker?` |
| `CookiePolicyProps` | `locale?`, `translate?`, `categories?`, `operator?`, `privacyHref?`, `termsHref?`, `storageKey?`, `cookieDays?`, `services?: ConsentService[]`, `className?`, `linker?`, `geo?` (adds the regional rule) |
| `ConsentMenuWidgetProps` | `locale?`, `translate?`, `label?`, `className?`, `onSelect?` |
| `ConsentToggleProps` | `id`, `label`, `description`, `checked`, `required?`, `requiredLabel`, `onChange(value)` |
| `ConsentLink` | `{ href, labelKey, defaultLabel }` |
| `UseConsentModel` | `{ record, open, reason, locating, granted(key), save(record), acceptAll(), openDialog(reason?), close() }` |

`translate` is `(key, defaultValue) => string`; without it the packaged bundle for `locale` is used
(`CONSENT_LOCALES`: en, pl, ru, be, uk, es, de, fr; anything else falls back to English).

### Re-exported from `@owlmeans/consent`

| Group | Symbols |
|---|---|
| Store | `consentStore` |
| Helpers | `consentStorageHelper`, `consentModeHelper`, `consentI18nHelper`, `consentPluginHelper`, `consentLinkHelper`, `consentGeoHelper` |
| Geo gate | `CONSENT_REQUIRED_COUNTRIES`, `CONSENT_COUNTRIES_GDPR`, `CONSENT_COUNTRIES_ALIGNED`, `CONSENT_COUNTRIES_OPT_IN`, `CONSENT_GEO_UNKNOWN`, `CONSENT_TRACE_PATH`, `CONSENT_GEO_TIMEOUT`, `CONSENT_AUTO_MAX_AGE`, `CONSENT_IDLE_STATE`, `CONSENT_STATE_ATTRIBUTE` and the types `ConsentGeoOptions`, `ConsentGeoPlugin`, `ConsentGeoLocation`, `ConsentCloudflareOptions`, `ConsentLocating`, `ConsentGeoHelper`, `ConsentGeoVerdict`, `ConsentAutoState` |
| Defaults | `DEFAULT_CONSENT_CATEGORIES`, `DEFAULT_CONSENT_MESSAGES` |
| Constants | `CONSENT_KEY`, `CONSENT_COOKIE_DAYS`, `CONSENT_SCHEMA_VERSION`, `CONSENT_LOCALES`, `CONSENT_ESSENTIAL`, `CONSENT_ANALYTICS`, `CONSENT_MARKETING`, `CONSENT_LANGUAGE_KEY`, `CONSENT_EVENT`, `CONSENT_LINK_PARAM`, `CONSENT_LINK_MAX_AGE`, `CONSENT_LINK_SKEW` |
| Deprecated wrappers | `openConsent`, `isConsented`, `readConsent`, `writeConsent`, `clearConsent`, `consentBootstrapScript`, `defaultConsentTranslate`, `decorateConsentUrl`, `encodeConsentLink`, `consentLinkerScript` — use the helper members instead |
| Types | `ConsentCategory`, `ConsentOptions`, `ConsentReason`, `ConsentRecord`, `ConsentService`, `ConsentSignal`, `ConsentState`, `ConsentStore`, `ConsentLocale`, `ConsentLinkerOptions`, `ConsentLinkerLanguage`, `ConsentPlugin`, `ConsentLinkPayload`, and the five helper interfaces |

`makeConsentStore`, `CONSENT_SETUP_FLAG`, `CONSENT_SIGNAL_DEFAULTS` and `ConsentListener` are not
re-exported; import them from `@owlmeans/consent`.

## Test and styling hooks

| Selector | Element |
|---|---|
| `[data-consent-dialog]` | whichever surface asks — the bar or the window (`data-consent-mode="bar\|window"`) |
| `[data-consent-bar]`, `[data-consent-overlay]` | the bar, and the dimmed overlay it sits on |
| `[data-consent-preferences]`, `[data-consent-mandatory]`, `[data-consent-accept-all]` | the bar's three answers |
| `[data-consent-save]`, `[data-consent-accept-all]` | the window's two actions |
| `[data-consent-locating="first"]`, `[data-consent-spinner]` | the locating overlay and its spinner |
| `[data-consent-links]`, `[data-consent-auto]` | the legal links row; the "applied automatically" line |
| `html[data-consent]` | the phase: `locating`, `open`, `decided`, `idle` |
| `[data-consent-reopen]` | the floating re-open button |
| `[data-consent-reason]`, `[data-consent-domains]` | login-reason line, disclosed domains |
| `[data-consent-menu-widget]` | the menu row |
| `[data-cookie-policy]`, `[data-cookie-policy-category="<key>"]`, `[data-cookie-policy-services]`, `[data-cookie-policy-service]`, `[data-cookie-policy-other]`, `[data-cookie-policy-domains]`, `[data-cookie-policy-regional]`, `[data-cookie-policy-manage]` | the policy page |

## Common pitfalls

- Pointing `@source` at `build` instead of `src`: under a linked workspace it scans zero files and
  the dialog renders half-styled with no error. Verify with `grep -c 'max-w-lg' dist/assets/*.css`.
- A bare `useConsent()` in a component that only reads opens the dialog for a first-time visitor and
  may fix the Consent Mode defaults from the default categories. Read with `useConsentCategory` or
  `consentStore.granted`.
- `useConsent` reads `opts` only on its mounting pass; changing them later has no effect.
- Passing `translate` disables the packaged bundle entirely — a resolver must fall back to
  `consentI18nHelper.defaultConsentTranslate(locale)` or every unmapped key renders in English.
- Different `categories`, `storageKey`, `cookieDays` or `cookieDomain` between the dialog, the head
  snippet and the policy page make them disagree about what was asked.
- Do not add decorative classes (gradients, shadows, blur) to the dialog; the package tests reject
  them, and the look comes from the host's theme tokens.
- `silent` suppresses runtime `dataLayer` and global writes only; the stamped bootstrap snippet still
  pushes Consent Mode commands.

## Related packages

- [`@owlmeans/consent`](../consent) — the model: categories, storage, store, Consent Mode, linker
- [`@owlmeans/web-gtm`](../web-gtm) — the Google tag head snippet and `googleTagServices` for the policy page
- [`@owlmeans/web-panel`](../web-panel) — `./consent` subpath binding these components to OwlMeans i18n
- [`@owlmeans/web-log`](../web-log) — consent-gated analytics plugins for `@owlmeans/log`
- [`@owlmeans/astro`](../astro) — stamping the consent scripts from a static site's layout

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
