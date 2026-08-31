# @owlmeans/router

Internal router service for the OwlMeans module system.

## Overview

- Provides the `RouterService` that attaches modules to a runtime router (e.g. Express, Bun's HTTP server)
- Used internally by `@owlmeans/server-route` and `@owlmeans/client-route`
- Not typically used directly in application code

## Installation

```bash
bun add @owlmeans/router
```

## Related Packages

- [`@owlmeans/server-route`](../server-route) — server-side router implementation
- [`@owlmeans/client-route`](../client-route) — client-side router implementation
- [`@owlmeans/module`](../module) — modules registered with the router

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
