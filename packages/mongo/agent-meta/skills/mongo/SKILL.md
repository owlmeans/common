---
name: mongo
description: How to use @owlmeans/mongo — MongoDB connection service (makeMongoDbService / appendMongo) registered on a server context; cluster setup, field encryption backend. Auto-invoked when wiring MongoDB into a server app.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/mongo

**Layer:** Infra
**Install:** `"@owlmeans/mongo": "^0.1.18-rc.13"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeMongoDbService(alias?)` | Factory for the MongoDB connection service (implements `MongoDbService` from [[mongo-resource]]). |
| `appendMongo(context, alias?)` | Register the service on a server context. Default alias `'mongo'` (`DEFAULT_ALIAS`). |
| `DEFAULT_ALIAS`, `DEF_REPLSET` | `'mongo'`; `'rs-main'`, the replica set an array `host` bootstraps. |
| `MongoMeta` | The `DbConfig.meta` shape this package reads — `{ replicaSet }`. |

## Usage

```typescript
import { appendMongo } from '@owlmeans/mongo'
appendMongo(context)

// Connection settings come from cfg.dbs
cfg.dbs = [{
  service: 'mongo',
  alias: 'mongo',
  host: '127.0.0.1',        // or string[] for a cluster — triggers replica set setup
  port: 27017,
  user: 'admin', secret: '...',
  schema: 'my-app',          // the DATABASE name
  encryptionKey: '...',      // enables lock()/unlock() field encryption
  meta: { replicaSet: 'rs-main' },   // only read for an array host
}]
```

- The service lazily creates one `MongoClient` per config alias. An array `host` bootstraps the
  replica set first — `replSetInitiate` when the set was never configured, a forced
  `replSetReconfig` when the members' addresses moved, up to three attempts — then reconnects
  through `?replicaSet=<meta.replicaSet ?? DEF_REPLSET>`.
- `lock`/`unlock` encrypt/decrypt record fields with `encryptionKey` via
  `@owlmeans/basic-keys` — the backend behind `MongoResource.lock()`.
- **`user` decides how the connection string is assembled.** With `user` set, a single `host`
  becomes `mongodb://<host>[:<port>]` and the client gets `directConnection: true`, which is what a
  standalone node needs: advertising a replica set instead would block the driver on server
  selection looking for a primary that never appears. `meta.replicaSet` is read only on the
  multi-host path.
- **An entry with no `user` is passed through verbatim.** No scheme is prepended, `port` is not
  appended and no client options are set at all — so such an entry must spell the whole connection
  string in `host` (`mongodb://127.0.0.1:27017/?directConnection=true`). A bare `127.0.0.1` reaches
  the driver as-is and is rejected for having no scheme.
- The database name is `config.schema ?? config.alias ?? service.alias`, taken as given — the
  service's `name(alias?)` returns it. One database per config entry, each carrying its own data
  **and its own migration ledger**; a second database is a second `cfg.dbs` entry.

## Tests

This package hosts the integration suites for the whole Mongo pair (a devDependency in the
other direction would be a cycle): `tests/crud.spec.ts` (the `Resource` contract against a real
collection), `tests/migration.spec.ts` (ledger end to end), `tests/references.spec.ts` (ObjectId
reference conversion, system `$ref:` migration, drift repair). Gated on `MONGO_URL` — see
[[testing-integration]]; a dev port-forward to the cluster mongo fills the `MONGO_URL` the
repo's `.env.example` describes.

## Depends On

- `@owlmeans/resource` (`createDbService`) · `@owlmeans/mongo-resource` (service contract)
- `@owlmeans/context` · `@owlmeans/server-context` — the service lifecycle and the context it asserts
- `@owlmeans/basic-keys` — field encryption
- `mongodb` (`^7.5.0`) — a direct dependency, not a peer: the driver is resolved here and the
  resource package takes it as a peer

## Runtime floor

On Bun, loading this package requires **Bun 1.4.0 or newer**, and that floor is the whole
requirement — `bson` then resolves freely inside the driver's own `^7.2.0` range and needs no
override or pin. `bson@7.3.x` runs a static initializer that calls
`process.getBuiltinModule('v8').startupSnapshot.isBuildingSnapshot()`, which Bun implements from
1.4.0 on. Below that, `import 'mongodb'` throws `NotImplementedError: node:v8 isBuildingSnapshot is
not yet implemented in Bun` before any application code runs, so the symptom is a process that
never starts rather than a query that misbehaves. Every runtime that loads the driver counts: the
local shell, CI, and the container image.

An app that cannot raise its runtime pins the older bson in its own root manifest instead:

```json
{ "overrides": { "bson": "7.2.0" } }
```

Check the runtime, not the lockfile, before lowering one:

```bash
bun -e "import('mongodb').then(() => console.log('OK')).catch(e => console.log(e.message))"
```

## Related

- [[mongo-resource]] — the resource implementation resolved through this service
