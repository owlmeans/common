# @owlmeans/server-job

Server bridge from technical queue records to the sanitized `@owlmeans/job` domain contract.
Every binding requires an application-owned `JobExposurePolicy`; there is no permissive default.

```typescript
import { declareJobEntrypoints } from '@owlmeans/job'
import { jobViewOf, serveJobEntrypoints } from '@owlmeans/server-job'

export const reportJobs = declareJobEntrypoints('report-jobs', {
  path: '/reports/jobs', parent: api.reports.base,
})

export const bindings = serveJobEntrypoints(reportJobs, {
  queue: REPORT_QUEUE,
  policy: {
    audience: req => ({ userId: requireUserId(req) }),
    where: (audience, query) => ({
      $and: [
        { 'data.ownerId': audience.userId },
        ...(query.kind == null ? [] : [{ name: internalNameOf(query.kind) }]),
      ],
    }),
    lookup: async (id, audience, resource) =>
      resource.load({ publicId: id, 'data.ownerId': audience.userId }),
    map: record => jobViewOf(record, {
      id: publicIdOf(record),
      kind: publicKindOf(record),
      summary: publicSummaryOf(record),
      metadata: allowlistedMetadataOf(record),
      result: publicResultOf(record),
    }),
    cancel: (record, audience) => ownerIdOf(record) === audience.userId,
  },
})
```

The policy is the security boundary:

- `audience` derives authenticated application scope.
- `where` translates the closed public query into scoped technical criteria.
- `lookup` resolves an opaque public id inside that scope.
- `map` allowlists fields and returns only `JobView`; `jobViewOf` bounds and sanitizes JSON.
- `cancel` is optional and cancellation is denied unless it explicitly approves.

List, get, cancel and watch all apply the same policy. Watch frames are reloaded inside the
audience scope and emitted as `JobViewEvent`; an unattributable event is dropped. Keep completed
records long enough for watched completion events to be projected.

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
