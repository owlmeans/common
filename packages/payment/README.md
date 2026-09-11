# @owlmeans/payment

Payment-domain services, schemas and shared checkout/subscription protocol declarations.

Bind the exported protocol declarations in each runtime, then call the protocol reference from the
context. `entityId` in a billing payload is the stable organization entity record id; never send an
`entitySlug` as a billing relation.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.11
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
