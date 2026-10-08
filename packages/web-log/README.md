# @owlmeans/web-log

Consent-gated analytics plugins for `@owlmeans/log` in the browser. Application code logs a business
event once with `{ analytics: 'event.name' }`; the plugins registered here decide where it goes —
`gtmAnalyticsPlugin` pushes it onto `window.dataLayer` for a tag manager, `consentedAnalyticsPlugin`
hands it to any sender you supply — and both send only while the visitor has granted the analytics
consent category. A web app uses it whenever it counts events in GTM or another analytics system.
It does not load the tag manager script (that is `@owlmeans/web-gtm`), does not record consent (that
is `@owlmeans/consent` and the `@owlmeans/web-consent` UI) and is not a logger: the calls themselves
are `@owlmeans/log`. The `web-log` skill covers this package; the `logging` skill sets the policy for
log lines and analytics events.

## Installation

```bash
bun add @owlmeans/web-log@^0.1.18-rc.2
```

## Concepts

- **Analytics as a call option** — `log.info(message, data, { analytics })` from `@owlmeans/log`
  delivers an `AnalyticsEvent` to every registered plugin's `track`. A string names the event; with
  `analytics: true` the name is `options.event`, else the message.
- **Consent gate** — a plugin built here checks `consentStore.granted(category)` (default
  `CONSENT_ANALYTICS`, `'analytics'`) on every event.
- **Drop, never queue** — an event that arrives without consent is discarded. A tag manager replays
  its queue when it loads, so a held event would be sent for a moment the visitor never agreed to.
- **Payload** — by default `{ event, ...data }`; a non-object `data` becomes `{ value }`. `map`
  replaces the shape per plugin.
- **One plugin per sink** — each analytics system is its own named plugin with its own allow-list.
  Registering a plugin with an existing name replaces the earlier one.

## Usage

### 1. Register the tag-manager sink at startup

```typescript
import { addLogPlugin } from '@owlmeans/log'
import { gtmAnalyticsPlugin } from '@owlmeans/web-log'

addLogPlugin(gtmAnalyticsPlugin({ allow: ['project.created', 'sign_in'] }))
```

### 2. Emit an event from application code

```typescript
import { logger } from '@owlmeans/log'

const log = logger('projects')

log.info('Created', { kind: 'web' }, { analytics: 'project.created' })
// with analytics consent: window.dataLayer.push({ event: 'project.created', kind: 'web' })
// without it: nothing is pushed, now or after a later grant

// count it without writing a console line
log.info('Signed in', undefined, { analytics: 'sign_in', console: false })
```

A call without `analytics` never reaches the plugins' `track`, whatever its level.

### 3. Add a second analytics system

`consentedAnalyticsPlugin` is the same gate over any sender. Give it a distinct `name` so it does not
replace the GTM plugin.

```typescript
import { addLogPlugin } from '@owlmeans/log'
import { consentedAnalyticsPlugin } from '@owlmeans/web-log'

addLogPlugin(consentedAnalyticsPlugin(
  payload => navigator.sendBeacon('/metrics', JSON.stringify(payload)),
  {
    name: 'beacon',
    allow: ['subscription.started'],
    map: event => ({ name: event.event, scope: event.scope, at: event.time }),
  }
))
```

### 4. Gate on a different consent category

```typescript
import { CONSENT_MARKETING } from '@owlmeans/consent'
import { gtmAnalyticsPlugin } from '@owlmeans/web-log'

addLogPlugin(gtmAnalyticsPlugin({ name: 'gtm-ads', category: CONSENT_MARKETING, allow: ['purchase'] }))
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `gtmAnalyticsPlugin(options?)` | function → `LogPlugin` | Consent-gated sink pushing onto `window.dataLayer` (created when missing); name `'gtm'` unless overridden; no-op outside a browser |
| `consentedAnalyticsPlugin(send, options?)` | function → `LogPlugin` | Consent-gated sink calling `send(payload)`; name `'web-analytics'` unless overridden |
| `ConsentedAnalyticsOptions` | type | Options of both factories (below) |
| `DataLayerWindow` | type | `{ dataLayer?: unknown[] }` — the window shape the GTM sink writes to |

### `ConsentedAnalyticsOptions`

| Field | Default | Meaning |
|---|---|---|
| `name` | `'gtm'` / `'web-analytics'` | Plugin name; a second plugin of the same name replaces the first |
| `category` | `CONSENT_ANALYTICS` | Consent category that must be granted at send time |
| `allow` | every event | Event names this plugin sends |
| `map(event)` | `{ event, ...data }` | Reshape an `AnalyticsEvent`; return `undefined` to drop it |

The order of checks per event is: allow-list, consent, `map`, send.

## Common pitfalls

- Do not call `window.dataLayer.push` from components — log the event and let the plugin apply the
  consent gate.
- Plugins only implement `track`: a log line without the `analytics` option is never sent. The log
  level does not filter analytics, and `console: false` only silences the console sink.
- Events emitted before consent is granted are lost by design; do not add your own buffer in `send`.
- Two `gtmAnalyticsPlugin` calls with the default name leave only the last one registered — pass
  `name` for each extra plugin.
- Never put personal content into analytics `data` — `@owlmeans/log` redacts known secret keys, but
  user text and e-mail addresses are the caller's responsibility.
- Loading the GTM script is separate: this package only feeds `dataLayer`; `@owlmeans/web-gtm` loads
  the tag and signals consent mode.

## Related packages

- [`@owlmeans/log`](../log) — `logger`, `addLogPlugin`, `LogPlugin`, `AnalyticsEvent`
- [`@owlmeans/consent`](../consent) — `consentStore` and the consent category constants
- [`@owlmeans/web-gtm`](../web-gtm) — loads the tag manager with consent mode
- [`@owlmeans/web-consent`](../web-consent) — the consent banner and preferences UI
- [`@owlmeans/viable-log`](../viable-log) — the analytics plugin for apps generated by viable

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.49
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
