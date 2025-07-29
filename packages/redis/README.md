# @owlmeans/redis

Redis service integration for OwlMeans Common server applications. This package provides a server-side Redis service implementation with clustering support, connection management, and multi-layer support designed for caching, session storage, and high-performance data operations.

## Overview

The `@owlmeans/redis` package extends the OwlMeans resource system to provide Redis-specific functionality including:

- **Redis Service Integration**: Factory functions for creating Redis services with connection management
- **Cluster Support**: Automatic Redis cluster and sentinel configuration
- **Connection Pooling**: Efficient Redis connection management with proper cleanup
- **Multi-Layer Support**: Integration with OwlMeans context layer system for proper data isolation
- **Prefix Management**: Automatic key prefixing for namespace isolation

This package follows the OwlMeans "quadra" pattern as a server-side implementation complementing the basic `@owlmeans/redis-resource` package.

## Installation

```bash
npm install @owlmeans/redis
```

## Dependencies

This package requires Redis client library and integrates with:
- `@owlmeans/redis-resource`: Base Redis resource definitions
- `@owlmeans/server-context`: Server context management
- `@owlmeans/resource`: Base resource service patterns
- `ioredis`: High-performance Redis client library

## Core Concepts

### Redis Service

The Redis service provides connection management and extends the base database service with Redis-specific functionality like clustering and prefix management.

### Connection Management

Manages Redis connections with support for clustering, sentinels, and proper connection lifecycle management including graceful shutdown.

### Layer Integration

Supports multi-layer data isolation through the OwlMeans context layer system, allowing service-specific and entity-specific Redis configurations.

## API Reference

### Types

#### `RedisMeta`
Metadata interface for Redis-specific configuration extending ioredis options.

```typescript
interface RedisMeta extends RedisOptions {
  masterNumber?: number  // Master node count for cluster
  slaveNumber?: number   // Slave node count for cluster
}
```

### Factory Functions

#### `makeRedisService(alias?: string): RedisDbService`

Creates a Redis service instance with connection management and clustering capabilities.

**Parameters:**
- `alias` (optional): Service alias (default: `DEFAULT_ALIAS`)

**Returns:** `RedisDbService` instance

**Methods:**
- **`db(configAlias?: string): Promise<RedisDb>`**: Gets Redis database instance with prefix for the configuration
- **`initialize(configAlias?: string): Promise<void>`**: Initializes Redis connection with cluster setup
- **`reinitializeContext<T>(context: BasicContext<ServerConfig>): T`**: Reinitializes service with new context

**Example:**
```typescript
import { makeRedisService } from '@owlmeans/redis'

const redisService = makeRedisService('cache')

// Initialize with configuration
await redisService.initialize('prod-config')

// Get database instance with prefix
const db = await redisService.db('prod-config')

// Use Redis operations
await db.client.set('user:123', JSON.stringify(userData))
const user = await db.client.get('user:123')
```

#### `appendRedis<C, T>(context: T, alias?: string): T`

Convenience function to create and register a Redis service with a context.

**Parameters:**
- `context`: Server context instance
- `alias` (optional): Service alias (default: `DEFAULT_ALIAS`)

**Returns:** The context with Redis service registered

**Example:**
```typescript
import { appendRedis } from '@owlmeans/redis'
import { makeServerContext } from '@owlmeans/server-context'

const context = makeServerContext(serverConfig)
const contextWithRedis = appendRedis(context, 'session-store')

await contextWithRedis.configure().init()

// Access Redis service
const redisService = context.service('session-store')
```

### Redis Database Operations

The Redis service provides a database interface with automatic prefixing:

#### `RedisDb`
Database instance with client and prefix management.

```typescript
interface RedisDb {
  client: RedisClient  // ioredis client instance (duplicated for isolation)
  prefix: string       // Key prefix for namespace isolation
}
```

**Usage:**
```typescript
const db = await redisService.db('config-alias')

// Keys are automatically prefixed
await db.client.set('session:user123', sessionData)
await db.client.get('session:user123')

// Use Redis operations with prefix isolation
await db.client.hmset('user:profile', profileData)
const profile = await db.client.hgetall('user:profile')
```

### Cluster Support

The service automatically handles Redis cluster and sentinel configuration:

```typescript
// Configuration with cluster hosts
const config = {
  alias: 'cluster-config',
  host: ['redis1.example.com', 'redis2.example.com', 'redis3.example.com'],
  port: 6379,
  database: 'app-cache',
  // Additional cluster options in meta
  meta: {
    masterNumber: 3,
    slaveNumber: 6,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3
  }
}

// Service automatically detects cluster and sets up connections
await redisService.initialize('cluster-config')
```

### Constants

#### `DEFAULT_ALIAS`
Default service alias for Redis services.

```typescript
const DEFAULT_ALIAS = DEFAULT_DB_ALIAS  // From @owlmeans/redis-resource
```

## Usage Examples

### Basic Redis Service Setup

```typescript
import { makeRedisService } from '@owlmeans/redis'
import { makeServerContext } from '@owlmeans/server-context'

// Create server context with Redis configuration
const context = makeServerContext({
  service: 'my-app',
  type: AppType.Backend,
  layer: Layer.Service,
  dbs: [{
    alias: 'main-cache',
    service: 'redis',
    host: 'localhost',
    port: 6379,
    database: 'app-cache'
  }]
})

// Create and register Redis service
const redisService = makeRedisService('redis')
context.registerService(redisService)

// Initialize context
await context.configure().init()

// Use Redis
const db = await redisService.db('main-cache')
await db.client.set('key', 'value')
```

### Using appendRedis Helper

```typescript
import { appendRedis } from '@owlmeans/redis'

const context = makeServerContext(config)
const contextWithRedis = appendRedis(context)

await contextWithRedis.configure().init()

const redisService = context.service('redis')
const db = await redisService.db()
```

### Session Storage

```typescript
// Configure Redis for session storage
const sessionConfig = {
  alias: 'session-store',
  service: 'redis',
  host: 'localhost',
  port: 6379,
  database: 'sessions'
}

const redisService = makeRedisService('redis')
await redisService.initialize('session-store')

const db = await redisService.db('session-store')

// Store session data
const sessionId = 'sess_123456'
const sessionData = {
  userId: 'user_789',
  loginTime: Date.now(),
  permissions: ['read', 'write']
}

await db.client.setex(`session:${sessionId}`, 3600, JSON.stringify(sessionData))

// Retrieve session data
const rawSession = await db.client.get(`session:${sessionId}`)
const session = JSON.parse(rawSession)
```

### Caching with TTL

```typescript
const cacheService = makeRedisService('cache')
await cacheService.initialize('cache-config')

const db = await cacheService.db('cache-config')

// Cache with expiration
await db.client.setex('user:profile:123', 300, JSON.stringify(userProfile)) // 5 minutes

// Cache with complex data structures
await db.client.hmset('stats:daily', {
  visitors: 1234,
  pageViews: 5678,
  lastUpdated: Date.now()
})
await db.client.expire('stats:daily', 86400) // 24 hours

// Get cached data
const cachedProfile = await db.client.get('user:profile:123')
const stats = await db.client.hgetall('stats:daily')
```

### Multi-Configuration Setup

```typescript
const context = makeServerContext({
  service: 'multi-redis-app',
  type: AppType.Backend,
  layer: Layer.Service,
  dbs: [
    {
      alias: 'session-store',
      service: 'redis',
      host: 'sessions.redis.example.com',
      database: 'sessions',
      meta: { db: 0 }
    },
    {
      alias: 'cache-store',
      service: 'redis',
      host: 'cache.redis.example.com',
      database: 'cache',
      meta: { db: 1 }
    }
  ]
})

const redisService = makeRedisService('redis')
context.registerService(redisService)

await context.configure().init()

// Use different Redis instances
const sessionDb = await redisService.db('session-store')
const cacheDb = await redisService.db('cache-store')

// Operations are isolated by configuration
await sessionDb.client.set('user:session', sessionData)
await cacheDb.client.set('user:profile', profileData)
```

### Cluster Configuration

```typescript
const clusterConfig = {
  service: 'cluster-app',
  type: AppType.Backend,
  layer: Layer.Service,
  dbs: [{
    alias: 'cluster-cache',
    service: 'redis',
    host: [
      'redis1.cluster.example.com',
      'redis2.cluster.example.com', 
      'redis3.cluster.example.com'
    ],
    port: 6379,
    database: 'clustered-cache',
    meta: {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      masterNumber: 3,
      slaveNumber: 6
    }
  }]
}

const context = makeServerContext(clusterConfig)
const redisService = makeRedisService('redis')
context.registerService(redisService)

// Service automatically handles cluster setup
await context.configure().init()

const db = await redisService.db('cluster-cache')
// Operations work transparently across cluster
```

### Service Reinitialization

```typescript
// Original context
const originalContext = makeServerContext(config)
const redisService = makeRedisService()
originalContext.registerService(redisService)

// Later, reinitialize with new context
const newContext = makeServerContext(newConfig)
const reinitializedService = redisService.reinitializeContext(newContext)

// Service now uses new context configuration
await reinitializedService.initialize()
```

### Pub/Sub Operations

```typescript
const redisService = makeRedisService('pubsub')
await redisService.initialize('pubsub-config')

const db = await redisService.db('pubsub-config')

// Subscribe to channels
await db.client.subscribe('notifications')
db.client.on('message', (channel, message) => {
  console.log(`Received from ${channel}: ${message}`)
})

// Publish messages
await db.client.publish('notifications', JSON.stringify({
  type: 'user-login',
  userId: '123',
  timestamp: Date.now()
}))
```

## Configuration

Redis service configuration is handled through the server context's database configuration:

```typescript
interface DatabaseConfig {
  alias: string                    // Configuration alias
  service: string                  // Service name ('redis')
  host: string | string[]          // Redis host(s)
  port?: number                    // Redis port
  database: string                 // Database prefix/namespace
  username?: string                // Authentication username
  password?: string                // Authentication password
  serviceSensitive?: boolean       // Enable service-layer isolation
  entitySensitive?: boolean        // Enable entity-layer isolation
  meta?: RedisMeta                 // Redis-specific options
}
```

### Redis-Specific Meta Options

```typescript
interface RedisMeta extends RedisOptions {
  masterNumber?: number            // Master node count for cluster
  slaveNumber?: number             // Slave node count for cluster
  // Plus all ioredis options:
  db?: number                      // Redis database number
  connectTimeout?: number          // Connection timeout
  commandTimeout?: number          // Command timeout
  retryDelayOnFailover?: number    // Failover retry delay
  enableReadyCheck?: boolean       // Enable ready check
  maxRetriesPerRequest?: number    // Max retries per request
  // ... and many more ioredis options
}
```

## Error Handling

The package provides descriptive error messages for common issues:

- **Client replacement**: Thrown when attempting to replace existing Redis client
- **Context assertion**: Thrown when service context is invalid
- **Connection errors**: Propagated from ioredis client

```typescript
try {
  await redisService.initialize('config-alias')
} catch (error) {
  if (error.message.includes('Cannot replace existing redis client')) {
    // Handle client replacement error
  }
}
```

## Performance Considerations

- **Connection Pooling**: ioredis handles connection pooling automatically
- **Client Duplication**: Each db() call creates a duplicate client for isolation
- **Cluster Latency**: Cluster setup may add initialization time
- **Memory Usage**: Multiple Redis connections increase memory usage
- **Key Prefixing**: Adds minimal overhead for namespace isolation

## Security Considerations

### Connection Security
- Use authentication credentials for production Redis instances
- Configure TLS/SSL for Redis connections when needed
- Restrict Redis access to necessary IP addresses

### Data Security
- Be cautious with sensitive data in Redis (consider encryption)
- Use appropriate TTL values to limit data exposure time
- Implement proper access controls at the application level

### Namespace Isolation
- Use layer-sensitive configurations for multi-tenant applications
- Leverage prefix management for data isolation between services

## Integration with OwlMeans Ecosystem

This package integrates with:

- **@owlmeans/redis-resource**: Base Redis resource types and interfaces
- **@owlmeans/server-context**: Server context and configuration management
- **@owlmeans/resource**: Base resource service patterns
- **@owlmeans/mongo**: For multi-database architectures

## Best Practices

1. **Use appropriate TTL values** for cached data to prevent memory bloat
2. **Configure clustering** for production high-availability
3. **Separate Redis configurations** by use case (cache vs sessions vs pub/sub)
4. **Monitor Redis memory usage** and implement eviction policies
5. **Use connection pooling** efficiently with proper client management

## Related Packages

- **@owlmeans/redis-resource**: Base Redis resource definitions
- **@owlmeans/mongo**: MongoDB service implementation
- **@owlmeans/server-context**: Server context management
- **@owlmeans/resource**: Base resource service patterns

## Redis Use Cases

### Caching
- API response caching
- Database query result caching
- Computed value caching

### Session Storage
- User session management
- Authentication token storage
- Shopping cart persistence

### Real-time Features
- Pub/Sub messaging
- Live notifications
- Real-time analytics

### Rate Limiting
- API rate limiting
- Request throttling
- Usage tracking