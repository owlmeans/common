# @owlmeans/kluster

The **@owlmeans/kluster** package provides Kubernetes integration for OwlMeans Common Libraries, enabling applications to interact with Kubernetes clusters for service discovery, pod management, and configuration resolution in cloud-native environments.

## Purpose

This package serves as a Kubernetes integration layer for OwlMeans applications, specifically designed for:

- **Service Discovery**: Automatically discover and connect to services running in Kubernetes clusters
- **Pod Management**: Query and interact with pods using label selectors
- **Configuration Resolution**: Resolve configuration values from Kubernetes resources at runtime
- **Cloud-native Deployment**: Enable applications to work seamlessly in Kubernetes environments
- **Dynamic Service Endpoints**: Automatically resolve service hostnames and endpoints
- **Network API Integration**: Access Kubernetes networking APIs for advanced operations

## Key Concepts

### Kubernetes Service Discovery
The package provides automatic service discovery within Kubernetes clusters, allowing applications to find and connect to other services without hardcoded endpoints.

### Configuration Directives
Special configuration syntax (`kluster:directive:query`) that gets resolved at runtime using Kubernetes API calls, enabling dynamic configuration based on cluster state.

### Lazy Initialization
Kubernetes client is initialized lazily when first accessed, reducing startup time and resource usage when Kubernetes features are not immediately needed.

### Label Selector Queries
Uses Kubernetes label selectors to query for pods and services, providing flexible and powerful resource discovery capabilities.

## Installation

```bash
npm install @owlmeans/kluster
```

## API Reference

### Types

#### `KlusterService`
Main service interface for Kubernetes operations.

```typescript
interface KlusterService extends LazyService {
  config?: KubeConfig
  api?: CoreV1Api
  
  getHostnames(selector: string): Promise<string[]>
  getServiceHostname(selector: string): Promise<string>
  dispatch<T>(action: string, query: string): Promise<T>
  makeNetworkingApi(): NetworkingV1Api
}
```

#### `KlusterConfig`
Configuration interface extending ServerConfig.

```typescript
interface KlusterConfig extends ServerConfig {
  kluster?: {
    namespace?: string
  }
}
```

### Core Functions

#### `makeKlusterService(alias?: string): KlusterService`

Creates a Kubernetes service instance with lazy initialization.

**Parameters:**
- `alias`: Service alias (defaults to 'kluster')

**Returns:** KlusterService instance

```typescript
import { makeKlusterService } from '@owlmeans/kluster'

const klusterService = makeKlusterService('k8s-client')
```

#### `klusterize<C extends KlusterConfig, T extends BasicContext<C>>(context: T, alias?: string): T`

Enhances a context with Kubernetes capabilities and registers necessary middleware.

**Parameters:**
- `context`: Application context to enhance
- `alias`: Service alias (defaults to 'kluster')

**Returns:** Enhanced context with Kubernetes support

```typescript
import { klusterize } from '@owlmeans/kluster'
import { makeServerContext } from '@owlmeans/server-context'

const context = makeServerContext(config)
const k8sContext = klusterize(context)
```

#### `createMiddleware(alias?: string): Middleware`

Creates middleware for processing Kubernetes configuration directives.

**Parameters:**
- `alias`: Service alias (defaults to 'kluster')

**Returns:** Middleware instance

```typescript
import { createMiddleware } from '@owlmeans/kluster'

const middleware = createMiddleware('k8s-client')
context.registerMiddleware(middleware)
```

### Service Methods

#### `getHostnames(selector: string): Promise<string[]>`

Retrieves pod IP addresses using a label selector.

**Parameters:**
- `selector`: Kubernetes label selector

**Returns:** Promise resolving to array of pod IP addresses

```typescript
const klusterService = context.service<KlusterService>('kluster')
const podIPs = await klusterService.getHostnames('app=redis,tier=cache')
```

#### `getServiceHostname(selector: string): Promise<string>`

Retrieves service hostname using a label selector.

**Parameters:**
- `selector`: Kubernetes label selector

**Returns:** Promise resolving to service hostname

```typescript
const serviceName = await klusterService.getServiceHostname('app=database')
```

#### `dispatch<T>(action: string, query: string): Promise<T>`

Dispatches actions for configuration resolution.

**Parameters:**
- `action`: Action type ('hostname' or 'service')
- `query`: Query string (label selector or config path)

**Returns:** Promise resolving to action result

```typescript
const result = await klusterService.dispatch('service', 'app=api-gateway')
```

#### `makeNetworkingApi(): NetworkingV1Api`

Creates a Kubernetes Networking API client.

**Returns:** NetworkingV1Api instance

```typescript
const networkingApi = klusterService.makeNetworkingApi()
const ingresses = await networkingApi.listIngressForAllNamespaces()
```

### Constants

#### Service Configuration
```typescript
const DEFAULT_ALIAS = 'kluster'
const DEFAULT_NAMESPACE = 'default'
```

#### Configuration Directives
```typescript
const DIRECTIVE = 'kluster'
const SEP = ':'
const ACT_HOST = 'hostname'
const ACT_SERVICE = 'service'
```

## Usage Examples

### Basic Kubernetes Integration

```typescript
import { klusterize } from '@owlmeans/kluster'
import { makeServerContext, makeServerConfig } from '@owlmeans/server-context'

// Create server configuration with Kubernetes settings
const config = makeServerConfig('k8s-app', {
  kluster: {
    namespace: 'production'
  },
  port: 8080
})

// Create and enhance context with Kubernetes capabilities
const context = makeServerContext(config)
const k8sContext = klusterize(context)

await k8sContext.configure().init()
```

### Service Discovery

```typescript
import { KlusterService } from '@owlmeans/kluster'

// Get Kubernetes service
const klusterService = context.service<KlusterService>('kluster')

// Discover database service
const dbServiceName = await klusterService.getServiceHostname('app=postgres,tier=database')
console.log('Database service:', dbServiceName)

// Get all Redis cache pod IPs
const redisIPs = await klusterService.getHostnames('app=redis,tier=cache')
console.log('Redis pods:', redisIPs)

// Connect to discovered service
const dbConnection = createConnection({
  host: dbServiceName,
  port: 5432,
  database: 'myapp'
})
```

### Configuration Directives

```typescript
// Configuration with Kubernetes directives
const config = makeServerConfig('microservice', {
  kluster: {
    namespace: 'production'
  },
  services: {
    // These will be resolved at runtime using Kubernetes API
    database: 'kluster:service:app=postgres',
    cache: 'kluster:service:app=redis',
    messageQueue: 'kluster:service:app=rabbitmq'
  },
  externalServices: {
    // Resolve to actual pod IPs for load balancing
    apiNodes: 'kluster:hostname:app=api,tier=backend'
  }
})

// After context initialization, directives are resolved
await context.configure().init()

// Now services contain actual Kubernetes service names
console.log(context.cfg.services.database) // e.g., "postgres-service"
console.log(context.cfg.externalServices.apiNodes) // e.g., ["10.1.1.5", "10.1.1.6"]
```

### Microservice Communication

```typescript
import { klusterize, KlusterService } from '@owlmeans/kluster'

// Setup microservice with Kubernetes discovery
const config = makeServerConfig('user-service', {
  kluster: { namespace: 'microservices' },
  downstream: {
    authService: 'kluster:service:app=auth-service',
    emailService: 'kluster:service:app=email-service',
    notificationService: 'kluster:service:app=notification-service'
  }
})

const context = klusterize(makeServerContext(config))
await context.configure().init()

// Use discovered services
async function createUser(userData: UserData) {
  // Call authentication service
  const authResponse = await fetch(`http://${context.cfg.downstream.authService}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  })
  
  if (authResponse.ok) {
    const user = await saveUser(userData)
    
    // Send welcome email
    await fetch(`http://${context.cfg.downstream.emailService}/send`, {
      method: 'POST',
      body: JSON.stringify({
        to: user.email,
        template: 'welcome',
        data: { userName: user.name }
      })
    })
    
    return user
  }
  
  throw new Error('Authentication failed')
}
```

### Load Balancing with Pod Discovery

```typescript
import { KlusterService } from '@owlmeans/kluster'

class LoadBalancedClient {
  private klusterService: KlusterService
  private endpoints: string[] = []
  private currentIndex = 0
  
  constructor(klusterService: KlusterService, private selector: string) {
    this.klusterService = klusterService
    this.refreshEndpoints()
  }
  
  private async refreshEndpoints() {
    try {
      this.endpoints = await this.klusterService.getHostnames(this.selector)
      console.log(`Discovered ${this.endpoints.length} endpoints`)
    } catch (error) {
      console.error('Failed to refresh endpoints:', error)
    }
  }
  
  private getNextEndpoint(): string {
    if (this.endpoints.length === 0) {
      throw new Error('No available endpoints')
    }
    
    const endpoint = this.endpoints[this.currentIndex]
    this.currentIndex = (this.currentIndex + 1) % this.endpoints.length
    return endpoint
  }
  
  async makeRequest(path: string, options: RequestInit = {}) {
    const endpoint = this.getNextEndpoint()
    const url = `http://${endpoint}:8080${path}`
    
    try {
      const response = await fetch(url, options)
      return response
    } catch (error) {
      console.error(`Request to ${endpoint} failed:`, error)
      // Refresh endpoints and retry
      await this.refreshEndpoints()
      throw error
    }
  }
}

// Usage
const klusterService = context.service<KlusterService>('kluster')
const apiClient = new LoadBalancedClient(klusterService, 'app=api,tier=backend')

const response = await apiClient.makeRequest('/health')
```

### Health Monitoring

```typescript
import { KlusterService } from '@owlmeans/kluster'

class HealthMonitor {
  constructor(
    private klusterService: KlusterService,
    private services: Record<string, string>
  ) {}
  
  async checkServiceHealth(): Promise<Record<string, boolean>> {
    const healthStatus: Record<string, boolean> = {}
    
    for (const [serviceName, selector] of Object.entries(this.services)) {
      try {
        const serviceHost = await this.klusterService.getServiceHostname(selector)
        const response = await fetch(`http://${serviceHost}/health`, {
          timeout: 5000
        })
        healthStatus[serviceName] = response.ok
      } catch (error) {
        console.error(`Health check failed for ${serviceName}:`, error)
        healthStatus[serviceName] = false
      }
    }
    
    return healthStatus
  }
  
  async checkPodHealth(): Promise<Record<string, number>> {
    const podCounts: Record<string, number> = {}
    
    for (const [serviceName, selector] of Object.entries(this.services)) {
      try {
        const podIPs = await this.klusterService.getHostnames(selector)
        podCounts[serviceName] = podIPs.length
      } catch (error) {
        console.error(`Pod discovery failed for ${serviceName}:`, error)
        podCounts[serviceName] = 0
      }
    }
    
    return podCounts
  }
}

// Setup health monitoring
const healthMonitor = new HealthMonitor(klusterService, {
  'database': 'app=postgres',
  'cache': 'app=redis',
  'api': 'app=api,tier=backend'
})

// Monitor health every 30 seconds
setInterval(async () => {
  const serviceHealth = await healthMonitor.checkServiceHealth()
  const podCounts = await healthMonitor.checkPodHealth()
  
  console.log('Service Health:', serviceHealth)
  console.log('Pod Counts:', podCounts)
}, 30000)
```

### Ingress Management

```typescript
import { KlusterService } from '@owlmeans/kluster'

async function manageIngress(klusterService: KlusterService) {
  const networkingApi = klusterService.makeNetworkingApi()
  
  // List all ingresses
  const ingresses = await networkingApi.listIngressForAllNamespaces()
  console.log('Available ingresses:', ingresses.body.items.map(i => i.metadata?.name))
  
  // Create new ingress
  const ingressManifest = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'api-ingress',
      namespace: 'production'
    },
    spec: {
      rules: [{
        host: 'api.example.com',
        http: {
          paths: [{
            path: '/',
            pathType: 'Prefix',
            backend: {
              service: {
                name: 'api-service',
                port: { number: 80 }
              }
            }
          }]
        }
      }]
    }
  }
  
  try {
    await networkingApi.createNamespacedIngress('production', ingressManifest)
    console.log('Ingress created successfully')
  } catch (error) {
    console.error('Failed to create ingress:', error)
  }
}
```

### Configuration File Resolution

```typescript
// config.yaml
const yamlConfig = `
database:
  host: kluster:service:app=postgres
  port: 5432
  replicas: kluster:hostname:app=postgres

cache:
  primary: kluster:service:app=redis-primary
  replicas: kluster:hostname:app=redis-replica

services:
  auth: kluster:service:app=auth-service
  notification: kluster:service:app=notification-service
`

// Load and process configuration
import yaml from 'yaml'

const config = yaml.parse(yamlConfig)
const context = klusterize(makeServerContext(config))

// After initialization, all kluster directives are resolved
await context.configure().init()

console.log('Resolved configuration:', context.cfg)
// Output:
// {
//   database: { host: 'postgres-service', port: 5432, replicas: ['10.1.1.10', '10.1.1.11'] },
//   cache: { primary: 'redis-primary-service', replicas: ['10.1.2.20', '10.1.2.21'] },
//   services: { auth: 'auth-service', notification: 'notification-service' }
// }
```

## Error Handling

```typescript
import { KlusterService } from '@owlmeans/kluster'

async function robustServiceDiscovery(klusterService: KlusterService) {
  try {
    // Attempt service discovery
    const serviceName = await klusterService.getServiceHostname('app=api')
    return serviceName
  } catch (error) {
    console.error('Service discovery failed:', error)
    
    // Fallback to default service name
    return 'api-service'
  }
}

// Handle network errors gracefully
async function resilientPodDiscovery(klusterService: KlusterService, selector: string) {
  const maxRetries = 3
  let retries = 0
  
  while (retries < maxRetries) {
    try {
      const pods = await klusterService.getHostnames(selector)
      if (pods.length > 0) {
        return pods
      }
      throw new Error('No pods found')
    } catch (error) {
      retries++
      console.warn(`Pod discovery attempt ${retries} failed:`, error.message)
      
      if (retries < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000))
      }
    }
  }
  
  throw new Error(`Failed to discover pods after ${maxRetries} attempts`)
}
```

## Integration Patterns

### Deployment Configuration

```yaml
# kubernetes-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: production
data:
  config.json: |
    {
      "database": "kluster:service:app=postgres",
      "cache": "kluster:service:app=redis",
      "messageQueue": "kluster:service:app=rabbitmq"
    }
```

```typescript
// Application code
import { klusterize } from '@owlmeans/kluster'

const config = makeServerConfig('app', {
  kluster: { namespace: 'production' },
  // Configuration loaded from ConfigMap
  database: 'kluster:service:app=postgres',
  cache: 'kluster:service:app=redis'
})

const context = klusterize(makeServerContext(config))
```

### Helm Chart Integration

```yaml
# values.yaml
app:
  namespace: {{ .Values.namespace }}
  services:
    database: "kluster:service:app=postgres"
    cache: "kluster:service:app=redis"

# deployment.yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        env:
        - name: KLUSTER_NAMESPACE
          value: {{ .Values.namespace }}
```

## Best Practices

1. **Namespace Management**: Always specify appropriate namespaces for service discovery
2. **Label Consistency**: Use consistent labeling conventions across services
3. **Error Handling**: Implement robust error handling for network operations
4. **Caching**: Consider caching service discovery results to reduce API calls
5. **Security**: Ensure proper RBAC permissions for Kubernetes API access
6. **Monitoring**: Monitor service discovery operations and cluster health
7. **Fallbacks**: Provide fallback mechanisms when service discovery fails

## Dependencies

This package depends on:
- `@owlmeans/config` - Configuration management
- `@owlmeans/context` - Context management system
- `@owlmeans/server-config` - Server configuration utilities
- `@owlmeans/server-context` - Server context management
- `@kubernetes/client-node` - Official Kubernetes client library

## Related Packages

- [`@owlmeans/server-app`](../server-app) - Server application framework
- [`@owlmeans/server-context`](../server-context) - Server context management
- [`@owlmeans/config`](../config) - Configuration management system
