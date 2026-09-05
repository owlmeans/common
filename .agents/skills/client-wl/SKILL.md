---
name: client-wl
description: How to use @owlmeans/client-wl — the reserved platform-neutral slot in the white-label stack, currently empty. Auto-invoked when a dependency names client-wl or when deciding where shared white-label UI belongs.
user-invocable: false
---

# @owlmeans/client-wl

**Layer:** Client
**Install:** `"@owlmeans/client-wl": "^0.1.18-rc.6"` in `dependencies`

## Key Exports

None. The package builds and publishes, and its entry point exports nothing.

It holds the place a platform-neutral white-label layer would occupy — the tier between the shared
contract and a rendering target. Nothing depends on it, and `@owlmeans/web-wl` reaches
`@owlmeans/wled` directly rather than through it.

## Where to put white-label code instead

| Concern | Package |
|---------|---------|
| Record shapes, schemas, the `WL_PROVIDE` declaration | `@owlmeans/wled` |
| Serving a white-label set, provider services | `@owlmeans/server-wl` |
| Reading it in a browser, `WlLogo` | `@owlmeans/web-wl` |

Add to this package only for code that is genuinely React-free and target-independent; anything that
renders belongs in a target package.

## Depends On

- `react` (peer) — declared for the components this tier is reserved for; nothing here uses it
