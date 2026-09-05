---
name: client-payment
description: How to use @owlmeans/client-payment — the browser-side PaymentService, which adds a cached shallow identity on top of @owlmeans/payment so a returning visitor keeps their profile without re-presenting a token. Auto-invoked when registering the payment service in a client context or calling shallowAuthentication from a browser.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-payment

**Layer:** Client
**Install:** `"@owlmeans/client-payment": "^0.1.18-rc.20"` in `dependencies` (peer `react`)

The same `PaymentService` as `@owlmeans/payment`, with one method adapted for a browser. Everything
else — the catalogue reads, the entitlement helpers, the entrypoint aliases — is imported from the
core package unchanged.

## Key exports

| Export | Description |
|---|---|
| `makePaymentService(alias?)` · `appendPaymentService(ctx, alias?)` | The client service factory and its registration helper. Same signatures as the core package's. |
| `SHALLOW_AUTH` | `'payment:shallow-auth'` — the record id the resolved profile is cached under. |
| `DEFAULT_ALIAS` | Re-exported, so a client wires the service without also importing the core package. |
| `PaymentService` | Re-exported type. |

## What it changes: `shallowAuthentication`

A checkout leaves the app and comes back, and the token that identified the visitor on the way out
is gone by the time they return. So the client override persists the answer:

- **With a token** — the core implementation reads the `profileId` out of it, then the result is
  saved into the client auth resource (`AUTH_RESOURCE`) under `SHALLOW_AUTH`.
- **Without one** — the saved record is loaded instead, and its `profileId` returned. When there is
  no record, or it carries no profile, it throws `PaymentIdentificationError`.

This is identification, not authorization: the token is read, never verified. Gate a paid
capability with `entitled(...)` on the route rather than with anything this returns.

```typescript
import { appendPaymentService } from '@owlmeans/client-payment'

appendPaymentService(context)
```

Registering under the core `DEFAULT_ALIAS` is what lets shared code resolve one payment service
whichever side it runs on. The client auth resource must be registered too — the override reads it
on every call.

## Depends On

- `@owlmeans/payment` · `@owlmeans/client-auth` (`AUTH_RESOURCE`) · `@owlmeans/context`
- peer `react`

## Related

- [[payment]] — the contracts, the catalogue and the entitlement grammar
- [[client-auth]] — the auth resource the shallow identity is cached in
