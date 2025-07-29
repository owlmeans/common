# @owlmeans/resource

A comprehensive data persistence and resource management library for OwlMeans Common applications. This package provides abstract interfaces and implementations for handling database operations, resource management, and data access patterns across different storage backends.

## Overview

The `@owlmeans/resource` package is a foundational data access library in the OwlMeans Common ecosystem that provides:

- **Database Abstraction**: Generic interfaces for different database backends
- **CRUD Operations**: Complete Create, Read, Update, Delete functionality
- **Resource Management**: Advanced resource lifecycle management
- **Query System**: Flexible query and filtering capabilities
- **Pagination Support**: Built-in pagination and sorting functionality
- **Validation Integration**: Schema validation with JSON Schema support
- **Caching & TTL**: Time-to-live and caching mechanisms
- **Multi-Database Support**: Handle multiple database configurations

## Installation

```bash
npm install @owlmeans/resource
```

## Core Concepts

### Resource Interface

The `Resource<T>` interface provides the primary data access API for working with records that extend `ResourceRecord`.

### Database Service

The `ResourceDbService` interface provides an abstraction for database-specific implementations, allowing different storage backends (MongoDB, Redis, etc.) to be used interchangeably.

### Resource Records

All data entities extend `ResourceRecord`, which provides a basic structure with an optional `id` field.

### List Operations

Advanced listing functionality with criteria-based filtering, pagination, and sorting capabilities.

## API Reference

### Types

#### `Resource<T extends ResourceRecord>`
Primary interface for resource operations.

```typescript
interface Resource<T extends ResourceRecord> extends BasicResource {
  get: <Type extends T>(id: string, field?: Getter, opts?: LifecycleOptions) => Promise<Type>
  load: <Type extends T>(id: string, field?: Getter, opts?: LifecycleOptions) => Promise<Type | null>
  list: <Type extends T>(criteria?: ListOptions | ListCriteria, opts?: ListOptions) => Promise<ListResult<Type>>
  save: <Type extends T>(record: Partial<Type>, opts?: Getter) => Promise<Type>
  create: <Type extends T>(record: Partial<Type>, opts?: LifecycleOptions) => Promise<Type>
  update: <Type extends T>(record: Partial<Type>, opts?: Getter) => Promise<Type>
  delete: <Type extends T>(id: string | T, opts?: Getter) => Promise<Type | null>
  pick: <Type extends T>(id: string | T, opts?: Getter) => Promise<Type>
}
```

#### `ResourceRecord`
Base interface for all resource entities.

```typescript
interface ResourceRecord {
  id?: string
}
```

#### `ListOptions`
Configuration for list operations.

```typescript
interface ListOptions {
  pager?: ListPager
  criteria?: ListCriteria
}
```

#### `ListPager`
Pagination and sorting configuration.

```typescript
interface ListPager {
  sort?: ListSort[]
  page?: number
  size?: number
  total?: number
}
```

#### `ListResult<T>`
Result structure for list operations.

```typescript
interface ListResult<T extends ResourceRecord> {
  items: T[]
  pager?: ListPager
}
```

#### `DbConfig`
Database configuration structure.

```typescript
interface DbConfig<P extends {} = {}> {
  service: string
  alias?: string
  host: string | string[]
  port?: number
  user?: string
  secret?: string
  schema?: string
  resourcePrefix?: string
  entitySensitive?: boolean
  serviceSensitive?: boolean
  encryptionKey?: string
  meta?: P
}
```

### Factory Functions

#### `createDbService<Db, Client, Service>(alias: string, override: Partial<Service>, init?: InitMethod<Service>): Service`
Creates a database service with the specified configuration.

**Parameters:**
- `alias`: Service alias for registration
- `override`: Partial service implementation
- `init`: Optional initialization method

**Returns:** Configured database service

### Helper Functions

#### `createListSchema<T>(schema: JSONSchemaType<T>): JSONSchemaType<ListResult<T>>`
Creates a JSON Schema for list results based on a record schema.

#### `prepareListOptions(defPageSize?: number, criteria?: ListOptions | ListCriteria, opts?: ListOptions): ListOptions`
Prepares and normalizes list options with default pagination.

#### `filterObject<T>(obj: T, keep?: string[]): T`
Filters an object, removing null/undefined values except for specified keys.

### CRUD Operations

#### `get(id: string, field?: Getter, opts?: LifecycleOptions): Promise<T>`
Retrieves a record by ID. Throws `UnknownRecordError` if not found.

#### `load(id: string, field?: Getter, opts?: LifecycleOptions): Promise<T | null>`
Loads a record by ID. Returns `null` if not found.

#### `save(record: Partial<T>, opts?: Getter): Promise<T>`
Saves a record (creates if new, updates if exists).

#### `create(record: Partial<T>, opts?: LifecycleOptions): Promise<T>`
Creates a new record. Throws `RecordExists` if record already exists.

#### `update(record: Partial<T>, opts?: Getter): Promise<T>`
Updates an existing record. Throws `UnknownRecordError` if not found.

#### `delete(id: string | T, opts?: Getter): Promise<T | null>`
Deletes a record by ID or record object.

#### `pick(id: string | T, opts?: Getter): Promise<T>`
Retrieves a record, throwing `UnknownRecordError` if not found.

#### `list(criteria?: ListOptions | ListCriteria, opts?: ListOptions): Promise<ListResult<T>>`
Lists records with optional filtering, pagination, and sorting.

### Error Types

The package provides a comprehensive error hierarchy for resource operations:

#### `ResourceError`
Base error class for all resource-related errors.

#### `UnknownRecordError`
Error thrown when a requested record is not found.

```typescript
class UnknownRecordError extends ResourceError {
  constructor(id: string)
  get id(): string  // Extract the record ID from the error
}
```

#### `MisshapedRecord`
Error for malformed or invalid record data.

#### `RecordExists`
Error thrown when attempting to create a record that already exists.

#### `RecordUpdateFailed`
Error for failed update operations.

#### `UnsupportedArgumentError`
Error for unsupported method arguments.

#### `UnsupportedMethodError`
Error for unsupported operations.

## Usage Examples

### Basic Resource Operations

```typescript
interface User extends ResourceRecord {
  id?: string
  name: string
  email: string
  createdAt?: Date
}

// Create a new user
const newUser: User = await userResource.create({
  name: 'John Doe',
  email: 'john@example.com'
})

// Get a user by ID
const user = await userResource.get('user123')

// Update a user
const updatedUser = await userResource.update({
  id: 'user123',
  name: 'John Smith'
})

// Delete a user
await userResource.delete('user123')
```

### List Operations with Pagination

```typescript
// Basic list
const users = await userResource.list()

// List with pagination
const pagedUsers = await userResource.list({
  pager: {
    page: 0,
    size: 10,
    sort: [['name', true], 'createdAt']  // Sort by name asc, then createdAt
  }
})

// List with criteria
const filteredUsers = await userResource.list({
  criteria: {
    status: 'active',
    role: ['admin', 'moderator']
  },
  pager: { size: 20 }
})
```

### Error Handling

```typescript
import { UnknownRecordError, RecordExists } from '@owlmeans/resource'

try {
  const user = await userResource.get('nonexistent')
} catch (error) {
  if (error instanceof UnknownRecordError) {
    console.log(`User not found: ${error.id}`)
  }
}

try {
  await userResource.create({ id: 'existing', name: 'Test' })
} catch (error) {
  if (error instanceof RecordExists) {
    console.log('User already exists')
  }
}
```

### Database Configuration

```typescript
import { createBasicContext } from '@owlmeans/context'

const context = createBasicContext({
  dbs: [
    {
      service: 'mongo-db',
      alias: 'primary',
      host: 'localhost',
      port: 27017,
      schema: 'myapp',
      user: 'dbuser',
      secret: 'dbpass',
      resourcePrefix: 'app_',
      entitySensitive: true
    },
    {
      service: 'redis-db',
      alias: 'cache',
      host: 'localhost',
      port: 6379
    }
  ]
})
```

### Custom Resource Implementation

```typescript
import { Resource, ResourceRecord } from '@owlmeans/resource'

interface Product extends ResourceRecord {
  name: string
  price: number
  category: string
}

class ProductResource implements Resource<Product> {
  // Implement all required methods
  async get(id: string): Promise<Product> {
    // Custom implementation
  }
  
  async list(criteria?: ListOptions): Promise<ListResult<Product>> {
    // Custom implementation with business logic
  }
  
  // ... other methods
}
```

### TTL and Caching

```typescript
// Load with TTL
const user = await userResource.load('user123', {
  ttl: 300  // Cache for 5 minutes
})

// Load with expiration date
const user = await userResource.load('user123', {
  ttl: new Date(Date.now() + 300000)  // Expire in 5 minutes
})
```

## Advanced Features

### Multi-Database Support

The package supports multiple database configurations within a single application:

```typescript
// Different databases for different resource types
const userResource = makeUserResource('primary-db')
const cacheResource = makeCacheResource('redis-db')
const analyticsResource = makeAnalyticsResource('analytics-db')
```

### Schema Validation

Integration with JSON Schema for record validation:

```typescript
import { createListSchema } from '@owlmeans/resource'

const userSchema: JSONSchemaType<User> = {
  type: 'object',
  properties: {
    id: { type: 'string', nullable: true },
    name: { type: 'string' },
    email: { type: 'string', format: 'email' }
  },
  required: ['name', 'email'],
  additionalProperties: false
}

const userListSchema = createListSchema(userSchema)
```

### Resource Locking

Support for record locking mechanisms:

```typescript
interface ResourceLocker<T extends ResourceRecord> {
  lock: (record: Partial<T>, fields?: string[]) => Promise<T>
  unlock: (record: Partial<T>, fields?: string[]) => Promise<T>
}
```

## Integration with OwlMeans Ecosystem

The `@owlmeans/resource` package integrates with:

- **@owlmeans/context**: Service registration and configuration management
- **@owlmeans/error**: Resilient error handling system
- **@owlmeans/mongo-resource**: MongoDB-specific implementation
- **@owlmeans/redis-resource**: Redis-specific implementation
- **@owlmeans/client-resource**: Client-side resource management
- **@owlmeans/static-resource**: Static file resource management

## Performance Considerations

- Use `load()` instead of `get()` when records might not exist
- Implement appropriate pagination for large datasets
- Use TTL for frequently accessed but rarely changed data
- Consider database-specific optimizations for complex queries
- Implement proper indexing strategies for list criteria

## Security Features

- Entity-sensitive configurations for multi-tenant applications
- Service-sensitive configurations for microservice architectures
- Encryption key support for sensitive data
- Input validation through schema integration

Fixes #32.