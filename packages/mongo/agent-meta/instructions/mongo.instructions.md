---
description: "How to use @owlmeans/mongo — MongoDB connection service (makeMongoDbService / appendMongo) registered on a server context; cluster setup, layer sensitivity, field encryption."
applyTo: "**/context.ts, **/config.ts, **/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/mongo

**Layer:** Infra
**Install:** `"@owlmeans/mongo": "^0.1.15"` in `dependencies` (peer `mongodb`)

## Key Exports

| Export | Description |
|--------|-------------|
| `makeMongoDbService(alias?)` | MongoDB connection service factory (implements `MongoDbService`) |
| `appendMongo(context, alias?)` | Register the service on a server context |
| `DEFAULT_ALIAS` | `'mongo'` |

## Usage

```typescript
import { appendMongo } from '@owlmeans/mongo'
appendMongo(context)

cfg.dbs = [{
  service: 'mongo', alias: 'mongo',
  host: '127.0.0.1', port: 27017,        // string[] host → replica set bootstrap
  user: 'admin', secret: '...',
  schema: 'my-app',                       // DATABASE name (layer-suffixed by dbName())
  encryptionKey: '...',                   // enables lock()/unlock() field encryption
  entitySensitive: true,                  // per-Entity-layer databases (each with its own migration ledger)
}]
```

## Tests

Integration suites for the whole Mongo pair live here (`tests/migration.spec.ts`,
`tests/references.spec.ts`), gated on `MONGO_URL`.

## Depends On

- `@owlmeans/resource`, `@owlmeans/mongo-resource` (service contract), `@owlmeans/basic-keys`, peer `mongodb`
