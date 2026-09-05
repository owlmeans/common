---
name: kluster
description: How to use @owlmeans/kluster — the Kubernetes API client service, klusterize() wiring, the kluster:<action>:<query> config directive that resolves cluster addresses at boot, and the typed API accessors for pods, services, deployments, ingress and CRDs. Auto-invoked when interacting with the cluster from app code or when a config value names a cluster lookup.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/kluster

**Layer:** Infra
**Install:** `"@owlmeans/kluster": "^0.1.18-rc.12"` in `dependencies`

Two things in one package: a service that talks to the Kubernetes API, and a config middleware that
lets a config value *be* a cluster lookup instead of a hardcoded address.

## Key Exports

| Export | Description |
|--------|-------------|
| `klusterize(ctx, alias?)` | Register the service **and** the config middleware — the one call an app makes |
| `makeKlusterService(alias?)` | The service alone, for a context that wires its own middleware |
| `createMiddleware(alias?)` | The config middleware alone |
| `KlusterService` | Service interface — the lookups and API factories below, plus `api` (`CoreV1Api`) and `config` (the loaded `KubeConfig`) |
| `KlusterConfig` | Server config plus `kluster?: { namespace? }` |
| `isNotFoundError(e)` | True for a 404 across every shape the client library reports one in |
| `DEFAULT_ALIAS` / `KLUSTER_SERVICE_ALIAS` | The service alias (`kluster`) |
| `DIRECTIVE` (`kluster`), `SEP` (`:`) | The config-directive prefix and separator |
| `ACT_HOST` (`hostname`), `ACT_SERVICE` (`service`) | The directive actions |
| `DEFAULT_NAMESPACE` (`default`) | Namespace used when the config names none |

## Wiring

```typescript
// klusterize is re-exported by @owlmeans/server-app, alongside the server context factory
import { klusterize, makeContext as makeBackendContext } from '@owlmeans/server-app'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBackendContext<C, T>(cfg)
  klusterize<C, T>(context)
  return context
}
```

Expose it the way any other service is exposed, and declare the accessor on the app's context type:

```typescript
import { DEFAULT_ALIAS as KLUSTER } from '@owlmeans/kluster'
import type { KlusterService } from '@owlmeans/kluster'

context.kluster = () => context.service<KlusterService>(KLUSTER)
```

The service is **lazy**: nothing touches the cluster until the first call, at which point the
kubeconfig is loaded from the default location — the mounted service account inside a pod, the
developer's kubeconfig outside one — and a core API client is built.

## Config directives

A config string of the form `kluster:<action>:<query>` is replaced, during `init()`, with what the
cluster answers. That is how a service declaration names a peer by label rather than by address:

```typescript
sservice({ service: AGENT, internalHost: 'kluster:service:agent', internalPort: 8081 }, cfg)
```

| Action | Query | Becomes |
|--------|-------|---------|
| `service` | a label selector | The `clusterIP` of the first matching Service, or `null` when none matches |
| `hostname` | a label selector | The list of pod IPs matching the selector |

Rules that follow from how it runs:

- The namespace is `cfg.kluster.namespace`, falling back to `default`. A directive never names one.
- A query rooted at `/` is read from that file first, so a selector can be mounted rather than baked
  into the config. That is the only mounted form the directive carries: the value is split on `:`
  into three parts, so a `file://` URL — or any query holding a `:` of its own — is truncated at
  that colon and the fragment before it is sent as the selector.
- `hostname` yields an **array**, so the config key it replaces must be one that accepts a list.
- Resolution happens at the config-loading stage — after services have initialized and before
  resources do. A value read at call time therefore sees the resolved address; one a service copied
  into a field while initializing does not.
- An unknown action is a `SyntaxError` at boot.
- Only an `ApiException` from the client library is swallowed. It is logged, `service` leaves the
  selector in place as the host and `hostname` yields an empty list — so a peer that answers
  "connection refused to `app=agent`" is that failure, not a bad hostname.
- **Everything else propagates.** A transport failure, an unusable or absent kubeconfig, or a failed
  context assertion is rethrown out of the lookup, and because the directive is resolved by a
  `Config`/`Loading` middleware that means `init()` rejects and the process never boots. An app that
  must survive a cluster it cannot reach has to keep the directive out of its config, not rely on a
  fallback here.

## Talking to the cluster directly

| Member | Use |
|--------|-----|
| `getServiceHostname(selector, namespace?)` | The first matching Service's cluster IP |
| `getHostnames(selector, namespace?)` | Pod IPs matching the selector |
| `dispatch(action, query)` | What the middleware calls — the same two actions by name |
| `api` | The core API client (pods, services, secrets, config maps) |
| `makeAppsApi()` | Deployments, StatefulSets, DaemonSets |
| `makeNetworkingApi()` | Ingress and network policy |
| `makeCustomObjectsApi()` | CRDs, which is how Gateway API resources are reached |

**Await `ready()` before touching any of them.** Resolving a lazy service starts its initialization
but does not wait for it, and `api` and the factories are only populated once that finishes — so the
first caller after a boot dereferences `undefined` unless it waits:

```typescript
const kluster = context.service<KlusterService>(KLUSTER)
await kluster.ready()
const apps = kluster.makeAppsApi()
```

Wrap a get whose absence is expected with `isNotFoundError` instead of matching on a status field —
the client library reports 404 under several different shapes.

## Depends On

- `@owlmeans/context`, `@owlmeans/config`, `@owlmeans/server-config`, `@owlmeans/server-context`
- `@kubernetes/client-node` (runtime)
