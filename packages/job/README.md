# @owlmeans/job

Browser-safe application job contracts. The package defines a closed `JobView`, public query and
event schemas, and ordinary HTTP/WS entrypoint declarations. It has no queue dependency and carries
no queue address, transport payload, ownership field, credential or raw failure.

```typescript
import { declareJobEntrypoints } from '@owlmeans/job'

export const reportJobs = declareJobEntrypoints('report-jobs', {
  path: '/reports/jobs',
  parent: api.reports.base,
})
```

`JobView` exposes only an opaque id, application kind, normalized status, bounded progress,
allowlisted metadata/result/error, cancellation availability and timestamps. The server maps its
technical records with `@owlmeans/server-job`; the browser consumes views with
`@owlmeans/client-job`.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.37
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
