# @owlmeans/marketing-consent-mongo

Mongo storage for `@owlmeans/server-marketing-consent`'s two resources — `marketing-consent-state`
and `marketing-consent-log`. Schemas are imported from `@owlmeans/server-marketing-consent`, never
duplicated here.

See `.agents/skills/marketing-consent-mongo/SKILL.md` for usage.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.36
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
