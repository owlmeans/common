# @owlmeans/marketing-consent

Shared contracts for person-level marketing and data-use consent: the standard six-key catalogue,
revision-aware status resolution (`new` / `revised` / `current`, with Global Privacy Control
honouring), terms acceptance, AJV request schemas, the guarded protocol tree and an error family.
Server and browser code import it to agree on keys, wire shapes and how a person's saved decisions
fold into what a screen shows. It holds no storage, handlers or React: the decision log and handlers
are `@owlmeans/server-marketing-consent` (with `@owlmeans/marketing-consent-mongo` or
`@owlmeans/marketing-consent-postgres`), the screens are `@owlmeans/web-marketing-consent`. Device
cookie consent is a different, unrelated surface — `@owlmeans/consent`.

## Installation

```bash
bun add @owlmeans/marketing-consent@^0.1.18-rc.11
```

Peer dependencies: `ajv`, `ajv-formats`.

## Concepts

- **Definition** — `MarketingConsentDefinition`: one consent an app may ask for (`key`, `group`,
  `mode` `opt-in` / `opt-out`, `enabled`, `revisedAt`, wording, `links`, `honorGpc?`, `order?`).
- **Standard catalogue** — `STANDARD_MARKETING_CONSENTS`: six opt-in keys in two groups, stamped with
  `STANDARD_REVISION`.
- **Config** — `MarketingConsentConfig`: an app's overrides (`standard`), its own consents (`custom`)
  and extra `links`, resolved into the effective catalogue.
- **Decision** — `MarketingConsentDecision`: one saved answer (`key`, `granted`, `revisedAt`, `mode`,
  `decidedAt`, `source`). Decisions form a history; only the latest per key counts.
- **Status** — each definition folded against the decisions: `new` (never answered), `revised`
  (answered under different wording or mode), `current`.
- **Wording** — `labelKey` / `descriptionKey` resolve under the `marketing-consent` i18n resource as
  `consent.<key>.label` / `consent.<key>.description`; `{{link}}`, `{{link2}}` … placeholders mark
  where the definition's links are drawn.

## Usage

### Resolve an app's catalogue

```typescript
import { marketingConsentHelper } from '@owlmeans/marketing-consent'

const defs = marketingConsentHelper.resolveMarketingConsents({
  standard: {
    'marketing.sms': false,                             // drop a standard key
    'marketing.email': { labelKey: 'app.email.label' }, // reword one; key and group never change
  },
  custom: [{ key: 'app.newsletter', group: 'communications', mode: 'opt-in' }],
  links: { 'data.partners': [{ href: 'https://example.com/partners', labelKey: 'link.privacy' }] },
})
```

Resolution starts from the standard catalogue, applies `standard[key]`, appends `custom` (defaults
`mode: 'opt-in'`, `enabled: true`, `revisedAt: cfg.revisedAt ?? STANDARD_REVISION`), merges `links`
de-duplicated by `href`, drops `enabled === false` and sorts by `order ?? 1000`.

### Fold saved decisions into a status view

```typescript
import { marketingConsentHelper } from '@owlmeans/marketing-consent'
import type { MarketingConsentDecision } from '@owlmeans/marketing-consent'

const decisions: MarketingConsentDecision[] = await loadDecisionHistory(userId)

const view = marketingConsentHelper.consentStatus(defs, decisions, {
  gpc: true,
  termsAcceptedAt: '2026-09-30T10:00:00.000Z',
  termsVersion: '2026-09',
})

if (view.pending) {
  // at least one item is `new` or `revised` — ask the person
}
```

| Status | `opt-in` granted | `opt-out` granted |
|---|---|---|
| `current` | saved answer | saved answer |
| `new` | `false` | `true`, or `false` when `honorGpc` and `gpc` |
| `revised` | `false` | saved answer, or `false` when `honorGpc` and `gpc` |

`updated` is `true` for `revised`, and for `new` when the person has answered any consent before.
`view.terms` is set only when `termsAcceptedAt` is passed.

### Declare the protocol tree

```typescript
import { makeMarketingConsentProtocols } from '@owlmeans/marketing-consent'

export const marketingConsent = makeMarketingConsentProtocols({
  parent: 'app:account',                   // or: guards: 'guard:default', gate: { alias, params? }
  path: '/marketing-consent',              // default MARKETING_CONSENT_API_PATH
  screen: { path: '/consent/marketing' },  // default MARKETING_CONSENT_SCREEN_PATH
})
// .base, .status (GET), .save (POST), .terms (POST), .screen (sticky frontend route)
```

A base with `parent` inherits the parent's guards and gate; without `parent` it must carry `guards`.
Passing neither throws `SyntaxError` at declaration time.

### Refuse an unknown key

```typescript
import { UnknownMarketingConsentError } from '@owlmeans/marketing-consent'

const known = new Set(defs.map(def => def.key))
for (const decision of request.decisions) {
  if (!known.has(decision.key)) {
    throw new UnknownMarketingConsentError(decision.key)   // HTTP 400
  }
}
```

## API

### Functions

| Symbol | Purpose |
|---|---|
| `marketingConsentHelper.resolveMarketingConsents(cfg?)` | Effective `MarketingConsentDefinition[]` for one app |
| `marketingConsentHelper.consentStatus(defs, decisions, opts?)` | `MarketingConsentStatusView` |
| `createMarketingConsentHelper()` | Builds a `MarketingConsentHelper` (the singleton above is one) |
| `makeMarketingConsentProtocols(opts?)` | `MarketingConsentEntrypoints` — `base`, `status`, `save`, `terms`, `screen` |
| `resolveMarketingConsents(cfg?)` | Deprecated wrapper over the helper |

### Constants

| Symbol | Value / purpose |
|---|---|
| `MC_EMAIL`, `MC_SMS`, `MC_PHONE`, `MC_PUSH` | `marketing.email` / `.sms` / `.phone` / `.push` — group `communications` |
| `MC_PROFILING`, `MC_PARTNERS` | `data.profiling`, `data.partners` (`honorGpc: true`) — group `data` |
| `MC_GROUP_COMMUNICATIONS`, `MC_GROUP_DATA` | `'communications'`, `'data'` |
| `STANDARD_REVISION` | `'2026-09-25'` — wording revision of the standard catalogue |
| `STANDARD_MARKETING_CONSENTS` | The six standard definitions, `order` 10..60 |
| `MARKETING_CONSENT_SERVICE`, `MARKETING_CONSENT_I18N` | `'marketing-consent'` |
| `MARKETING_CONSENT_API_PATH`, `MARKETING_CONSENT_SCREEN_PATH` | `'/marketing-consent'`, `'/consent/marketing'` |
| `MARKETING_CONSENT_BASE`, `_STATUS`, `_SAVE`, `_TERMS`, `_SCREEN` | Protocol-tree aliases (`marketing-consent:*`) |

### Schemas

| Symbol | Validates |
|---|---|
| `SaveMarketingConsentSchema` | `SaveMarketingConsentRequest` — 1..64 decisions, `source` `sign-in` \| `settings`, optional `locale`, `gpc` |
| `TermsAcceptanceSchema` | `TermsAcceptance` — `documents` (0..16), optional `notices`, `version`, optional `locale` |

### Errors

| Symbol | Meaning |
|---|---|
| `MarketingConsentError` | Base, message `marketing-consent:*`, extends `ResilientError` |
| `UnknownMarketingConsentError` | A decision names a key the resolved catalogue lacks; `httpStatus = 400` |

### Types

`MarketingConsentMode`, `MarketingConsentSource` (`sign-in` \| `settings` \| `cookie` \| `api`),
`MarketingConsentLink` (`href`, `hrefMap?`, `labelKey?`, `label?`), `MarketingConsentDefinition`,
`MarketingConsentConfig`, `WithMarketingConsentConfig`, `MarketingConsentDecision`,
`MarketingConsentStatusItem`, `MarketingConsentStatusView`, `MarketingConsentStatusOptions`,
`TermsDocumentRef`, `TermsAcceptance`, `SaveMarketingConsentRequest`,
`MarketingConsentEntrypointOptions`, `MarketingConsentEntrypoints`, `MarketingConsentHelper`.

## i18n

Importing the package registers the `marketing-consent` resource in `en`, `pl`, `ru`, `be`, `uk`,
`es`, `de` and `fr`: group titles (`group.*`), statements and descriptions (`consent.*`), link labels
(`link.default` "Learn more", `link.privacy` "Privacy Policy") and `errors.unknown`.

## Common pitfalls

- Change the standard wording only together with a new `STANDARD_REVISION`; otherwise people who
  answered the old wording are never re-asked.
- `key` and `group` are identity — an override cannot move or rename a consent.
- Never drop an unknown key from a save silently; raise `UnknownMarketingConsentError`.
- A save request cannot carry `source: 'api'` or `'cookie'`; `'cookie'` is historical and `'api'` is
  written only by server code acting on a caller's behalf.
- `honorGpc` only suppresses a grant; it never grants.
- This catalogue does not read or write cookie consent — a cookie-banner answer is not this consent.

The `marketing-consent` skill covers the catalogue, status table and the per-key legal matrix; the
`consent` skill covers the separate cookie-consent surface.

## Related packages

- [`@owlmeans/server-marketing-consent`](../server-marketing-consent) — decision log, terms record, handlers
- [`@owlmeans/marketing-consent-mongo`](../marketing-consent-mongo) — MongoDB storage for the server package
- [`@owlmeans/marketing-consent-postgres`](../marketing-consent-postgres) — PostgreSQL storage for the server package
- [`@owlmeans/web-marketing-consent`](../web-marketing-consent) — screens, sign-in step, settings panel
- [`@owlmeans/consent`](../consent) — device cookie consent, a separate surface

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
