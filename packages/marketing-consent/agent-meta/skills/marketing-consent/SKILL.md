---
name: marketing-consent
description: How to use @owlmeans/marketing-consent — the standard 8-key marketing/data/tracker consent catalogue, revision-aware status resolution (new/revised/current, GPC honoring), terms acceptance, and the guarded consent-surface protocol tree (makeMarketingConsentProtocols). Auto-invoked when importing marketing-consent constants/types/schemas, resolving or displaying a person's consent status, saving consent decisions, or reasoning about which legal basis a marketing/tracking consent needs.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/marketing-consent

**Layer:** Domain (beside `consent`, `payment`, `planning`)
**Install:** `"@owlmeans/marketing-consent": "^0.1.18-rc.1"` in `dependencies`
**Sibling:** `@owlmeans/consent` — the cookie-consent widget. This package's two `trackers.*` keys
carry a `cookieCategory` pointing at that package's `CONSENT_ANALYTICS`/`CONSENT_MARKETING` keys,
so the two surfaces describe the SAME cookies from two angles: a banner (broad, cookie-law-shaped)
and a per-purpose settings screen (granular, marketing-shaped). A runtime wiring both must keep a
`trackers.*` decision and the matching cookie-consent category in sync — this package supplies the
seam (`MarketingConsentBridge`) but not the wiring itself, which is server- or client-specific.

Pure contracts, like `@owlmeans/oauth`: constants, types, AJV schemas, an immutable protocol-tree
factory, pure resolution functions and an error family. No server, no storage, no React — a
`@owlmeans/server-marketing-consent` (decision log, handlers) and a
`@owlmeans/web-marketing-consent` (settings screen, sign-in step) are separate, unbuilt packages
that would depend on this one.

## The 8 standard keys

`STANDARD_MARKETING_CONSENTS` — every key `opt-in`, ordered 10..80, grouped under
`MC_GROUP_COMMUNICATIONS` / `MC_GROUP_DATA` / `MC_GROUP_TRACKERS`:

| Constant | Key | Group | `cookieCategory` | `honorGpc` |
|---|---|---|---|---|
| `MC_EMAIL` | `marketing.email` | communications | — | — |
| `MC_SMS` | `marketing.sms` | communications | — | — |
| `MC_PHONE` | `marketing.phone` | communications | — | — |
| `MC_PUSH` | `marketing.push` | communications | — | — |
| `MC_PROFILING` | `data.profiling` | data | — | — |
| `MC_PARTNERS` | `data.partners` | data | — | yes |
| `MC_ANALYTICS` | `trackers.analytics` | trackers | `CONSENT_ANALYTICS` | — |
| `MC_ADVERTISING` | `trackers.advertising` | trackers | `CONSENT_MARKETING` | yes |

`STANDARD_REVISION` is the wording revision every standard definition is stamped with. Bump it (an
ISO date) whenever the standard wording changes — a saved decision under the old revision becomes
`'revised'` and is re-asked. Each `labelKey`/`descriptionKey` is `consent.<key>.label` /
`consent.<key>.description` — the key's own dots, e.g. `consent.trackers.advertising.label` — and
resolves through `MARKETING_CONSENT_I18N` (`'marketing-consent'`).

## Resolving an application's catalogue — `resolveMarketingConsents(cfg?)`

```ts
import { resolveMarketingConsents } from '@owlmeans/marketing-consent'

const defs = resolveMarketingConsents({
  standard: {
    'marketing.sms': false,                            // drop a standard key entirely
    'marketing.email': { labelKey: 'app.email.label' }, // reword one; key/group never change
  },
  custom: [{ key: 'app.newsletter', group: 'communications', mode: 'opt-in' }],
  links: { 'data.partners': [{ href: 'https://example.com/partners' }] },
})
```

Order: start from `STANDARD_MARKETING_CONSENTS`, apply `cfg.standard[key]` (a `false` drops it, an
object partially overrides it — never `key`/`group`), append `cfg.custom` (defaulted `mode:
'opt-in'`, `enabled: true`, `revisedAt: cfg.revisedAt ?? STANDARD_REVISION`), merge `cfg.links[key]`
into that definition's `links` (concatenated, de-duplicated by `href`), then drop anything with
`enabled === false` and sort by `order ?? 1000` (ties keep first-seen order — standard before
custom, declaration order within each).

## Status and the decision table — `consentStatus(defs, decisions, opts?)`

For each resolved definition, find the LATEST decision by `key` (max `decidedAt` — `decisions` may
hold history) and classify:

| Saved? | `revisedAt`/`mode` match? | Status |
|---|---|---|
| no | — | `new` |
| yes | no | `revised` |
| yes | yes | `current` |

Initial `granted`:

| Status | `opt-in` | `opt-out` |
|---|---|---|
| `current` | `saved.granted` | `saved.granted` |
| `new` | `false` | `true`, unless `honorGpc && opts.gpc` → `false` |
| `revised` | `false` | `saved.granted` (their last answer persists), unless `honorGpc && opts.gpc` → forced `false` |

`updated` is `true` on `revised`, and on `new` when `decisions.length > 0` — i.e. this person has
answered other consents before, just never this one, so the UI can say "Updated" instead of
treating a first-ever visitor specially. `view.pending` is `true` iff any item is not `current`.
`view.terms` is attached only when `opts.termsAcceptedAt` is given.

**GPC (`honorGpc`)** only ever suppresses a grant — it never grants something the definition itself
would deny, and it never overrides an opt-in default (which starts denied anyway). Only
`data.partners` and `trackers.advertising` carry it in the standard set: those are the two rows
with a real US "sale/share"/cross-context-advertising opt-out analogue.

## Protocol tree — `makeMarketingConsentProtocols(opts?)`

Same shape as `@owlmeans/oauth`'s `makeOAuthProtocols` / `@owlmeans/planning`'s
`makePlanningProtocols`: one base carrying the guard (and optional gate), four leaves hanging under
it, plus a parentless sticky screen.

```ts
const tree = makeMarketingConsentProtocols({
  parent: 'app:account',                    // OR: guards: 'guard:default', gate: { alias, params? }
  path: '/marketing-consent',               // default MARKETING_CONSENT_API_PATH
  screen: { path: '/consent/marketing' },   // default MARKETING_CONSENT_SCREEN_PATH
})
// tree.base, tree.status (GET), tree.save (POST), tree.terms (POST), tree.screen (frontend, sticky)
```

`parent` and `guards`/`gate` are exclusive, the same rule as every other guarded base in this repo:
a `parent` inherits that route's guards/gate; no `parent` means the base MUST carry `guards` itself
— status/save/terms always act on the caller's own saved decisions, so there is no ungated shape.
Passing neither throws `SyntaxError` at declaration time (a wiring mistake, not a runtime one).
`save`'s request body is schema-checked (`SaveMarketingConsentSchema` — 1..64 decisions, `source`
one of `'sign-in' | 'settings' | 'cookie'`, never `'api'`); `terms`'s is `TermsAcceptanceSchema`.

## Errors

`MarketingConsentError` (family `marketing-consent:*`, base `ResilientError`) and
`UnknownMarketingConsentError` — raise the latter when a `SaveMarketingConsentRequest` decision
names a key that `resolveMarketingConsents` did not produce for this application; do not silently
drop it, because a dropped decision is a decision the person believes they made and did not.

## Legal matrix

Rows named `Key` and jurisdiction citations for what each consent gates. **This is not legal
advice** — article numbers are believed correct as of September 2026 and must be reverified before
being relied on. `honorGpc` in the standard set is what wires the Global Privacy Control column
below into `consentStatus`'s decision table.

| Key | EU / PL / DE / FR | US |
|---|---|---|
| `marketing.email` | ePrivacy Art.13(1); PL Prawo komunikacji elektronicznej art.398 (per-channel consent, in force since 10 Nov 2024); DE UWG §7(2) Nr.2; FR CPCE L.34-5 | CAN-SPAM (opt-out baseline; this package defaults to the stricter opt-in) |
| `marketing.sms` | same as email | TCPA prior express written consent; revocation by any reasonable means (FCC rule effective 11 Apr 2025); must not condition purchase on consent |
| `marketing.phone` | PKE art.398; DE UWG §7(2) Nr.1 + §7a (written proof kept 5 years after each use) | TCPA + Telemarketing Sales Rule / Do-Not-Call |
| `marketing.push` | ePrivacy Art.5(3)/13; PKE art.398/399; DE TDDDG §25 | OS-level permission is separate; this consent gates the SEND, not the OS permission |
| `data.profiling` | GDPR Art.6(1)(a) taken as the lawful basis (worst case vs. legitimate interest), Art.21(2)-(3) right to object, Art.22 no solely-automated decisions | state privacy laws' opt-out of profiling/targeted advertising |
| `data.partners` | GDPR Art.6(1)(a) + Art.13(1)(e) recipients disclosure; CNIL 2022 guidance on partner lists for e-prospecting | CCPA/CPRA "sale/share" opt-out; honor Global Privacy Control (`honorGpc`) |
| `trackers.analytics` | ePrivacy Art.5(3); PL PKE art.399; DE TDDDG §25; CNIL cookie guidance; Planet49 (CJEU C-673/17) bars pre-ticked boxes | CCPA "sharing" definition can include analytics cookies |
| `trackers.advertising` | same as analytics, plus Google's EU User Consent Policy / Consent Mode v2 (`ad_user_data`, `ad_personalization`) | CCPA cross-context behavioral-advertising opt-out; GPC |

Consent must be freely given (GDPR Art.7(4) — nothing here may be a condition of using the
product), granular per purpose (EDPB Guidelines 05/2020), an active opt-in with no pre-ticked boxes
(Recital 32, Planet49), withdrawable as easily as it was given (Art.7(3)), and demonstrable
(Art.7(1) — this is why a future `@owlmeans/server-marketing-consent` keeps an append-only decision
log rather than overwriting `MarketingConsentDecision` rows in place).

## Key exports

| Export | Description |
|---|---|
| `MC_EMAIL` … `MC_ADVERTISING` | The 8 standard consent keys |
| `MC_GROUP_COMMUNICATIONS` · `MC_GROUP_DATA` · `MC_GROUP_TRACKERS` | The 3 groups |
| `STANDARD_REVISION` · `STANDARD_MARKETING_CONSENTS` | The wording revision and the standard catalogue |
| `MARKETING_CONSENT_SERVICE` · `MARKETING_CONSENT_I18N` · `MARKETING_CONSENT_API_PATH` · `MARKETING_CONSENT_SCREEN_PATH` | Service/i18n/wire identifiers |
| `MARKETING_CONSENT_BASE` · `MARKETING_CONSENT_STATUS` · `MARKETING_CONSENT_SAVE` · `MARKETING_CONSENT_TERMS` · `MARKETING_CONSENT_SCREEN` | Protocol-tree aliases |
| `resolveMarketingConsents(cfg?)` · `consentStatus(defs, decisions, opts?)` | Pure resolution |
| `makeMarketingConsentProtocols(opts?)` | The protocol tree |
| `SaveMarketingConsentSchema` · `TermsAcceptanceSchema` | AJV request schemas |
| `MarketingConsentError` · `UnknownMarketingConsentError` | Errors |
| Types | `MarketingConsentDefinition`, `MarketingConsentConfig`, `MarketingConsentDecision`, `MarketingConsentStatusView`/`Item`, `TermsAcceptance`, `SaveMarketingConsentRequest`, `MarketingConsentBridge`, `MarketingConsentEntrypointOptions`/`Entrypoints` |

Importing `@owlmeans/marketing-consent` also registers its 8-language i18n bundle
(`en`/`pl`/`ru`/`be`/`uk`/`es`/`de`/`fr` — `CONSENT_LOCALES`, one more than `@owlmeans/i18n`'s own
`SUPPORTED_LNGS` because it shares `fr` with `@owlmeans/consent`) as a side effect, the same as
`@owlmeans/payment` and `@owlmeans/planning` do.
