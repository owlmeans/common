# @owlmeans/queue

Reserved namespace for queue management. Currently a stub with no exports.

## Overview

This package is a placeholder for future queue/task processing functionality within the OwlMeans framework.

## Installation

```bash
bun add @owlmeans/queue
```

## Related Packages

- [`@owlmeans/redis-resource`](../redis-resource) — Redis Streams provide queue-like semantics today

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
