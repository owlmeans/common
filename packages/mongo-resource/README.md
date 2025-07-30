# @owlmeans/mongo-resource

MongoDB resource implementation for OwlMeans Common applications. This package provides a complete MongoDB integration for the OwlMeans resource system, offering document storage, querying, indexing, and schema validation with the familiar OwlMeans resource interface.

## Overview

The `@owlmeans/mongo-resource` package extends the base `@owlmeans/resource` system with MongoDB-specific functionality. It provides:

- **MongoDB Resource Implementation**: Complete resource interface backed by MongoDB collections
- **Document Management**: Full CRUD operations with MongoDB ObjectId handling
- **Schema Integration**: AJV schema validation with MongoDB document structure
- **Index Management**: Automated index creation and management
- **Query Support**: MongoDB query capabilities with pagination and sorting
- **Locking Mechanisms**: Document-level locking for concurrent access control
- **Collection Lifecycle**: Automated collection and index initialization
- **Type Safety**: Full TypeScript support with MongoDB-specific types

This package is part of the OwlMeans database integration ecosystem, providing MongoDB as a storage backend for resources.

## Installation

```bash
npm install @owlmeans/mongo-resource mongodb ajv
```

## Dependencies

This package requires:
- `@owlmeans/resource`: Core resource system
- `@owlmeans/server-context`: Server context management
- `mongodb`: MongoDB Node.js driver (peer dependency)
- `ajv`: JSON Schema validation (peer dependency)

## Core Concepts

### MongoDB Resource

A MongoDB resource wraps a MongoDB collection with the OwlMeans resource interface, providing seamless integration between MongoDB documents and the resource system.

### ObjectId Handling

The package automatically converts MongoDB ObjectIds to string IDs in the resource interface while maintaining MongoDB-native ObjectId usage internally.

### Schema Validation

JSON Schema validation is applied to documents before storage, ensuring data integrity and consistency.

### Collection Management

Collections are automatically created and configured with indexes during resource initialization.

## API Reference

### Types

#### `MongoResource<T extends ResourceRecord>`

Main MongoDB resource interface that extends the base Resource interface with MongoDB-specific capabilities.

```typescript
interface MongoResource<T extends ResourceRecord> extends Resource<T>, ResourceLocker<T> {
  name?: string                                    // Collection name override
  schema?: AnySchema                              // AJV schema for validation
  indexes?: Array<IndexDefinition>               // Index definitions
  collection: Collection                          // MongoDB collection instance
  db(): Promise<Db>                              // Get database instance
  client(): Promise<MongoClient>                 // Get MongoDB client
  index<Type extends MongoResource<T>>(          // Add index definition
    name: string, 
    index: IndexSpecification, 
    options?: CreateIndexesOptions
  ): Type
  getDefaults(): Partial<T>                      // Get default values from schema
}
```

#### `MongoDbService`

Database service interface for MongoDB operations and connection management.

```typescript
interface MongoDbService extends ResourceDbService<Db, MongoClient>, DbLocker<ResourceRecord> {
  // Inherits database service methods and locking capabilities
}
```

#### `IndexDefinition`

Type for defining MongoDB indexes.

```typescript
interface IndexDefinition {
  name: string                        // Index name
  index: IndexSpecification          // MongoDB index specification
  options?: CreateIndexesOptions     // Index creation options
}
```

### Factory Functions

#### `makeMongoResource<R extends ResourceRecord, T extends MongoResource<R>>(alias: string, dbAlias?: string, serviceAlias?: string, makeCustomResource?: ResourceMaker<R, T>): T`

Creates a MongoDB resource instance with full CRUD capabilities.

**Parameters:**
- `alias`: Resource alias for registration
- `dbAlias`: Database alias (default: 'mongo')
- `serviceAlias`: Service alias (default: same as dbAlias)
- `makeCustomResource`: Optional custom resource factory

**Returns:** MongoResource instance

**Example:**
```typescript
import { makeMongoResource } from '@owlmeans/mongo-resource'

interface User extends ResourceRecord {
  id?: string
  name: string
  email: string
  createdAt?: Date
}

const userResource = makeMongoResource<User>('users')

// With custom collection and service
const customResource = makeMongoResource<User>('users', 'primary-db', 'mongo-service')
```

### MongoDB Resource Methods

#### `get(id: string, field?: string, opts?: LifecycleOptions): Promise<T>`

Retrieves a document by ID or specified field. Throws `UnknownRecordError` if not found.

**Parameters:**
- `id`: Document identifier
- `field`: Field to search by (default: '_id')
- `opts`: Lifecycle options

**Returns:** Promise resolving to the document

**Example:**
```typescript
// Get by MongoDB ObjectId (converted from string)
const user = await userResource.get('507f1f77bcf86cd799439011')

// Get by custom field
const userByEmail = await userResource.get('user@example.com', 'email')
```

#### `load(id: string, field?: string, opts?: LifecycleOptions): Promise<T | null>`

Loads a document by ID or specified field. Returns `null` if not found.

**Example:**
```typescript
const user = await userResource.load('507f1f77bcf86cd799439011')
if (user) {
  console.log('User found:', user.name)
} else {
  console.log('User not found')
}
```

#### `create(record: Partial<T>, opts?: LifecycleOptions): Promise<T>`

Creates a new document. Automatically applies schema defaults and generates ObjectId.

**Parameters:**
- `record`: Document data (id will be generated)
- `opts`: Lifecycle options

**Returns:** Promise resolving to the created document

**Throws:** `RecordExists` if record already has an ID

**Example:**
```typescript
const newUser = await userResource.create({
  name: 'John Doe',
  email: 'john@example.com'
})

console.log('Created user with ID:', newUser.id)
```

#### `save(record: Partial<T>, opts?: Getter): Promise<T>`

Saves a document (creates if new, updates if exists).

**Example:**
```typescript
// Create new user (no id)
const user1 = await userResource.save({
  name: 'Jane Doe',
  email: 'jane@example.com'
})

// Update existing user (with id)
const user2 = await userResource.save({
  id: user1.id,
  name: 'Jane Smith'
})
```

#### `update(record: Partial<T>, opts?: Getter): Promise<T>`

Updates an existing document. Throws `UnknownRecordError` if not found.

**Example:**
```typescript
const updatedUser = await userResource.update({
  id: '507f1f77bcf86cd799439011',
  name: 'Updated Name'
})
```

#### `delete(id: string | T, opts?: Getter): Promise<T | null>`

Deletes a document by ID or document object.

**Parameters:**
- `id`: Document ID or document object
- `opts`: Additional options or field name

**Returns:** Promise resolving to deleted document or null

**Example:**
```typescript
// Delete by ID
const deleted = await userResource.delete('507f1f77bcf86cd799439011')

// Delete by document
const deleted2 = await userResource.delete(userObject)

// Delete by custom field
const deleted3 = await userResource.delete('user@example.com', 'email')
```

#### `pick(id: string | T, opts?: Getter): Promise<T>`

Deletes and returns a document. Throws `UnknownRecordError` if not found.

**Example:**
```typescript
try {
  const removedUser = await userResource.pick('507f1f77bcf86cd799439011')
  console.log('Removed user:', removedUser.name)
} catch (error) {
  console.error('User not found for removal')
}
```

#### `list(criteria?: ListOptions | ListCriteria, opts?: ListOptions): Promise<ListResult<T>>`

Lists documents with optional filtering, pagination, and sorting.

**Parameters:**
- `criteria`: MongoDB query criteria or list options
- `opts`: Additional list options

**Returns:** Promise resolving to paginated results

**Example:**
```typescript
// List all users with pagination
const result = await userResource.list({
  pager: { page: 0, size: 10 }
})

// List with MongoDB query
const activeUsers = await userResource.list({
  criteria: { status: 'active' },
  pager: { page: 0, size: 20, sort: [['createdAt', false]] }
})

console.log(`Found ${result.pager?.total} users`)
result.items.forEach(user => console.log(user.name))
```

### Database Access Methods

#### `db(): Promise<Db>`

Gets the MongoDB database instance.

**Example:**
```typescript
const db = await userResource.db()
const stats = await db.stats()
console.log('Database stats:', stats)
```

#### `client(): Promise<MongoClient>`

Gets the MongoDB client instance.

**Example:**
```typescript
const client = await userResource.client()
const admin = client.db().admin()
const serverStatus = await admin.serverStatus()
```

### Index Management

#### `index<Type>(name: string, index: IndexSpecification, options?: CreateIndexesOptions): Type`

Adds an index definition to the resource. Indexes are created during resource initialization.

**Parameters:**
- `name`: Index name
- `index`: MongoDB index specification
- `options`: Index creation options

**Returns:** Resource instance for method chaining

**Example:**
```typescript
// Single field index
userResource.index('email-unique', { email: 1 }, { unique: true })

// Compound index
userResource.index('name-email', { name: 1, email: 1 })

// Text index
userResource.index('text-search', { name: 'text', email: 'text' })

// TTL index
userResource.index('expire-sessions', { createdAt: 1 }, { expireAfterSeconds: 3600 })
```

### Schema and Defaults

#### `getDefaults(): Partial<T>`

Gets default values from the AJV schema.

**Example:**
```typescript
// Assuming schema has default values
const defaults = userResource.getDefaults()
console.log('Default values:', defaults)

// Defaults are automatically applied during create()
```

### Locking Methods

#### `lock(record: Partial<T>, fields?: string[]): Promise<T>`

Locks specified fields of a document for concurrent access control.

**Parameters:**
- `record`: Document to lock
- `fields`: Fields to lock (default: secure fields from schema)

**Returns:** Promise resolving to locked document

#### `unlock(record: Partial<T>, fields?: string[]): Promise<T>`

Unlocks specified fields of a document.

**Parameters:**
- `record`: Document to unlock
- `fields`: Fields to unlock (default: secure fields from schema)

**Returns:** Promise resolving to unlocked document

**Example:**
```typescript
// Lock user for critical update
const lockedUser = await userResource.lock({ id: userId }, ['balance'])

try {
  // Perform critical operations
  await updateUserBalance(lockedUser)
} finally {
  // Always unlock
  await userResource.unlock({ id: userId }, ['balance'])
}
```

### Helper Functions

#### `getSchemaSecureFeilds(schema: AnySchema): string[]`

Extracts fields marked as secure in the AJV schema.

**Parameters:**
- `schema`: AJV schema object

**Returns:** Array of secure field names

**Example:**
```typescript
import { getSchemaSecureFeilds } from '@owlmeans/mongo-resource'

const schema = {
  type: 'object',
  properties: {
    password: { type: 'string', secure: true },
    balance: { type: 'number', secure: true },
    name: { type: 'string' }
  }
}

const secureFields = getSchemaSecureFeilds(schema)
// ['password', 'balance']
```

### Constants

```typescript
const DEFAULT_DB_ALIAS = 'mongo'     // Default database alias
const DEFAULT_PAGE_SIZE = 10         // Default pagination size
```

## Usage Examples

### Basic Resource Setup

```typescript
import { makeMongoResource } from '@owlmeans/mongo-resource'
import { makeServerContext } from '@owlmeans/server-context'

// Define document interface
interface Product extends ResourceRecord {
  id?: string
  name: string
  price: number
  category: string
  inStock: boolean
  createdAt?: Date
}

// Create context with MongoDB configuration
const context = makeServerContext({
  service: 'product-service',
  dbs: [{
    service: 'mongo',
    alias: 'primary',
    host: 'localhost',
    port: 27017,
    schema: 'products_db'
  }]
})

// Create and configure resource
const productResource = makeMongoResource<Product>('products', 'primary')

// Add indexes
productResource
  .index('category-price', { category: 1, price: -1 })
  .index('name-text', { name: 'text' })
  .index('inStock', { inStock: 1 })

// Register resource with context
context.registerResource(productResource)

// Initialize context
await context.configure().init()
```

### CRUD Operations

```typescript
// Create product
const newProduct = await productResource.create({
  name: 'Gaming Laptop',
  price: 1299.99,
  category: 'electronics',
  inStock: true
})

// Get product
const product = await productResource.get(newProduct.id!)

// Update product
const updatedProduct = await productResource.update({
  id: product.id,
  price: 1199.99
})

// List products with filtering
const electronicsResult = await productResource.list({
  criteria: { category: 'electronics', inStock: true },
  pager: { 
    page: 0, 
    size: 20,
    sort: [['price', true]] // Sort by price descending
  }
})

// Delete product
await productResource.delete(product.id!)
```

### Schema Validation Integration

```typescript
import Ajv, { JSONSchemaType } from 'ajv'

// Define schema with validation and defaults
const productSchema: JSONSchemaType<Product> = {
  type: 'object',
  properties: {
    id: { type: 'string', nullable: true },
    name: { type: 'string', minLength: 1, maxLength: 100 },
    price: { type: 'number', minimum: 0 },
    category: { type: 'string', enum: ['electronics', 'clothing', 'books'] },
    inStock: { type: 'boolean', default: true },
    createdAt: { type: 'string', format: 'date-time', nullable: true }
  },
  required: ['name', 'price', 'category'],
  additionalProperties: false
}

// Create resource with schema
const productResource = makeMongoResource<Product>('products')
productResource.schema = productSchema

// Now all operations will validate against schema
try {
  await productResource.create({
    name: '', // Will fail validation (minLength: 1)
    price: -10, // Will fail validation (minimum: 0)
    category: 'invalid' // Will fail validation (not in enum)
  })
} catch (error) {
  console.error('Validation failed:', error)
}
```

### Advanced Querying

```typescript
// Complex MongoDB queries
const advancedResults = await productResource.list({
  criteria: {
    $and: [
      { price: { $gte: 100, $lte: 1000 } },
      { category: { $in: ['electronics', 'books'] } },
      { inStock: true }
    ]
  },
  pager: {
    page: 0,
    size: 15,
    sort: [['createdAt', false], ['price', true]]
  }
})

// Text search (requires text index)
const searchResults = await productResource.list({
  criteria: { $text: { $search: 'gaming laptop' } }
})

// Aggregation via direct database access
const db = await productResource.db()
const categoryStats = await db.collection('products').aggregate([
  { $group: { _id: '$category', count: { $sum: 1 }, avgPrice: { $avg: '$price' } } }
]).toArray()
```

### Index Management

```typescript
// Add various types of indexes
productResource
  // Unique index
  .index('sku-unique', { sku: 1 }, { unique: true })
  
  // Compound index for common queries
  .index('category-instock-price', { 
    category: 1, 
    inStock: 1, 
    price: -1 
  })
  
  // Text search index
  .index('search', { 
    name: 'text', 
    description: 'text' 
  }, { 
    weights: { name: 10, description: 5 } 
  })
  
  // TTL index for temporary records
  .index('temp-expire', { 
    createdAt: 1 
  }, { 
    expireAfterSeconds: 86400 // 24 hours
  })
  
  // Partial index
  .index('active-products', { 
    category: 1, 
    price: 1 
  }, { 
    partialFilterExpression: { inStock: true } 
  })

// Indexes are automatically created during resource initialization
```

### Document Locking

```typescript
// Schema with secure fields
const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', nullable: true },
    username: { type: 'string' },
    balance: { type: 'number', secure: true }, // Secure field
    password: { type: 'string', secure: true } // Secure field
  },
  required: ['username']
}

const userResource = makeMongoResource<User>('users')
userResource.schema = userSchema

// Lock user for balance update
const userId = 'user123'
const lockedUser = await userResource.lock({ id: userId })

try {
  // Perform balance update
  const user = await userResource.get(userId)
  await userResource.update({
    id: userId,
    balance: user.balance + 100
  })
} finally {
  // Always unlock
  await userResource.unlock({ id: userId })
}
```

### Multiple Database Support

```typescript
// Configure multiple MongoDB databases
const context = makeServerContext({
  dbs: [
    {
      service: 'mongo',
      alias: 'primary',
      host: 'primary-mongo.example.com',
      schema: 'main_db'
    },
    {
      service: 'mongo', 
      alias: 'analytics',
      host: 'analytics-mongo.example.com',
      schema: 'analytics_db'
    }
  ]
})

// Create resources for different databases
const userResource = makeMongoResource<User>('users', 'primary')
const analyticsResource = makeMongoResource<AnalyticsRecord>('events', 'analytics')

// Both resources work independently with their respective databases
```

### Error Handling

```typescript
import { 
  UnknownRecordError, 
  RecordExists, 
  RecordUpdateFailed,
  MisshapedRecord 
} from '@owlmeans/resource'

try {
  // Various operations that can fail
  const user = await userResource.get('nonexistent-id')
} catch (error) {
  if (error instanceof UnknownRecordError) {
    console.error('User not found:', error.id)
  }
}

try {
  await userResource.create({ id: 'existing-id', name: 'Test' })
} catch (error) {
  if (error instanceof RecordExists) {
    console.error('User already exists')
  }
}
```

## Advanced Features

### Custom Collection Names

```typescript
// Override collection name
const customResource = makeMongoResource<User>('users')
customResource.name = 'custom_users_collection'
```

### Direct MongoDB Operations

```typescript
// Access MongoDB collection directly for advanced operations
const collection = userResource.collection

// Use MongoDB-specific features
const bulkOps = collection.initializeUnorderedBulkOp()
bulkOps.insert({ name: 'User 1' })
bulkOps.insert({ name: 'User 2' })
await bulkOps.execute()

// Aggregation pipelines
const pipeline = [
  { $match: { active: true } },
  { $group: { _id: '$department', count: { $sum: 1 } } }
]
const results = await collection.aggregate(pipeline).toArray()
```

### Schema Defaults Integration

```typescript
const schemaWithDefaults = {
  type: 'object',
  properties: {
    status: { type: 'string', default: 'active' },
    createdAt: { type: 'string', format: 'date-time', default: new Date().toISOString() },
    settings: { 
      type: 'object', 
      default: { theme: 'light', notifications: true }
    }
  }
}

const resource = makeMongoResource<MyRecord>('records')
resource.schema = schemaWithDefaults

// Defaults are automatically applied during creation
const record = await resource.create({ name: 'Test' })
// record.status === 'active'
// record.settings === { theme: 'light', notifications: true }
```

## Performance Considerations

- **Indexing**: Create appropriate indexes for your query patterns
- **Pagination**: Use pagination for large result sets
- **Connection Pooling**: MongoDB driver handles connection pooling automatically
- **Schema Validation**: Validation happens before database operations
- **Document Size**: MongoDB has a 16MB document size limit
- **Query Optimization**: Use MongoDB explain() to optimize queries

## Best Practices

1. **Index Strategy**: Create indexes that match your query patterns
2. **Schema Design**: Design schemas that reflect your document structure
3. **Error Handling**: Handle MongoDB-specific errors appropriately
4. **Resource Cleanup**: Properly close MongoDB connections
5. **Security**: Use secure fields for sensitive data that requires locking
6. **Validation**: Always use schema validation for data integrity
7. **Pagination**: Implement pagination for list operations

## Integration with OwlMeans Ecosystem

### Server Context Integration

```typescript
import { makeServerContext } from '@owlmeans/server-context'

// MongoDB resources integrate seamlessly with server context
const context = makeServerContext(config)
context.registerResource(mongoResource)
```

### Service Integration

```typescript
import { createDbService } from '@owlmeans/resource'

// MongoDB service provides database access
const mongoService = createDbService('mongo', mongoConfig)
context.registerService(mongoService)
```

### Authentication Integration

```typescript
// MongoDB resources work with authentication scopes
const authenticatedResource = makeMongoResource<ProtectedRecord>('protected')
// Access control is handled at the application level
```

## Related Packages

- [`@owlmeans/resource`](../resource) - Core resource system
- [`@owlmeans/server-context`](../server-context) - Server context management
- [`@owlmeans/redis-resource`](../redis-resource) - Redis resource implementation
- [`@owlmeans/static-resource`](../static-resource) - Static file resources