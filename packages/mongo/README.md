# @owlmeans/mongo

MongoDB service integration for OwlMeans Common server applications. This package provides a server-side MongoDB service implementation with clustering support, field-level encryption, and connection management designed for secure, multi-layer applications.

## Overview

The `@owlmeans/mongo` package extends the OwlMeans resource system to provide MongoDB-specific functionality including:

- **MongoDB Service Integration**: Factory functions for creating MongoDB services with connection management
- **Field-Level Encryption**: Built-in encryption/decryption for sensitive database fields using OwlMeans cryptographic keys
- **Cluster Support**: Automatic cluster setup and replica set configuration
- **Multi-Layer Support**: Integration with OwlMeans context layer system for proper data isolation
- **Connection Pooling**: Efficient MongoDB connection management with proper cleanup

This package follows the OwlMeans "quadra" pattern as a server-side implementation complementing the basic `@owlmeans/mongo-resource` package.

## Installation

```bash
npm install @owlmeans/mongo
```

## Dependencies

This package requires MongoDB driver and integrates with:
- `@owlmeans/mongo-resource`: Base MongoDB resource definitions
- `@owlmeans/server-context`: Server context management
- `@owlmeans/basic-keys`: Cryptographic operations for field encryption
- `mongodb`: Official MongoDB Node.js driver

## Core Concepts

### MongoDB Service

The MongoDB service provides database connection management and extends the base database service with MongoDB-specific functionality like field encryption and cluster support.

### Field Encryption

Built-in support for encrypting/decrypting specific database fields using OwlMeans cryptographic keys, providing application-level encryption for sensitive data.

### Layer Integration

Supports multi-layer data isolation through the OwlMeans context layer system, allowing service-specific and entity-specific database configurations.

## API Reference

### Types

#### `MongoMeta`
Metadata interface for MongoDB-specific configuration.

```typescript
interface MongoMeta {
  replicaSet?: string  // Replica set name for clustering
}
```

### Factory Functions

#### `makeMongoDbService(alias?: string): MongoDbService`

Creates a MongoDB service instance with connection management and encryption capabilities.

**Parameters:**
- `alias` (optional): Service alias (default: `DEFAULT_ALIAS`)

**Returns:** `MongoDbService` instance

**Methods:**
- **`db(configAlias?: string): Promise<Db>`**: Gets MongoDB database instance for the configuration
- **`initialize(configAlias?: string): Promise<void>`**: Initializes MongoDB connection with cluster setup
- **`lock(alias: string, record: object, fields: string[]): Promise<object>`**: Encrypts specified fields in a record
- **`unlock(alias: string, record: object, fields: string[]): Promise<object>`**: Decrypts specified fields in a record
- **`reinitializeContext<T>(context: BasicContext<ServerConfig>): T`**: Reinitializes service with new context

**Example:**
```typescript
import { makeMongoDbService } from '@owlmeans/mongo'

const mongoService = makeMongoDbService('main-db')

// Initialize with configuration
await mongoService.initialize('prod-config')

// Get database instance
const db = await mongoService.db('prod-config')

// Use database
const collection = db.collection('users')
const users = await collection.find().toArray()
```

#### `appendMongo<C, T>(context: T, alias?: string): T`

Convenience function to create and register a MongoDB service with a context.

**Parameters:**
- `context`: Server context instance
- `alias` (optional): Service alias (default: `DEFAULT_ALIAS`)

**Returns:** The context with MongoDB service registered

**Example:**
```typescript
import { appendMongo } from '@owlmeans/mongo'
import { makeServerContext } from '@owlmeans/server-context'

const context = makeServerContext(serverConfig)
const contextWithMongo = appendMongo(context, 'app-db')

await contextWithMongo.configure().init()

// Access MongoDB service
const mongoService = context.service('app-db')
```

### Field Encryption

The MongoDB service provides built-in field-level encryption for sensitive data:

#### `lock(alias: string, record: object, fields: string[]): Promise<object>`

Encrypts specified fields in a database record.

**Parameters:**
- `alias`: Configuration alias with encryption key
- `record`: Database record object
- `fields`: Array of field names to encrypt

**Returns:** Promise resolving to record with encrypted fields

**Throws:** 
- `SyntaxError` if no encryption key configured
- `SyntaxError` if no fields specified

**Example:**
```typescript
const sensitiveUser = {
  id: '123',
  name: 'John Doe',
  email: 'john@example.com',
  ssn: '123-45-6789',
  creditCard: '4111-1111-1111-1111'
}

// Encrypt sensitive fields before saving
const encryptedUser = await mongoService.lock('prod-config', sensitiveUser, ['ssn', 'creditCard'])

// Save to database with encrypted fields
await collection.insertOne(encryptedUser)
```

#### `unlock(alias: string, record: object, fields: string[]): Promise<object>`

Decrypts specified fields in a database record.

**Parameters:**
- `alias`: Configuration alias with encryption key
- `record`: Database record object with encrypted fields
- `fields`: Array of field names to decrypt

**Returns:** Promise resolving to record with decrypted fields

**Example:**
```typescript
// Retrieve from database
const encryptedUser = await collection.findOne({ id: '123' })

// Decrypt sensitive fields after retrieval
const decryptedUser = await mongoService.unlock('prod-config', encryptedUser, ['ssn', 'creditCard'])

console.log(decryptedUser.ssn) // '123-45-6789' (decrypted)
```

### Cluster Support

The service automatically handles MongoDB cluster setup and replica set configuration:

```typescript
// Configuration with cluster hosts
const config = {
  alias: 'cluster-config',
  host: ['mongo1.example.com', 'mongo2.example.com', 'mongo3.example.com'],
  port: 27017,
  database: 'app-db',
  replicaSet: 'rs-main'
}

// Service automatically detects cluster and sets up connections
await mongoService.initialize('cluster-config')
```

### Constants

#### `DEFAULT_ALIAS`
Default service alias for MongoDB services.

```typescript
const DEFAULT_ALIAS = DEFAULT_DB_ALIAS  // From @owlmeans/mongo-resource
```

#### `DEF_REPLSET`
Default replica set name for clustering.

```typescript
const DEF_REPLSET = 'rs-main'
```

## Usage Examples

### Basic MongoDB Service Setup

```typescript
import { makeMongoDbService } from '@owlmeans/mongo'
import { makeServerContext } from '@owlmeans/server-context'

// Create server context with MongoDB configuration
const context = makeServerContext({
  service: 'my-app',
  type: AppType.Backend,
  layer: Layer.Service,
  dbs: [{
    alias: 'main-db',
    service: 'mongo',
    host: 'localhost',
    port: 27017,
    database: 'myapp'
  }]
})

// Create and register MongoDB service
const mongoService = makeMongoDbService('mongo')
context.registerService(mongoService)

// Initialize context
await context.configure().init()

// Use MongoDB
const db = await mongoService.db('main-db')
const users = db.collection('users')
```

### Using appendMongo Helper

```typescript
import { appendMongo } from '@owlmeans/mongo'

const context = makeServerContext(config)
const contextWithMongo = appendMongo(context)

await contextWithMongo.configure().init()

const mongoService = context.service('mongo')
const db = await mongoService.db()
```

### Field Encryption in Practice

```typescript
// Configure encryption key in database config
const config = {
  alias: 'secure-db',
  service: 'mongo',
  host: 'localhost',
  database: 'secure-app',
  encryptionKey: 'xchacha:base64encryptionkey...'
}

const mongoService = makeMongoDbService()
await mongoService.initialize('secure-db')

// Encrypt before saving
const user = { name: 'Alice', ssn: '123-45-6789', balance: 1000 }
const encrypted = await mongoService.lock('secure-db', user, ['ssn', 'balance'])

const db = await mongoService.db('secure-db')
await db.collection('users').insertOne(encrypted)

// Decrypt after retrieval
const retrieved = await db.collection('users').findOne({ name: 'Alice' })
const decrypted = await mongoService.unlock('secure-db', retrieved, ['ssn', 'balance'])

console.log(decrypted.ssn) // '123-45-6789'
```

### Multi-Database Configuration

```typescript
const context = makeServerContext({
  service: 'multi-db-app',
  type: AppType.Backend,
  layer: Layer.Service,
  dbs: [
    {
      alias: 'user-db',
      service: 'mongo',
      host: 'users.db.example.com',
      database: 'users',
      encryptionKey: 'xchacha:userkey...'
    },
    {
      alias: 'analytics-db', 
      service: 'mongo',
      host: 'analytics.db.example.com',
      database: 'analytics'
    }
  ]
})

const mongoService = makeMongoDbService('mongo')
context.registerService(mongoService)

await context.configure().init()

// Use different databases
const userDb = await mongoService.db('user-db')
const analyticsDb = await mongoService.db('analytics-db')
```

### Cluster Configuration

```typescript
const clusterConfig = {
  service: 'cluster-app',
  type: AppType.Backend,
  layer: Layer.Service,
  dbs: [{
    alias: 'cluster-db',
    service: 'mongo',
    host: [
      'mongo1.cluster.example.com',
      'mongo2.cluster.example.com', 
      'mongo3.cluster.example.com'
    ],
    port: 27017,
    database: 'clustered-app',
    replicaSet: 'production-rs'
  }]
}

const context = makeServerContext(clusterConfig)
const mongoService = makeMongoDbService('mongo')
context.registerService(mongoService)

// Service automatically handles cluster setup
await context.configure().init()

const db = await mongoService.db('cluster-db')
```

### Service Reinitialization

```typescript
// Original context
const originalContext = makeServerContext(config)
const mongoService = makeMongoDbService()
originalContext.registerService(mongoService)

// Later, reinitialize with new context
const newContext = makeServerContext(newConfig)
const reinitializedService = mongoService.reinitializeContext(newContext)

// Service now uses new context configuration
await reinitializedService.initialize()
```

## Configuration

MongoDB service configuration is handled through the server context's database configuration:

```typescript
interface DatabaseConfig {
  alias: string                    // Configuration alias
  service: string                  // Service name ('mongo')
  host: string | string[]          // Database host(s)
  port?: number                    // Database port
  database: string                 // Database name
  username?: string                // Authentication username
  password?: string                // Authentication password
  encryptionKey?: string           // Field encryption key
  replicaSet?: string             // Replica set name
  serviceSensitive?: boolean       // Enable service-layer isolation
  entitySensitive?: boolean        // Enable entity-layer isolation
}
```

## Error Handling

The package provides descriptive error messages for common issues:

- **Missing encryption key**: Thrown when attempting encryption/decryption without configured key
- **No fields specified**: Thrown when lock/unlock called without fields
- **Client replacement**: Thrown when attempting to replace existing MongoDB client
- **Context assertion**: Thrown when service context is invalid

```typescript
try {
  await mongoService.lock('config-alias', record, ['field'])
} catch (error) {
  if (error.message.includes('No encryption key')) {
    // Handle missing encryption configuration
  }
}
```

## Security Considerations

### Field Encryption
- Use strong encryption keys for field-level encryption
- Rotate encryption keys regularly
- Store encryption keys securely outside the database

### Connection Security
- Use authentication credentials for production databases
- Configure TLS/SSL for database connections
- Restrict database access to necessary IP addresses

### Data Isolation
- Use layer-sensitive configurations for multi-tenant applications
- Separate database configurations by security level

## Performance Considerations

- **Connection Pooling**: MongoDB driver handles connection pooling automatically
- **Encryption Overhead**: Field encryption adds computational overhead
- **Cluster Latency**: Cluster setup may add initialization time
- **Memory Usage**: Multiple database connections increase memory usage

## Integration with OwlMeans Ecosystem

This package integrates with:

- **@owlmeans/mongo-resource**: Base MongoDB resource types and interfaces
- **@owlmeans/server-context**: Server context and configuration management
- **@owlmeans/basic-keys**: Cryptographic operations for field encryption
- **@owlmeans/resource**: Base resource service patterns

## Best Practices

1. **Use field encryption** for sensitive data like PII, financial information
2. **Configure replica sets** for production high-availability
3. **Separate database configurations** by environment and sensitivity level
4. **Handle encryption errors** gracefully with fallback mechanisms
5. **Monitor connection health** and implement proper cleanup

## Related Packages

- **@owlmeans/mongo-resource**: Base MongoDB resource definitions
- **@owlmeans/redis**: Redis service implementation
- **@owlmeans/server-context**: Server context management
- **@owlmeans/resource**: Base resource service patterns