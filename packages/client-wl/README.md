# @owlmeans/client-wl

A reserved, intentionally empty slot in the OwlMeans white-label stack. It holds the place of a
platform-neutral client layer — the tier between the shared white-label contract and a rendering
target such as the browser — but today its entry point (`src/index.ts`) is empty and the package
exports nothing. Nothing in the monorepo depends on it, and `@owlmeans/web-wl` reaches
`@owlmeans/wled` directly rather than through it. An application has no reason to install it: use
`@owlmeans/wled` for the shared records and protocol, `@owlmeans/server-wl` on the server and
`@owlmeans/web-wl` in the browser. The `client-wl` skill covers this package.

## Installation

```bash
bun add @owlmeans/client-wl@^0.1.18-rc.30
```

The package builds and publishes; installing it adds no API. `react` is declared as a peer for the
components this tier is reserved for — nothing here uses it yet.

## Concepts

- **Placeholder** — the package exists so the white-label stack keeps the same shape as other
  OwlMeans families (shared contract → client tier → target tier). It carries no code.
- **What would belong here** — white-label logic that is React-free and independent of the rendering
  target (browser or native). Anything that renders belongs in a target package.

## Usage

There is nothing to import. Use the packages that implement white-labelling:

| Concern | Package |
|---|---|
| Record shapes, schemas, the shared protocol declaration | `@owlmeans/wled` |
| Serving a white-label set, provider services | `@owlmeans/server-wl` |
| Reading it in a browser, the web service, `entrypoints`, components | `@owlmeans/web-wl` |

## API

None — the entry point exports nothing.

## Common pitfalls

- Importing anything from `@owlmeans/client-wl` fails to type-check: there are no exports.
- Do not add rendering code here; it belongs in `@owlmeans/web-wl` (or a native target package).

## Related packages

- [`@owlmeans/wled`](../wled) — the shared white-label records, schemas and protocol
- [`@owlmeans/server-wl`](../server-wl) — server-side white-label API
- [`@owlmeans/web-wl`](../web-wl) — browser service, bindings and components

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
