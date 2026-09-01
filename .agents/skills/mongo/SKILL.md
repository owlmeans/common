---
name: mongo
description: How to use @owlmeans/mongo — MongoDB connection service (makeMongoDbService / appendMongo) registered on a server context; cluster setup, layer sensitivity, field encryption backend. Auto-invoked when wiring MongoDB into a server app.
user-invocable: false
---

# @owlmeans/mongo

**Layer:** Infra
**Install:** `"@owlmeans/mongo": "^0.1.18-rc.9"` in `dependencies` (peer `mongodb`)

## Key Exports

| Export | Description |
|--------|-------------|
| `makeMongoDbService(alias?)` | Factory for the MongoDB connection service (implements `MongoDbService` from [[mongo-resource]]). |
| `appendMongo(context, alias?)` | Register the service on a server context. Default alias `'mongo'` (`DEFAULT_ALIAS`). |
| `DEFAULT_ALIAS` | `'mongo'`. |

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
  schema: 'my-app',          // the DATABASE name (layer-suffixed by dbName())
  encryptionKey: '...',      // enables lock()/unlock() field encryption
  entitySensitive: true,     // per-Entity-layer databases
}]
```

- The service lazily creates one `MongoClient` per config alias; an array `host` runs the
  replica-set bootstrap (`setUpCluster`) first.
- `lock`/`unlock` encrypt/decrypt record fields with `encryptionKey` via
  `@owlmeans/basic-keys` — the backend behind `MongoResource.lock()`.
- Layer sensitivity: `serviceSensitive`/`entitySensitive` add `Layer.Service`/`Layer.Entity`
  to the service's layers, which makes `dbName()` derive per-layer database names — each
  such database carries its own data **and its own migration ledger**.

## Tests

This package hosts the integration suites for the whole Mongo pair (a devDependency in the
other direction would be a cycle): `tests/migration.spec.ts` (ledger end to end),
`tests/references.spec.ts` (ObjectId reference conversion, system `$ref:` migration, drift
repair). Gated on `MONGO_URL` — see [[testing-integration]]; the repo `.env` expects a
port-forward to the cluster mongo.

## Depends On

- `@owlmeans/resource` (`createDbService`) · `@owlmeans/mongo-resource` (service contract)
- `@owlmeans/basic-keys` — field encryption
- peer `mongodb` (currently `^7.5.0`)

This package requires **Bun 1.4.0 or newer**. On anything older, `bson >= 7.3.0` throws
`ERR_NOT_IMPLEMENTED` (`v8.startupSnapshot.isBuildingSnapshot`) the moment `mongodb` is imported and
the server never starts; 1.4.0 implements the call, so `bson` is left to resolve freely inside the
driver's declared `^7.2.0` range. An app that must run an older Bun pins `"bson": "7.2.0"` in its
own root `overrides` instead. Details in the `bun` skill.

## Related

- [[mongo-resource]] — the resource implementation resolved through this service
