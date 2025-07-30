# @owlmeans/static-resource

The **@owlmeans/static-resource** package provides an in-memory resource storage solution for OwlMeans Common Libraries, designed for fullstack microservices and microclients development with focus on security and proper authentication and authorization.

## Purpose

This package serves as a lightweight, in-memory resource implementation that:

- **Provides temporary storage** for resources that don't require persistent storage
- **Supports TTL (Time To Live)** for automatic cleanup of expired records
- **Integrates with context system** for dependency injection and resource management
- **Offers CRUD operations** with validation and error handling
- **Enables testing scenarios** where persistent storage is not needed

## Core Concepts

### Static Resource
A static resource is an in-memory storage that implements the standard `Resource<ResourceRecord>` interface from `@owlmeans/resource`. It stores records in memory and provides methods for creating, reading, and deleting records.

### Key-Value Storage
Records are stored using a key-value approach where each record must have an `id` field. Multiple static resource instances can share the same underlying storage by using the same key.

### TTL Support
Records can be created with a Time To Live (TTL) option, after which they are automatically removed from the storage.

## API Reference

### Factory Functions

#### `createStaticResource(alias?, key?): Resource<ResourceRecord>`

Creates a new static resource instance.

```typescript
import { createStaticResource } from '@owlmeans/static-resource'

const resource = createStaticResource('my-cache')
```

**Parameters:**
- `alias`: string (optional) - Resource alias, defaults to `DEFAULT_ALIAS` ('static')
- `key`: string (optional) - Storage key, defaults to the alias value

**Returns:** Resource instance implementing full CRUD operations

#### `appendStaticResource<C, T>(ctx, alias?, key?): T & StaticResourceAppend`

Adds static resource functionality to a context.

```typescript
import { appendStaticResource } from '@owlmeans/static-resource'
import { makeBasicContext, makeBasicConfig, AppType } from '@owlmeans/context'

const config = makeBasicConfig(AppType.Backend, 'my-service')
const context = makeBasicContext(config)
const contextWithStatic = appendStaticResource(context, 'cache')
```

**Parameters:**
- `ctx`: T - The context to extend
- `alias`: string (optional) - Resource alias, defaults to `DEFAULT_ALIAS`
- `key`: string (optional) - Storage key, defaults to the alias value

**Returns:** Extended context with `getStaticResource` method

### Resource Methods

The static resource implements the standard `Resource<ResourceRecord>` interface:

#### `get<T>(id, field?, opts?): Promise<T>`

Retrieves a record by ID or field value. Throws `UnknownRecordError` if not found.

```typescript
const user = await resource.get<User>('user-123')
```

#### `load<T>(id, field?, opts?): Promise<T | null>`

Loads a record by ID or field value. Returns `null` if not found.

```typescript
const user = await resource.load<User>('user-123')
if (user) {
  console.log('User found:', user.name)
}
```

#### `list<T>(criteria?, opts?): Promise<ListResult<T>>`

Lists all records in the storage.

```typescript
const result = await resource.list<User>()
console.log('Total users:', result.items.length)
```

**Note:** Criteria and options parameters are not supported and will throw `UnsupportedArgumentError`.

#### `create<T>(record, opts?): Promise<T>`

Creates a new record in the storage.

```typescript
const user = await resource.create({
  id: 'user-123',
  name: 'John Doe',
  email: 'john@example.com'
}, { ttl: 3600 }) // TTL in seconds
```

**Options:**
- `ttl`: number | Date - Time to live in seconds (number) or expiration date (Date)

**Throws:**
- `UnknownRecordError` - If record doesn't have an `id` field
- `RecordExists` - If record with the same ID already exists

#### `delete(id, opts?): Promise<T | null>`

Deletes a record and returns it, or `null` if not found.

```typescript
const deletedUser = await resource.delete('user-123')
```

#### `pick<T>(id, opts?): Promise<T>`

Deletes a record and returns it. Throws `UnknownRecordError` if not found.

```typescript
const pickedUser = await resource.pick('user-123')
```

### Unsupported Methods

The following methods throw `UnsupportedMethodError`:
- `save()` - Static resources don't support updating existing records
- `update()` - Static resources don't support partial updates

### Types

#### `StaticResourceAppend`

Interface added to contexts when using `appendStaticResource`.

```typescript
interface StaticResourceAppend {
  getStaticResource: <T extends ResourceRecord>(alias?: string) => Resource<T>
}
```

#### `Config` and `Context`

Type aliases for basic context configuration and context interfaces.

```typescript
interface Config extends BasicConfig {}
interface Context<C extends Config = Config> extends BasicContext<C> {}
```

### Constants

#### `DEFAULT_ALIAS`

Default alias for static resources.

```typescript
const DEFAULT_ALIAS = 'static'
```

## Usage Examples

### Basic Usage

```typescript
import { createStaticResource } from '@owlmeans/static-resource'

// Create a static resource
const cache = createStaticResource('user-cache')

// Create records
await cache.create({ id: 'user-1', name: 'Alice', role: 'admin' })
await cache.create({ id: 'user-2', name: 'Bob', role: 'user' })

// Retrieve records
const alice = await cache.get('user-1')
console.log('Found user:', alice.name)

// List all records
const { items } = await cache.list()
console.log('Total users:', items.length)

// Delete a record
const deleted = await cache.delete('user-1')
console.log('Deleted user:', deleted?.name)
```

### Context Integration

```typescript
import { appendStaticResource } from '@owlmeans/static-resource'
import { makeBasicContext, makeBasicConfig, AppType } from '@owlmeans/context'

const config = makeBasicConfig(AppType.Backend, 'user-service')
const context = makeBasicContext(config)

// Add static resource to context
const enhancedContext = appendStaticResource(context, 'session-cache')

// Configure and initialize context
enhancedContext.configure()
await enhancedContext.init()

// Use the static resource
const sessionCache = enhancedContext.getStaticResource('session-cache')
await sessionCache.create({
  id: 'session-123',
  userId: 'user-456',
  expires: new Date(Date.now() + 3600000)
})
```

### TTL Usage

```typescript
import { createStaticResource } from '@owlmeans/static-resource'

const cache = createStaticResource('temporary-cache')

// Create record with TTL in seconds
await cache.create({
  id: 'temp-data',
  value: 'This will expire'
}, { ttl: 60 }) // Expires in 60 seconds

// Create record with expiration date
const expirationDate = new Date(Date.now() + 30000) // 30 seconds from now
await cache.create({
  id: 'temp-data-2',
  value: 'This will also expire'
}, { ttl: expirationDate })

// Records will be automatically removed after TTL expires
setTimeout(async () => {
  const record = await cache.load('temp-data')
  console.log('Record exists:', record !== null) // false
}, 61000)
```

### Shared Storage

```typescript
import { createStaticResource } from '@owlmeans/static-resource'

// Multiple resources sharing the same storage
const cacheA = createStaticResource('cache-a', 'shared-storage')
const cacheB = createStaticResource('cache-b', 'shared-storage')

// Record created in cacheA is accessible from cacheB
await cacheA.create({ id: 'shared-record', data: 'shared data' })
const record = await cacheB.load('shared-record')
console.log('Shared record:', record?.data) // 'shared data'
```

### Error Handling

```typescript
import { createStaticResource } from '@owlmeans/static-resource'
import { UnknownRecordError, RecordExists } from '@owlmeans/resource'

const resource = createStaticResource('error-demo')

try {
  // This will throw UnknownRecordError
  await resource.get('non-existent-id')
} catch (error) {
  if (error instanceof UnknownRecordError) {
    console.log('Record not found:', error.message)
  }
}

try {
  await resource.create({ id: 'user-1', name: 'Alice' })
  // This will throw RecordExists
  await resource.create({ id: 'user-1', name: 'Bob' })
} catch (error) {
  if (error instanceof RecordExists) {
    console.log('Record already exists:', error.message)
  }
}
```

## Error Handling

The package uses standard error types from `@owlmeans/resource`:

- **`UnknownRecordError`** - Thrown when trying to access a non-existent record
- **`RecordExists`** - Thrown when trying to create a record with an existing ID
- **`MisshapedRecord`** - Thrown when record structure is invalid (missing ID)
- **`UnsupportedArgumentError`** - Thrown when unsupported arguments are provided
- **`UnsupportedMethodError`** - Thrown when calling unsupported methods

## Integration with OwlMeans Common

This package follows the OwlMeans Common library structure:
- **types**: TypeScript interfaces and type definitions
- **consts**: Static values and constants
- **resource**: Resource implementation and factory functions

The static resource integrates seamlessly with other OwlMeans packages:
- Uses `@owlmeans/context` for dependency injection
- Implements `@owlmeans/resource` interface for consistency
- Supports `@owlmeans/error` error types

## Best Practices

1. **Use for temporary data** - Static resources are perfect for caching, sessions, or test data
2. **Implement TTL for cleanup** - Always set TTL for records that should expire automatically
3. **Share storage carefully** - Use the same key only when you want resources to share data
4. **Handle errors gracefully** - Always catch and handle resource-specific errors
5. **Integrate with context** - Use `appendStaticResource` for proper context integration
6. **Test scenarios** - Perfect for unit tests where you don't want persistent storage

## Dependencies

This package depends on:
- `@owlmeans/context` - For contextual resource management
- `@owlmeans/resource` - For resource interface and error types
- `@owlmeans/error` - For error handling infrastructure