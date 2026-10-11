---
name: web-log
description: How to use @owlmeans/web-log — the consent-gated analytics plugins for @owlmeans/log in a browser. gtmAnalyticsPlugin pushes `log` calls that carry an analytics option onto window.dataLayer for a tag manager, and only while analytics consent is granted (an event without consent is dropped, never queued); consentedAnalyticsPlugin is the same gate over any sender. Auto-invoked when sending analytics or tag-manager events from application code, importing gtmAnalyticsPlugin or consentedAnalyticsPlugin, or wiring a second analytics system next to GTM.
user-invocable: false
---

# @owlmeans/web-log

**Layer:** Web (depends on `@owlmeans/log` and `@owlmeans/consent`)
**Install:** `"@owlmeans/web-log": "^0.1.18-rc.3"` in `dependencies`

The browser half of "analytics are plugins" — see `/log` for the call parameters. A page logs a
business event once; which systems hear it is the set of plugins registered.

```ts
import { addLogPlugin, logger } from '@owlmeans/log'
import { gtmAnalyticsPlugin } from '@owlmeans/web-log'

addLogPlugin(gtmAnalyticsPlugin({ allow: ['project.created', 'sign_in'] }))   // once, at startup

logger('projects').info('Created', { kind: 'web' }, { analytics: 'project.created' })
// → window.dataLayer.push({ event: 'project.created', kind: 'web' }) — if analytics consent is granted
```

## Consent

`consentedAnalyticsPlugin(send, options)` sends only while `consentStore.granted(options.category ?? 'analytics')`
(`@owlmeans/consent`). **An event without consent is dropped, never queued**: a tag manager replays
everything already waiting in its queue when it loads, so a held event would be sent after a later
grant — in a window the visitor never agreed to be measured in. The load of the tag itself is gated
separately (`@owlmeans/web-gtm`'s `'basic'` mode); this gates the events.

| Option | Meaning |
|---|---|
| `name` | plugin name (a second plugin of the name replaces the first) |
| `category` | the consent category required; default analytics |
| `allow` | event names it sends; absent means all |
| `map(event)` | reshape the payload; return `undefined` to drop the event |

The default payload is `{ event, ...data }` (a non-object `data` becomes `value`). A second analytics
system is a second `consentedAnalyticsPlugin(send, { name })` — each plugin filters for itself.
