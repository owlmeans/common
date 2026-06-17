# @owlmeans/client-wl

Client-side whitelabeling placeholder for the OwlMeans framework.

## Overview

This package is a reserved namespace for client-side whitelabeling functionality. It is currently a stub with no exports.

## Installation

```bash
bun add @owlmeans/client-wl
```

## Related Packages

- [`@owlmeans/server-wl`](../server-wl) — server-side whitelabeling API
- [`@owlmeans/web-wl`](../web-wl) — React whitelabeling components (MUI)

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded Claude Code skills and GitHub Copilot instructions under
`agent-meta/`. After installing your `@owlmeans/*` packages, run the OwlMeans
agent-skills installer to place them into your project's native locations
(`.claude/skills/` and `.github/instructions/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
