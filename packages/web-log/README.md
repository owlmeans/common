# @owlmeans/web-log

The consent gate for analytics in the browser: `consentedAnalyticsPlugin` turns any sender into a
`@owlmeans/log` plugin that sends an event only while the visitor has granted a consent category.
Application code logs a business event once with `{ analytics: 'event.name' }`; the plugins
registered decide where it goes. A web app uses it for an analytics system of its own (a beacon, a
first-party endpoint); a tag vendor's package builds its sink on it (connect's `@owlmeans/web-gtm`:
`gtmAnalyticsPlugin`, the tag-manager queue). It names no analytics vendor, loads no tag, does not
record consent (that is `@owlmeans/consent` and the `@owlmeans/web-consent` UI) and is not a logger:
the calls themselves are `@owlmeans/log`. The `web-log` skill covers this package; the `logging`
skill sets the policy for log lines and analytics events.

## Installation

```bash
bun add @owlmeans/web-log@^0.2.0-alpha.1
```

## Concepts

- **Analytics as a call option** — `log.info(message, data, { analytics })` from `@owlmeans/log`
  delivers an `AnalyticsEvent` to every registered plugin's `track`. A string names the event; with
  `analytics: true` the name is `options.event`, else the message.
- **Consent gate** — the plugin checks `consentStore.granted(category)` (default
  `CONSENT_ANALYTICS`, `'analytics'`) on every event.
- **Drop, never queue** — an event that arrives without consent is discarded. A tag queue replays
  everything waiting in it when its tag loads, so a held event would be sent for a moment the
  visitor never agreed to.
- **Payload** — by default `{ event, ...data }`; a non-object `data` becomes `{ value }`. `map`
  replaces the shape per plugin.
- **One plugin per sink** — each analytics system is its own named plugin with its own allow-list.
  Registering a plugin with an existing name replaces the earlier one.

## Usage

### 1. Register a sink at startup

```typescript
import { addLogPlugin } from '@owlmeans/log'
import { consentedAnalyticsPlugin } from '@owlmeans/web-log'

addLogPlugin(consentedAnalyticsPlugin(
  payload => navigator.sendBeacon('/metrics', JSON.stringify(payload)),
  { name: 'beacon', allow: ['project.created', 'sign_in'] },
))
```

### 2. Emit an event from application code

```typescript
import { logger } from '@owlmeans/log'

const log = logger('projects')

log.info('Created', { kind: 'web' }, { analytics: 'project.created' })
// with analytics consent: the sink receives { event: 'project.created', kind: 'web' }
// without it: nothing is sent, now or after a later grant

// count it without writing a console line
log.info('Signed in', undefined, { analytics: 'sign_in', console: false })
```

A call without `analytics` never reaches the plugins' `track`, whatever its level.

### 3. Reshape, filter, gate on another category

```typescript
import { CONSENT_MARKETING } from '@owlmeans/consent'
import { addLogPlugin } from '@owlmeans/log'
import { consentedAnalyticsPlugin } from '@owlmeans/web-log'

addLogPlugin(consentedAnalyticsPlugin(sendToAds, {
  name: 'ads',
  category: CONSENT_MARKETING,
  allow: ['purchase'],
  map: event => ({ name: event.event, scope: event.scope, at: event.time }),
}))
```

## API

| Symbol | Kind | Purpose |
|---|---|---|
| `consentedAnalyticsPlugin(send, options?)` | function → `LogPlugin` | Consent-gated sink calling `send(payload)`; name `'web-analytics'` unless overridden |
| `ConsentedAnalyticsOptions` | type | Its options (below) |

### `ConsentedAnalyticsOptions`

| Field | Default | Meaning |
|---|---|---|
| `name` | `'web-analytics'` | Plugin name; a second plugin of the same name replaces the first |
| `category` | `CONSENT_ANALYTICS` | Consent category that must be granted at send time |
| `allow` | every event | Event names this plugin sends |
| `map(event)` | `{ event, ...data }` | Reshape an `AnalyticsEvent`; return `undefined` to drop it |

The order of checks per event is: allow-list, consent, `map`, send.

## Common pitfalls

- Do not call an analytics API from components — log the event and let a plugin apply the consent
  gate.
- Plugins only implement `track`: a log line without the `analytics` option is never sent. The log
  level does not filter analytics, and `console: false` only silences the console sink.
- Events emitted before consent is granted are lost by design; do not add your own buffer in `send`.
- Two plugins with the default name leave only the last one registered — pass `name` for each.
- Never put personal content into analytics `data` — `@owlmeans/log` redacts known secret keys, but
  user text and e-mail addresses are the caller's responsibility.
- The tag-manager sink that used to live here is connect's `@owlmeans/web-gtm`
  (`gtmAnalyticsPlugin`, same options and behaviour), built on this gate.

## Related packages

- [`@owlmeans/log`](../log) — `logger`, `addLogPlugin`, `LogPlugin`, `AnalyticsEvent`
- [`@owlmeans/consent`](../consent) — `consentStore` and the consent category constants
- [`@owlmeans/web-gtm`](https://github.com/owlmeans/connect/tree/main/packages/web-gtm) (OwlMeans connect) — the tag-manager sink over this gate, and the tag itself
- [`@owlmeans/web-consent`](../web-consent) — the consent banner and preferences UI
- [`@owlmeans/viable-log`](../viable-log) — the analytics plugin for apps generated by viable

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.1
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
