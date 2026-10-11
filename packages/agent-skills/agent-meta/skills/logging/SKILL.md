---
name: logging
description: Logging policy for any OwlMeans application — no bare console calls; every line through @owlmeans/log with a scope and a deliberate level; what belongs at info vs debug; never log secrets or personal content; debug off in production, with the level set per environment (a server's config file, a browser's build-time env); analytics events as a call option routed to plugins. Use when adding any log line or a catch block, debugging with prints, deciding what an operator should see in production, setting a log level for an environment, or reviewing code that calls console.
user-invocable: false
metadata:
  scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Logging — the policy

The mechanics are the `log` skill (`@owlmeans/log`). This is what to do in application code.

1. **No `console.*`.** `import { logger } from '@owlmeans/log'`, `const log = logger('<scope>')` once per
   module, then `log.debug|info|warn|error(message, data?, options?)`. A scope is lowercase and
   colon-separated (`orders`, `orders:import`).
2. **Choose the level on purpose.** `debug` is for diagnosis (per request, progress, dumps) — it is OFF
   in production. `info` is what an operator wants to read in production: a job started or stopped, a
   subscription or payment event, a sign-in, a server listening. `warn`: it degraded and went on.
   `error`: the work failed. A line that fires every few seconds is `debug` or `logThrottle`d.
3. **Stable message, variable data.** `log.info('Order shipped', { orderId, carrier })` — not a
   sentence assembled from values. Give a significant event a dotted name: `{ event: 'order.shipped' }`.
4. **Pass the `Error`.** `log.error('Import failed', error)` — never `error.message` alone, never
   `JSON.stringify(error)`. In a browser the `Error` object must reach `console.error`; the logger does
   that, and an error reporter hooked there keeps working.
5. **Never log secrets or personal content**: tokens, keys, passwords, authorization or cookie headers,
   request or response bodies, query strings, user text (a prompt, a message, a note, a model's
   rationale quoting it), e-mail text, file contents, environment values. Log ids, names, sizes,
   counts, lengths — `noteLength`, not the note. A refused request is its method, path (no query),
   status and error code/message, at debug. A catch that only logs has not told the user anything —
   the user-facing report is a separate step (a message, a state), and `log.error` is the operator's
   record.
6. **Analytics are a parameter, not a second API.** `log.info('…', data, { analytics: 'event_name' })`
   hands the call to the registered analytics plugins (`@owlmeans/web-log` for a tag manager); add
   `console: false` to keep it out of the log. Only for events something should count.
7. **The level is set per environment, never in code.** A server declares `cfg.log` leaves as config
   file paths (a ConfigMap or a `LOG_LEVEL` environment variable); a browser takes a build-time
   constant (`VITE_LOG_LEVEL`). Development defaults to `debug`, a production build to `info`. Do not
   hard-code `cfg.debug = { all: true }` — `debug.all` does not control logging and must not be on in
   production.
8. **Tests read the log with `memoryPlugin()`**; they do not spy on `console`.
