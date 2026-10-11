# @owlmeans/web-marketing-consent

The browser half of `@owlmeans/marketing-consent`: a post-sign-in "Agreements and consents" step,
a reusable settings-card body for changing choices later, the headless `useMarketingConsent` model
both share, and a fail-open `MarketingConsentClientService` that calls the server's `status` /
`save` / `terms` routes. `appendMarketingConsent` registers the client, the login step and a
terms-recording landing hook in one call. A web app uses it when its server runs
`@owlmeans/server-marketing-consent`. It never touches device cookie consent — that dialog is
`@owlmeans/web-consent` over `@owlmeans/consent`.

## Installation

```bash
bun add @owlmeans/web-marketing-consent@^0.1.18-rc.17
```

Peer dependencies: `react`, `react-dom`, `tailwindcss`, `@radix-ui/react-label`,
`@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`.

## Concepts

- **Client service** — `MarketingConsentClientService` at `MARKETING_CONSENT_CLIENT_SERVICE`. It never
  calls the API while signed out and never throws: failures return `null` / `false`. `status()`
  caches the last view unless called with `{ fresh: true }`.
- **Login step** — `marketingConsentStep`, a `LoginStep` registered with `@owlmeans/client-auth`.
  Pending while the status has anything `new` or `revised` and this sign-in has not skipped it; a
  failed read means not pending.
- **Terms mode** — `terms: 'step'` moves the Terms confirmation from the sign-in screen onto this
  step. In that mode the step is required and strict: a failed read or a terms version mismatch
  keeps it pending, and Skip is never offered while the Terms row is up.
- **Terms recorder** — `termsRecorder`, a landing hook that copies a Terms acceptance confirmed on
  the sign-in screen to the server once a sign-in lands.
- **Skip marker** — a `localStorage` entry keyed by the sign-in's `sessionId` (or token); a skip lasts
  for this sign-in only.
- **Body vs frame** — `MarketingConsentBody` is the step without page chrome; `MarketingConsentScreen`
  is a plain centered frame around it.

## Usage

### Wire the step into a web app

The protocol tree comes from `makeMarketingConsentProtocols` in a shared package and is the same
object the server serves.

```tsx
import { makeMarketingConsentProtocols } from '@owlmeans/marketing-consent'
import { appendMarketingConsent, marketingConsentEntrypoints } from '@owlmeans/web-marketing-consent'

export const marketingConsentProtocols = makeMarketingConsentProtocols({ parent: appProtocols.account.base })

// in the web app's makeContext
appendMarketingConsent(context, { protocols: marketingConsentProtocols })

context.registerEntrypoints([
  ...entrypoints,
  ...marketingConsentEntrypoints(marketingConsentProtocols),   // the screen only
])
```

`base`, `status`, `save` and `terms` are ordinary backend routes; the app binds them with its own
`bindAll`, as it does for any other API.

### Options

```tsx
appendMarketingConsent(context, {
  protocols: marketingConsentProtocols,
  step: true,                     // register the post-sign-in step (default)
  terms: 'step',                  // true (default) | false | 'step'
  preferences: 'account:privacy', // alias of the app's "Privacy choices" screen
  bulkSelection: 'required',      // 'all' (default) | 'required'
  locale: 'en',
})
```

### Put the step in the app's own layout

```tsx
import { handler } from '@owlmeans/client'
import { bindScreen } from '@owlmeans/client-entrypoint'
import { MarketingConsentBody } from '@owlmeans/web-marketing-consent'

const ConsentStep = () => (
  <AppLayout>
    <div className="mx-auto max-w-2xl empty:hidden">
      <MarketingConsentBody />
    </div>
  </AppLayout>
)

context.registerEntrypoint(bindScreen(marketingConsentProtocols.screen, handler(ConsentStep)))
```

The body renders nothing once nothing is pending and continues the login flow by itself, so a frame
should hide itself while empty.

### A settings card

```tsx
import { MarketingConsentPreferences } from '@owlmeans/web-marketing-consent'

export const PrivacyChoices = () => (
  <section>
    <h2>Privacy choices</h2>
    <MarketingConsentPreferences onSaved={() => toast('Saved')} />
  </section>
)
```

The card loads the whole catalogue (not only pending items), has no Terms row and no Skip, and
saves with `source: 'settings'`.

### Read the status elsewhere

```tsx
import { MARKETING_CONSENT_CLIENT_SERVICE } from '@owlmeans/web-marketing-consent'
import type { MarketingConsentClientService } from '@owlmeans/web-marketing-consent'

const client = context.service<MarketingConsentClientService>(MARKETING_CONSENT_CLIENT_SERVICE)
const view = await client.status()          // cached when available; null on failure or signed out
const link = client.preferences()           // the configured "Privacy choices" alias, if any
```

### Make Tailwind see the package classes

```css
@source "../../../node_modules/@owlmeans/web-marketing-consent/src";
```

Point at `src`, not `build`.

## API

### Functions and hooks

| Symbol | Kind | Purpose |
|---|---|---|
| `appendMarketingConsent(ctx, opts)` | function | Client service + login step + terms landing hook |
| `marketingConsentEntrypoints(protocols)` | function | `[bindScreen(protocols.screen, handler(MarketingConsentScreen))]` |
| `makeMarketingConsentClient(protocols, opts?)` | function | Builds the lazy `MarketingConsentClientService` |
| `appendMarketingConsentClient(ctx, protocols, opts?)` | function | Registers it unless the alias exists |
| `marketingConsentStep(client, entrypointAlias, opts?)` | function | The `LoginStep`; `opts.confirmsTerms` enables Terms mode |
| `termsRecorder(client, locale?)` | function | The `LoginLandingHook` (priority 100) |
| `marketingConsentSkipOf(ctx)` | function | Memoized `{ isSkipped(), markSkipped() }` |
| `makeMarketingConsentSkipHelper(ctx)` | function | Builds a `MarketingConsentSkipHelper` |
| `useMarketingConsent(opts?)` | hook | `UseMarketingConsentModel`; `opts` is `{ source?: 'sign-in' \| 'settings', locale? }` |

### Components

| Symbol | Props | Purpose |
|---|---|---|
| `MarketingConsentBody` | `{ className? }` | The step: loading, Terms row, optional-only, unreadable and empty states |
| `MarketingConsentScreen` | `RoutedComponent` | Centered frame up to 768px around the body |
| `MarketingConsentPreferences` | `{ translate?, className?, onSaved? }` | Settings-card body |

### Constants

| Symbol | Value |
|---|---|
| `MARKETING_CONSENT_CLIENT_SERVICE` | `'marketing-consent-client'` |
| `MARKETING_CONSENT_LOGIN_STEP` | `'marketing-consent'` |
| `MARKETING_CONSENT_LANDING_HOOK_TERMS` | `'marketing-consent:terms'` |
| `MARKETING_CONSENT_SKIP_STORAGE` | `'_owlmeans-marketing-consent-skipped'` |
| `MARKETING_CONSENT_I18N` | `'marketing-consent'` — the same resource as `@owlmeans/marketing-consent` |
| `AUTH_I18N` | `'auth'` — the sign-in screen's resource the Terms row reads |

### Types

`MarketingConsentAppendOptions`, `MarketingConsentBulkSelection`, `MarketingConsentClientService`,
`MarketingConsentClientContext`, `MakeMarketingConsentClientOptions`, `MarketingConsentStepOptions`,
`MarketingConsentSkipHelper`, `UseMarketingConsentModel`, `UseMarketingConsentOptions`,
`MarketingConsentGroup`, `MarketingConsentTermsModel`, `MarketingConsentPreferencesProps`,
`MarketingConsentBodyProps`, `ConsentFieldsProps`, `ConsentRowProps`, `ConsentTermsProps`,
`ConsentPrivacyNoticeProps`, `Translate`, `InlineLink`, `RowText`, `InlineHelper`.

## i18n

`screen.*` and `preferences.*` keys are added to the `marketing-consent` resource in `en`, `pl`,
`ru`, `be`, `uk`, `es`, `de` and `fr`; the consent statements come from `@owlmeans/marketing-consent`
under the same resource. The Terms row and privacy notice reuse the sign-in screen's `auth`
resource. An app adds its own consents' words with `i18nHelper.addI18nLib(lng, 'marketing-consent', …)`.

## Testing

`bun test ./tests` drives Chromium against a Vite harness built on the real `@owlmeans/web-client`
context; `status` / `save` / `terms` are stubbed with `page.route`. UI specs address
`data-marketing-consent-*` attributes (`-item="<key>"`, `-all`, `-save`, `-skip`, `-terms`, `-error`,
`-preferences-save` and others), which `@owlmeans/test-ui`'s page helper also reads — do not rename
them.

## Common pitfalls

- Missing the `@source` line, or pointing it at `build` — the screens render unstyled.
- Binding only `marketingConsentEntrypoints` — the API routes also need the app's own `bindAll`.
- Passing different protocol objects to the web and server sides.
- Expecting `opts.config` to change the catalogue in the browser — it is accepted but not read; the
  server resolves the catalogue.
- Rendering `MarketingConsentPreferences` as the login step — it never continues the login flow.
- A custom headless host that does not pass the live UI locale to `useMarketingConsent` records the
  wrong language with the decisions.
- `terms: 'step'` together with `step: false` behaves like `terms: true`.

The `web-marketing-consent` skill covers the states, the Terms mode and the attribute contract in
depth; `marketing-consent` and `server-marketing-consent` cover the contracts and the server.

## Related packages

- [`@owlmeans/marketing-consent`](../marketing-consent) — catalogue, status resolution, protocol tree
- [`@owlmeans/server-marketing-consent`](../server-marketing-consent) — handlers for `status` / `save` / `terms`
- [`@owlmeans/client-auth`](../client-auth) — login steps, landing hooks, `loginTermsHelper`
- [`@owlmeans/web-consent`](../web-consent) — device cookie consent, a separate surface
- [`@owlmeans/web-oauth`](../web-oauth) — the same screen-only binding split for OAuth consent

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
