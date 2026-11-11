---
name: web-log
description: How to use @owlmeans/web-log — the consent gate for analytics plugins of @owlmeans/log in a browser. consentedAnalyticsPlugin wraps any sender so `log` calls that carry an analytics option are sent only while a consent category is granted (an event without consent is dropped, never queued); a tag vendor's sink is built on it in the vendor's package (connect's web-gtm gtmAnalyticsPlugin). Auto-invoked when sending analytics events from application code, importing consentedAnalyticsPlugin, or wiring an analytics system of your own.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-log

**Layer:** Web (depends on `@owlmeans/log` and `@owlmeans/consent`)
**Install:** `"@owlmeans/web-log": "^0.2.0-alpha.1"` in `dependencies`

The browser half of "analytics are plugins" — see `/log` for the call parameters. A page logs a
business event once; which systems hear it is the set of plugins registered. This package names no
analytics vendor: it is the consent gate every sink is built on.

```ts
import { addLogPlugin, logger } from '@owlmeans/log'
import { consentedAnalyticsPlugin } from '@owlmeans/web-log'

addLogPlugin(consentedAnalyticsPlugin(payload => sendToMetrics(payload), { name: 'metrics' }))   // once, at startup

logger('projects').info('Created', { kind: 'web' }, { analytics: 'project.created' })
// → sendToMetrics({ event: 'project.created', kind: 'web' }) — if analytics consent is granted
```

The tag-manager sink (`window.dataLayer`) is connect's `@owlmeans/web-gtm`: `gtmAnalyticsPlugin`, the
same options over this gate, named `'gtm'`. It moved there from this package on the 0.2 line; import
it from `@owlmeans/web-gtm` (`/web-gtm`).

## Consent

`consentedAnalyticsPlugin(send, options)` sends only while `consentStore.granted(options.category ?? 'analytics')`
(`@owlmeans/consent`). **An event without consent is dropped, never queued**: a tag queue replays
everything already waiting in it when its tag loads, so a held event would be sent after a later
grant — in a window the visitor never agreed to be measured in. The load of a tag itself is gated
separately (`@owlmeans/consent`'s `consentTrackingHelper.consentGateScript`); this gates the events.

| Option | Meaning |
|---|---|
| `name` | plugin name (a second plugin of the name replaces the first); default `'web-analytics'` |
| `category` | the consent category required; default analytics |
| `allow` | event names it sends; absent means all |
| `map(event)` | reshape the payload; return `undefined` to drop the event |

The default payload is `{ event, ...data }` (a non-object `data` becomes `value`). A second analytics
system is a second `consentedAnalyticsPlugin(send, { name })` — each plugin filters for itself.
