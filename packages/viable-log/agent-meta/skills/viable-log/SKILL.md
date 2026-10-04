---
name: viable-log
description: How to use @owlmeans/viable-log — a generated (target) application's link to the OwlMeans Viable platform, as two @owlmeans/log plugins. viablePreviewPlugin sends the target web's analytics events to the manager frame through the preview reporter's channel; viableSlotPlugin writes the target backend's error records and analytics events as marked JSON stdout lines for the publisher to relay. Also the shared contract the platform reads them with (TARGET_EVENT_MARKER, parseTargetEventLine, PREVIEW_REPORTER_FLAG). Auto-invoked when wiring the platform link into a generated app's web or backend, importing viablePreviewPlugin, viableSlotPlugin or parseTargetEventLine, or changing how the preview reporter or the publisher takes events from a target.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/viable-log

**Layer:** Domain (depends on `@owlmeans/log` only)
**Install:** `"@owlmeans/viable-log": "^0.1.18-rc.0"` in `dependencies`

The platform is "just one of the plugins" of a target's logging: a generated app logs through
`@owlmeans/log`, and registers these two plugins so what it says reaches Viable. Both are inert
wherever the platform is absent — a production runtime, a laptop, a framed-less page — so they are
registered unconditionally.

```ts
// web: once, at startup
addLogPlugin(viablePreviewPlugin())
// backend (api, worker): once, at startup
addLogPlugin(viableSlotPlugin())
```

| Plugin | Sends | Through | Active when |
|---|---|---|---|
| `viablePreviewPlugin()` | analytics events | `window[PREVIEW_REPORTER_FLAG].post` — the channel the publisher's injected reporter owns, which attaches the document's identity and posts to the manager frame | the page is a framed preview (the reporter installed the channel) |
| `viableSlotPlugin()` | error-level records and analytics events | one stdout line per event: `TARGET_EVENT_MARKER` + JSON (`TargetEvent`) | the publisher that runs the process set `OWLMEANS_SLOT_EVENTS=1` |

Errors in the **browser** need no plugin: a record carrying an `Error` reaches the reporter's own
`console.error` hook through the logger's sink, exactly as a bare `console.error(error)` did.

## The contract

`parseTargetEventLine(line)` is how the platform's publisher reads a stdout line — **the input is
untrusted, written by generated code**: the marker, JSON, version
(`TARGET_EVENT_VERSION`), kind and level are checked, every text field is clipped, unknown fields are
dropped. `targetEventLine(event)` writes one, cutting a stack and then data to stay under
`TARGET_EVENT_MAX`. Change a field's shape only with a new `TARGET_EVENT_VERSION`. An application writes events only
through `@owlmeans/log` (`log.error(…)`, or a call with an `analytics` option) — never by building a
marked line or posting a preview message itself.
