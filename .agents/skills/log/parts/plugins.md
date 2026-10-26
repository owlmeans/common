---
name: plugins
description: The LogPlugin contract (log, track, install), addLogPlugin, and what is a plugin (analytics, a platform link, a file, a test).
metadata:
  purposes: config, ops
  mentions: LogPlugin, addLogPlugin, removeLogPlugin, logPlugins, AnalyticsEvent
---

# @owlmeans/log — Plugins

## Plugins

```ts
interface LogPlugin {
  name: string
  log?: (record: LogRecord) => void        // every record the level filter admitted
  track?: (event: AnalyticsEvent) => void  // every call that asked for analytics
  install?: () => void; uninstall?: () => void
}
addLogPlugin(plugin)  // same name replaces; returns the remover
```

Analytics systems (`@owlmeans/web-log`'s GTM plugin, a server-side measurement sender), a target's
link to the platform (`@owlmeans/viable-log`), a file or a test's memory are all plugins. A plugin that
throws is skipped (and reported at most once a minute) — logging never breaks the work.
