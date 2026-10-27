---
name: capabilities
description: The optional capability interfaces a concrete resource composes beside Resource (pub/sub, watch, stream, lock, migrations).
metadata:
  purposes: data
  mentions: PubSubResource, WatchableResource, StreamResource, LockableResource, MigratableResource, SubscribeOptions
---

# @owlmeans/resource — Optional capabilities

## Optional capabilities

A concrete resource interface composes the capabilities its backend actually has beside
`Resource<T>`; a consumer types the **resource** once and gets exactly those methods.

| Interface | Surface |
|---|---|
| `PubSubResource<T>` | `publish(value, channel?)` · `subscribe(handler, { channel?, once?, ttl? })` |
| `WatchableResource<T>` | `watch(id, handler, { once?, ttl? })` — changes to ONE record |
| `StreamResource<T>` | `stream(key, value)` · `consume(key, { group?, consumer?, block? })` |
| `LockableResource<T>` | `lock`/`unlock` — field level encryption at rest |
| `MigratableResource<Tx, Self>` | `migration(name, apply, stage?)` · `migrations()` |
