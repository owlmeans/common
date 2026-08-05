---
description: "How to use @owlmeans/kluster — Kubernetes API client service. Resolve via context.service(DEFAULT_ALIAS) to access the cluster API for service discovery, secrets, config maps, and Gateway API (Gateway/HTTPRoute via CustomObjectsApi)."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/kluster

**Layer:** Infra
**Install:** `"@owlmeans/kluster": "^0.1.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `DEFAULT_ALIAS` | Kluster service alias |
| `makeKlusterService()` | Kubernetes client service factory |
| `KlusterService` | Service interface |
| `isNotFoundError(e)` | Returns true if an API error is HTTP 404 |
| Helpers | Service discovery, secret resolution |

## Usage

```typescript
import { DEFAULT_ALIAS as KLUSTER_SERVICE, makeKlusterService } from '@owlmeans/kluster'

context.registerService(makeKlusterService())
context.kluster = () => context.service(KLUSTER_SERVICE)
```

## KlusterService API

After `await kluster.ready()`:

| Method | Returns | Purpose |
|--------|---------|---------|
| `kluster.api` | `CoreV1Api` | Core APIs — Pods, Services, Secrets, ConfigMaps |
| `kluster.makeNetworkingApi()` | `NetworkingV1Api` | Legacy networking (kept for compatibility) |
| `kluster.makeAppsApi()` | `AppsV1Api` | Deployments, StatefulSets |
| `kluster.makeCustomObjectsApi()` | `CustomObjectsApi` | CRDs — **use for Gateway API resources** |
| `kluster.getHostnames(selector, ns)` | `string[]` | Pod IPs by label selector |
| `kluster.getServiceHostname(selector, ns)` | `string \| null` | ClusterIP by label selector |

## Gateway API via CustomObjectsApi

Gateway API resources (`Gateway`, `HTTPRoute`) are Kubernetes CRDs. Access them via `makeCustomObjectsApi()`:

```typescript
import { DEFAULT_ALIAS as KLUSTER_SERVICE } from '@owlmeans/kluster'
import type { KlusterService } from '@owlmeans/kluster'
import { isNotFoundError } from '@owlmeans/kluster'

const kluster = context.service<KlusterService>(KLUSTER_SERVICE)
await kluster.ready()
const customObjects = kluster.makeCustomObjectsApi()
const coreV1 = kluster.api!  // CoreV1Api for port resolution

const GATEWAY_GROUP = 'gateway.networking.k8s.io'
const GATEWAY_VERSION = 'v1'

// Read a Gateway
const gw = await customObjects.getNamespacedCustomObject({
  group: GATEWAY_GROUP, version: GATEWAY_VERSION,
  namespace: 'default', plural: 'gateways', name: 'my-gateway',
})

// Create an HTTPRoute
await customObjects.createNamespacedCustomObject({
  group: GATEWAY_GROUP, version: GATEWAY_VERSION,
  namespace: 'default', plural: 'httproutes',
  body: {
    apiVersion: 'gateway.networking.k8s.io/v1',
    kind: 'HTTPRoute',
    metadata: { name: 'my-route', namespace: 'default' },
    spec: {
      parentRefs: [{ name: 'my-gateway', sectionName: 'web-https' }],
      hostnames: ['example.com'],
      rules: [{
        matches: [{ path: { type: 'PathPrefix', value: '/' } }],
        backendRefs: [{ name: 'my-service', port: 80 }], // numeric port required
      }],
    },
  },
})

// Handle 404 gracefully
try {
  await customObjects.getNamespacedCustomObject({ ... })
} catch (e) {
  if (isNotFoundError(e)) { /* resource absent */ }
  else throw e
}
```

**Important**: HTTPRoute `backendRefs[].port` must be **numeric**. Named ports are not supported.
To resolve a named port, read the Service via `CoreV1Api`:
```typescript
const svc = await coreV1.readNamespacedService({ name: 'my-service', namespace })
const port = svc.spec?.ports?.find(p => p.name === 'backend-port')?.port ?? 80
```

## Depends On

- `@owlmeans/server-context`, `@owlmeans/config`, `@kubernetes/client-node`
