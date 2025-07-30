# @owlmeans/redis-resource

The **@owlmeans/redis-resource** package provides Redis-based resource storage implementation for OwlMeans Common Libraries, designed for fullstack microservices and microclients development with focus on security and proper authentication and authorization.

## Purpose

This package serves as a Redis integration layer for the OwlMeans resource system that:

- **Provides Redis-backed storage** for resources with high performance and scalability
- **Supports pub/sub messaging** for real-time data synchronization across services
- **Implements full CRUD operations** with Redis-optimized performance
- **Offers TTL support** for automatic expiration of records
- **Enables horizontal scaling** through Redis clustering
- **Integrates with context system** for dependency injection and service management

## Core Concepts

### Redis Resource
A Redis resource is a storage implementation that uses Redis as the backend, providing fast key-value storage with advanced features like pub/sub, TTL, and clustering support.

### Key Management
Records are stored in Redis using a configurable prefix and key structure, allowing for namespace separation and efficient data organization.

### Pub/Sub Integration
The package provides built-in pub/sub functionality for real-time data synchronization, enabling reactive updates across distributed systems.

### Database Service Integration
Integrates with the OwlMeans database service pattern, allowing for connection pooling and database management.

## API Reference

### Factory Functions

#### `makeRedisResource<R, T>(alias, dbAlias?, serviceAlias?, makeCustomResource?): T`

Creates a new Redis resource instance.

```typescript
import { makeRedisResource } from '@owlmeans/redis-resource'

interface User {
  id: string
  name: string
  email: string
}

const userResource = makeRedisResource<User>('users', 'redis-main')
```

**Parameters:**
- `alias`: string - Resource alias for context registration
- `dbAlias`: string (optional) - Database alias, defaults to `DEFAULT_DB_ALIAS` ('redis')
- `serviceAlias`: string (optional) - Service alias, defaults to `DEFAULT_DB_ALIAS`
- `makeCustomResource`: ResourceMaker (optional) - Custom resource factory function

**Returns:** RedisResource instance with full CRUD and pub/sub capabilities

### Resource Methods

The Redis resource implements the standard `Resource<ResourceRecord>` interface with additional Redis-specific methods:

#### Core CRUD Operations

#### `get<T>(id, field?, opts?): Promise<T>`

Retrieves a record by ID or field value. Throws `UnknownRecordError` if not found.

```typescript
const user = await userResource.get<User>('user-123')
```

#### `load<T>(id, field?, opts?): Promise<T | null>`

Loads a record by ID or field value. Returns `null` if not found.

```typescript
const user = await userResource.load<User>('user-123')
if (user) {
  console.log('User found:', user.name)
}
```

#### `create<T>(record, opts?): Promise<T>`

Creates a new record in Redis storage.

```typescript
const user = await userResource.create({
  id: 'user-123',
  name: 'John Doe',
  email: 'john@example.com'
}, { ttl: 3600 }) // TTL in seconds
```

**Options:**
- `ttl`: number | Date - Time to live in seconds (number) or expiration date (Date)

#### `update<T>(record, opts?): Promise<T>`

Updates an existing record.

```typescript
const updatedUser = await userResource.update({
  id: 'user-123',
  name: 'John Smith',
  email: 'john.smith@example.com'
}, { ttl: 7200 })
```

#### `save<T>(record, opts?): Promise<T>`

Creates or updates a record (upsert operation).

```typescript
const user = await userResource.save({
  id: 'user-123',
  name: 'John Doe',
  email: 'john@example.com'
})
```

#### `delete(id, opts?): Promise<T | null>`

Deletes a record and returns it, or `null` if not found.

```typescript
const deletedUser = await userResource.delete('user-123')
```

#### `pick<T>(id, opts?): Promise<T>`

Deletes a record and returns it. Throws `UnknownRecordError` if not found.

```typescript
const pickedUser = await userResource.pick('user-123')
```

#### `list<T>(criteria?, opts?): Promise<ListResult<T>>`

Lists records with pagination support.

```typescript
const result = await userResource.list<User>({}, { 
  pager: { page: 0, size: 20 } 
})
console.log('Users:', result.items)
console.log('Total:', result.pager?.total)
```

### Redis-Specific Methods

#### `key(key?): string`

Generates a Redis key with the configured prefix.

```typescript
const redisKey = userResource.key('user-123')
console.log(redisKey) // "prefix:user-123"
```

#### `subscribe<Type>(handler, key?): Promise<() => Promise<void>>`

Subscribes to Redis pub/sub messages for real-time updates.

```typescript
const unsubscribe = await userResource.subscribe<User>(
  async (user) => {
    console.log('User updated:', user)
  },
  'user-updates'
)

// Later, unsubscribe
await unsubscribe()
```

**Parameters:**
- `handler`: (value: Type) => Promise<void> - Message handler function
- `key`: SubOpts (optional) - Subscription options or key

#### `publish<Type>(value, key?): Promise<void>`

Publishes a message to Redis pub/sub.

```typescript
await userResource.publish<User>({
  id: 'user-123',
  name: 'John Doe',
  email: 'john@example.com'
}, 'user-updates')
```

### Types

#### `RedisResource<T>`

Main interface for Redis resources extending the base Resource interface.

```typescript
interface RedisResource<T extends ResourceRecord> extends Resource<T> {
  name?: string
  db: RedisDb
  key: (key?: string) => string
  subscribe: <Type extends T>(handler: (value: Type) => Promise<void>, key?: SubOpts) => Promise<() => Promise<void>>
  publish: <Type extends T>(value: Type, key?: string) => Promise<void>
}
```

#### `RedisDb`

Redis database connection interface.

```typescript
interface RedisDb {
  client: RedisCommander
  prefix: string
}
```

#### `RedisDbService`

Service interface for Redis database management.

```typescript
interface RedisDbService extends ResourceDbService<RedisDb, RedisClient> {}
```

#### `RedisClient`

Type alias for Redis client (supports both single Redis and Cluster).

```typescript
type RedisClient = Redis | Cluster
```

#### `SubscriptionOptions`

Options for Redis subscriptions.

```typescript
interface SubscriptionOptions extends LifecycleOptions {
  key?: string
  once?: boolean
}
```

### Constants

#### `DEFAULT_DB_ALIAS`

Default database alias for Redis connections.

```typescript
const DEFAULT_DB_ALIAS = 'redis'
```

#### `DEFAULT_PAGE_SIZE`

Default page size for list operations.

```typescript
const DEFAULT_PAGE_SIZE = 10
```

## Usage Examples

### Basic Usage

```typescript
import { makeRedisResource } from '@owlmeans/redis-resource'

interface Product {
  id: string
  name: string
  price: number
  category: string
}

// Create Redis resource
const productResource = makeRedisResource<Product>('products')

// Create products
await productResource.create({
  id: 'prod-1',
  name: 'Laptop',
  price: 999.99,
  category: 'electronics'
})

await productResource.create({
  id: 'prod-2',
  name: 'Book',
  price: 19.99,
  category: 'books'
}, { ttl: 86400 }) // Expires in 24 hours

// Retrieve products
const laptop = await productResource.get('prod-1')
console.log('Product:', laptop.name, laptop.price)

// List all products
const { items, pager } = await productResource.list()
console.log('Total products:', pager?.total)
```

### Context Integration

```typescript
import { makeRedisResource } from '@owlmeans/redis-resource'
import { makeServerContext, makeServerConfig } from '@owlmeans/server-context'
import { AppType } from '@owlmeans/context'

// Create server context
const config = makeServerConfig(AppType.Backend, 'product-service')
const context = makeServerContext(config)

// Create and register Redis resource
const productResource = makeRedisResource<Product>('products', 'redis-main')
context.registerResource(productResource)

// Configure and initialize context
context.configure()
await context.init()

// Use resource through context
const resource = context.resource<typeof productResource>('products')
```

### Pub/Sub Usage

```typescript
import { makeRedisResource } from '@owlmeans/redis-resource'

const orderResource = makeRedisResource<Order>('orders')

// Subscribe to order updates
const unsubscribe = await orderResource.subscribe<Order>(
  async (order) => {
    console.log('Order updated:', order.id, order.status)
    
    // Process order update
    if (order.status === 'completed') {
      await processCompletedOrder(order)
    }
  },
  { key: 'order-updates', once: false }
)

// Publish order updates
await orderResource.publish({
  id: 'order-123',
  status: 'completed',
  total: 299.99
}, 'order-updates')

// Clean up subscription
await unsubscribe()
```

### TTL and Expiration

```typescript
const sessionResource = makeRedisResource<Session>('sessions')

// Create session with TTL
await sessionResource.create({
  id: 'session-abc123',
  userId: 'user-456',
  createdAt: new Date()
}, { ttl: 3600 }) // Expires in 1 hour

// Update with new expiration
await sessionResource.update({
  id: 'session-abc123',
  lastActivity: new Date()
}, { ttl: new Date(Date.now() + 7200000) }) // Expires in 2 hours
```

### Real-time Synchronization

```typescript
// Service A - Updates user data
const userResource = makeRedisResource<User>('users')

await userResource.update({
  id: 'user-123',
  lastLogin: new Date(),
  status: 'online'
})

// Notify other services
await userResource.publish({
  id: 'user-123',
  event: 'status-change',
  status: 'online'
}, 'user-events')

// Service B - Listens for user events
const unsubscribe = await userResource.subscribe<UserEvent>(
  async (event) => {
    console.log('User event:', event.event, event.id)
    await updateLocalCache(event)
  },
  'user-events'
)
```

### Error Handling

```typescript
import { UnknownRecordError, RecordExists, MisshapedRecord } from '@owlmeans/resource'

const userResource = makeRedisResource<User>('users')

try {
  // This will throw UnknownRecordError
  await userResource.get('non-existent-user')
} catch (error) {
  if (error instanceof UnknownRecordError) {
    console.log('User not found:', error.message)
  }
}

try {
  await userResource.create({ id: 'user-1', name: 'Alice', email: 'alice@example.com' })
  // This will throw RecordExists
  await userResource.create({ id: 'user-1', name: 'Bob', email: 'bob@example.com' })
} catch (error) {
  if (error instanceof RecordExists) {
    console.log('User already exists:', error.message)
    // Use save() for upsert instead
    await userResource.save({ id: 'user-1', name: 'Bob', email: 'bob@example.com' })
  }
}
```

### Advanced Filtering and Pagination

```typescript
const productResource = makeRedisResource<Product>('products')

// List with pagination
const page1 = await productResource.list({}, { 
  pager: { page: 0, size: 10 } 
})

const page2 = await productResource.list({}, { 
  pager: { page: 1, size: 10 } 
})

console.log('Page 1:', page1.items.length)
console.log('Page 2:', page2.items.length)
console.log('Total products:', page1.pager?.total)
```

## Integration Patterns

### Microservices Architecture

```typescript
// Product Service
const productResource = makeRedisResource<Product>('products', 'redis-products')

// Order Service  
const orderResource = makeRedisResource<Order>('orders', 'redis-orders')

// Shared event bus
const eventResource = makeRedisResource<Event>('events', 'redis-events')

// Cross-service communication
await productResource.subscribe<ProductEvent>(
  async (event) => {
    if (event.type === 'price-updated') {
      await orderResource.publish({
        type: 'product-price-changed',
        productId: event.productId,
        newPrice: event.price
      }, 'order-events')
    }
  },
  'product-events'
)
```

### Caching Layer

```typescript
// Use Redis resource as a caching layer
const cacheResource = makeRedisResource<CacheEntry>('cache')

const getCachedData = async <T>(key: string, fetcher: () => Promise<T>): Promise<T> => {
  try {
    const cached = await cacheResource.load(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T
    }
  } catch (error) {
    // Cache miss, continue to fetch
  }
  
  const data = await fetcher()
  
  // Cache for 5 minutes
  await cacheResource.save({
    id: key,
    data,
    expiresAt: Date.now() + 300000
  }, { ttl: 300 })
  
  return data
}

// Usage
const userData = await getCachedData(`user:${userId}`, () => fetchUserFromDB(userId))
```

## Performance Considerations

### Connection Management
- **Connection Pooling** - Use Redis connection pools for high-traffic applications
- **Cluster Support** - Leverage Redis clustering for horizontal scaling
- **Pipeline Operations** - Batch multiple operations for better performance

### Data Organization
- **Key Prefixes** - Use meaningful prefixes to organize data and avoid conflicts
- **TTL Management** - Set appropriate TTL values to manage memory usage
- **Pagination** - Use pagination for large datasets to avoid memory issues

### Best Practices

1. **Use appropriate TTL** - Set TTL for temporary data to prevent memory bloat
2. **Monitor Redis memory** - Keep track of Redis memory usage and key counts
3. **Implement error handling** - Handle Redis connection failures gracefully
4. **Use pub/sub wisely** - Avoid creating too many subscriptions that could impact performance
5. **Batch operations** - Use pipelines for multiple operations when possible

## Error Handling

The package uses standard error types from `@owlmeans/resource`:

- **`UnknownRecordError`** - Thrown when trying to access a non-existent record
- **`RecordExists`** - Thrown when trying to create a record with an existing ID
- **`MisshapedRecord`** - Thrown when record structure is invalid
- **`UnsupportedArgumentError`** - Thrown when unsupported arguments are provided

Additional Redis-specific errors may be thrown by the underlying ioredis client.

## Dependencies

This package depends on:
- `@owlmeans/context` - For contextual resource management
- `@owlmeans/resource` - For resource interface and error types
- `ioredis` - Redis client library for Node.js

## Related Packages

- [`@owlmeans/resource`](../resource) - Base resource interface and utilities
- [`@owlmeans/mongo-resource`](../mongo-resource) - MongoDB resource implementation
- [`@owlmeans/static-resource`](../static-resource) - In-memory resource implementation
- [`@owlmeans/server-context`](../server-context) - Server-side context management