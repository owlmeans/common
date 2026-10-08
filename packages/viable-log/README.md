# @owlmeans/viable-log

A generated (target) application's link to the OwlMeans platform (viable), expressed as two
`@owlmeans/log` plugins plus the wire contract the platform reads them with. `viablePreviewPlugin`
sends the target web's analytics events to the manager frame that embeds the preview;
`viableSlotPlugin` writes the target backend's error records and analytics events as marked JSON
lines on stdout, where the platform's publisher picks them up. A generated app registers both
unconditionally — each is inert wherever the platform is absent — and the platform side imports the
same package to parse what the app emits. An application that is not generated and run by viable has
no use for it: count events with `@owlmeans/web-log` (tag manager) instead. The `viable-log` skill
covers this package; the `logging` skill sets the policy for the log calls that feed it.

## Installation

```bash
bun add @owlmeans/viable-log@^0.1.18-rc.2
```

## Concepts

- **Target application** — an app generated and hosted by viable. It logs only through
  `@owlmeans/log`; these plugins decide what reaches the platform.
- **Preview channel** — `window[PREVIEW_REPORTER_FLAG]`, an object with `post(type, payload)`
  installed by the platform's injected reporter in a framed preview. Absent in production.
- **Slot events** — a backend process run by the publisher with `OWLMEANS_SLOT_EVENTS=1`
  (`SLOT_EVENTS_ENV`). Without that variable the slot plugin writes nothing.
- **Target event line** — `TARGET_EVENT_MARKER` (`'[owl:event] '`) followed by one JSON `TargetEvent`,
  capped at `TARGET_EVENT_MAX` (16 KiB). Versioned by `TARGET_EVENT_VERSION`.
- **Untrusted input** — the platform treats every line as written by generated code: it validates
  marker, JSON, version, kind and level, clips text fields and drops unknown ones.

## Usage

### 1. Target web — register the preview plugin

```typescript
import { addLogPlugin, logger } from '@owlmeans/log'
import { viablePreviewPlugin } from '@owlmeans/viable-log'

addLogPlugin(viablePreviewPlugin())

logger('ui').info('Opened', { page: 'home' }, { analytics: 'page_view' })
// in a framed preview: channel.post('OWLMEANS_PREVIEW_ANALYTICS', { event: 'page_view', scope: 'ui', data: { page: 'home' }, ... })
// anywhere else: nothing
```

Browser errors need no plugin: a record carrying an `Error` reaches the reporter's own
`console.error` hook through the logger's console sink.

### 2. Target backend — register the slot plugin

```typescript
import { addLogPlugin, logger } from '@owlmeans/log'
import { viableSlotPlugin } from '@owlmeans/viable-log'

addLogPlugin(viableSlotPlugin())

const log = logger('api')
log.error('Request failed', error)                                  // → kind 'error' line
log.info('Signed up', { plan: 'free' }, { analytics: 'signup' })   // → kind 'analytics' line
log.warn('Slow query')                                              // → no line (not error, not analytics)
```

### 3. Platform side — read a stdout line

```typescript
import { targetEventHelper } from '@owlmeans/viable-log'

for (const line of chunk.split('\n')) {
  const event = targetEventHelper.parseTargetEventLine(line)   // marker may appear anywhere in the line
  if (event == null) {
    continue                                                   // ordinary output, or a rejected line
  }
  relay(event)
}
```

### 4. Platform side — detect the preview channel

```typescript
import { previewChannel, PREVIEW_ANALYTICS_TYPE } from '@owlmeans/viable-log'

previewChannel()?.post(PREVIEW_ANALYTICS_TYPE, payload)
```

`previewChannel()` returns `undefined` outside a browser and whenever the flag is not an object with
a `post` function.

## API

### Plugins and helpers

| Symbol | Kind | Purpose |
|---|---|---|
| `viablePreviewPlugin()` | function → `LogPlugin` | Name `'viable-preview'`; `track` posts each `AnalyticsEvent` as `PREVIEW_ANALYTICS_TYPE` through the preview channel |
| `viableSlotPlugin()` | function → `LogPlugin` | Name `'viable-slot'`; `log` emits error-level records, `track` emits analytics events, both as target event lines on `process.stdout` when `SLOT_EVENTS_ENV` is `'1'` |
| `previewChannel()` | function | The current document's `PreviewChannel`, or `undefined` |
| `targetEventHelper` | `TargetEventHelper` | Default instance of the line protocol |
| `createTargetEventHelper()` | function | Builds a `TargetEventHelper` |
| `targetEventHelper.targetEventLine(event)` | member | Serialise an event; an over-long one loses its stack, then its data, then is cut at `TARGET_EVENT_MAX` |
| `targetEventHelper.parseTargetEventLine(line)` | member | Validate and clip an untrusted line → `TargetEvent \| undefined` |
| `targetEventLine`, `parseTargetEventLine` | functions | Deprecated wrappers; use `targetEventHelper` |

### Constants

| Symbol | Value | Purpose |
|---|---|---|
| `PREVIEW_REPORTER_FLAG` | `'__owlmeansPreviewReporter'` | `window` property holding the preview channel |
| `PREVIEW_ANALYTICS_TYPE` | `'OWLMEANS_PREVIEW_ANALYTICS'` | Message type of a preview analytics post |
| `TARGET_EVENT_MARKER` | `'[owl:event] '` | Prefix of a target event line |
| `SLOT_EVENTS_ENV` | `'OWLMEANS_SLOT_EVENTS'` | Environment variable the publisher sets to `1` |
| `TARGET_EVENT_VERSION` | `1` | Format version of `TargetEvent` |
| `TARGET_EVENT_MAX` | `16384` | Longest line written and accepted |

### Types

| Symbol | Shape |
|---|---|
| `TargetEvent` | `{ v, kind, ts, level, scope, message, event?, data?, error?: { name, message, stack?, incidentId? } }` |
| `TargetEventKind` | `'error' \| 'analytics'` |
| `PreviewChannel` | `{ v: number, post(type, payload) }` |
| `PreviewAnalyticsPayload` | the `AnalyticsEvent` from `@owlmeans/log` |
| `TargetEventHelper` | `{ targetEventLine, parseTargetEventLine }` |

On parse, text fields are clipped: `scope` and `event` to 200 characters (`scope` falls back to
`'target'`), `message` to 2000, `error.stack` to 8000, `error.incidentId` to 100.

## Common pitfalls

- Never build a marked line or post a preview message from application code — log through
  `@owlmeans/log` and let the plugins emit.
- Do not gate plugin registration on the environment; both plugins are already inert without the
  channel or `OWLMEANS_SLOT_EVENTS=1`.
- The slot plugin forwards only `error` records; `warn` and lower reach the platform only when the
  call also carries an `analytics` option.
- A stack or a large `data` may be dropped to fit `TARGET_EVENT_MAX` — keep the message meaningful
  on its own.
- Changing any `TargetEvent` field shape requires a new `TARGET_EVENT_VERSION`; the parser rejects
  every other version.
- Anything read from `parseTargetEventLine` is still user-generated content — do not render or log
  it as trusted text.

## Related packages

- [`@owlmeans/log`](../log) — `logger`, `addLogPlugin`, `LogPlugin` and the analytics call option
- [`@owlmeans/web-log`](../web-log) — consent-gated analytics plugins for a tag manager

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
