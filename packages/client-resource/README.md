# @owlmeans/client-resource

Client-side resource management library for OwlMeans Common applications. This package provides a comprehensive data persistence and management system for React applications, with support for local database storage, CRUD operations, and seamless integration with the OwlMeans context system.

## Overview

The `@owlmeans/client-resource` package extends the base `@owlmeans/resource` package with client-specific functionality. It provides:

- **Local Database Integration**: Persistent data storage using client-side databases
- **CRUD Operations**: Complete Create, Read, Update, Delete functionality
- **Resource Management**: Structured data management with type safety
- **Context Integration**: Seamless integration with OwlMeans context system
- **List Management**: Efficient listing and pagination of records
- **Data Integrity**: Built-in validation and error handling
- **Storage Abstraction**: Database-agnostic storage interface

This package is part of the OwlMeans resource management ecosystem:
- **@owlmeans/resource**: Base resource interfaces and utilities
- **@owlmeans/client-resource**: Client-side resource implementation *(this package)*
- **@owlmeans/server-resource**: Server-side resource implementation

## Installation

```bash
npm install @owlmeans/client-resource
```

## Core Concepts

### Resources
Resources represent collections of data with consistent CRUD operations. Each resource is backed by a client-side database and provides type-safe access to stored records.

### Client Database Service
The underlying database service provides an abstraction over various client-side storage mechanisms (IndexedDB, localStorage, etc.).

### Record Management
All data is stored as records with unique identifiers, supporting both automatic ID generation and custom IDs.

## API Reference

### Factory Functions

#### `appendClientResource<C, T>(context: T, alias: string): T`

Appends a client resource to the application context with the specified alias.

```typescript
import { appendClientResource } from '@owlmeans/client-resource'
import { makeClientContext } from '@owlmeans/client-context'

const context = makeClientContext(config)
appendClientResource(context, 'users')

// Access the resource
const userResource = context.resource<ClientResource<UserRecord>>('users')
```

**Parameters:**
- `context`: T - The client context to append the resource to
- `alias`: string - Unique identifier for the resource

**Returns:** Enhanced context with the registered resource

### Core Interfaces

#### `ClientResource<T extends ResourceRecord>`

Main interface for client-side resource management with full CRUD capabilities.

```typescript
interface ClientResource<T extends ResourceRecord = ResourceRecord> extends Resource<T> {
  db?: ClientDb                    // Underlying database instance
  erase(): Promise<void>           // Completely erase all data
  
  // Inherited from Resource:
  get(id: string): Promise<T>                           // Get record (throws if not found)
  load(id: string): Promise<T | null>                   // Load record (returns null if not found)
  list(criteria?, opts?): Promise<ListResult<T>>        // List records with pagination
  create(record: Partial<T>): Promise<T>                // Create new record
  update(record: Partial<T> & { id: string }): Promise<T>  // Update existing record
  delete(id: string | T): Promise<T | null>             // Delete record
  pick(id: string | T): Promise<T>                      // Remove and return record
  save(record: Partial<T>): Promise<T>                  // Save (create or update)
}
```

#### `ClientDbService`

Service interface for managing client-side databases.

```typescript
interface ClientDbService extends InitializedService {
  initialize(alias?: string): Promise<ClientDb>         // Initialize database instance
  erase(): Promise<void>                                // Erase all databases
}
```

#### `ClientDb`

Low-level database interface for direct storage operations.

```typescript
interface ClientDb {
  get<T>(id: string): Promise<T>                        // Get value by ID
  set<T>(id: string, value: T): Promise<void>           // Set value by ID
  has(id: string): Promise<boolean>                     // Check if ID exists
  del(id: string): Promise<boolean>                     // Delete by ID
}
```

### Resource Methods Detailed Reference

#### Data Retrieval Methods

**`get(id: string): Promise<T>`**
- **Purpose**: Retrieves a record by ID, throwing an error if not found
- **Behavior**: Guaranteed to return a record or throw `UnknownRecordError`
- **Usage**: When you know the record should exist
- **Throws**: `UnknownRecordError` if record doesn't exist

```typescript
const userResource = context.resource<ClientResource<UserRecord>>('users')

try {
  const user = await userResource.get('user123')
  console.log('User found:', user.name)
} catch (error) {
  console.error('User not found:', error.message)
}
```

**`load(id: string): Promise<T | null>`**
- **Purpose**: Loads a record by ID, returning null if not found
- **Behavior**: Safe retrieval that never throws for missing records
- **Usage**: When you need to check if a record exists
- **Returns**: Record object or null

```typescript
const user = await userResource.load('user123')
if (user) {
  console.log('User exists:', user.name)
} else {
  console.log('User not found')
}
```

**`list(criteria?, opts?): Promise<ListResult<T>>`**
- **Purpose**: Lists records with optional filtering and pagination
- **Behavior**: Efficiently paginates through large datasets
- **Usage**: For displaying lists of data with optional filtering
- **Returns**: Object with `items` array and `pager` information

```typescript
// List all users
const allUsers = await userResource.list()

// List with pagination
const pagedUsers = await userResource.list({}, { 
  pager: { page: 0, size: 10 } 
})

// List with filtering
const activeUsers = await userResource.list({ 
  status: 'active' 
})

// Combined filtering and pagination
const result = await userResource.list(
  { role: 'admin' }, 
  { pager: { page: 1, size: 5 } }
)

console.log('Users:', result.items)
console.log('Total:', result.pager.total)
```

#### Data Modification Methods

**`create(record: Partial<T>): Promise<T>`**
- **Purpose**: Creates a new record with automatic ID generation
- **Behavior**: Generates unique ID if not provided, validates uniqueness
- **Usage**: For creating new records
- **Throws**: `RecordExists` if ID already exists
- **Returns**: Created record with generated/validated ID

```typescript
const newUser = await userResource.create({
  name: 'John Doe',
  email: 'john@example.com',
  role: 'user'
})
console.log('Created user with ID:', newUser.id)
```

**`update(record: Partial<T> & { id: string }): Promise<T>`**
- **Purpose**: Updates an existing record with partial data
- **Behavior**: Merges provided data with existing record
- **Usage**: For modifying existing records
- **Throws**: `UnknownRecordError` if record doesn't exist
- **Returns**: Updated record

```typescript
const updatedUser = await userResource.update({
  id: 'user123',
  name: 'Jane Doe',
  lastLogin: new Date()
})
```

**`save(record: Partial<T>): Promise<T>`**
- **Purpose**: Smart save that creates or updates based on existence
- **Behavior**: Creates if ID is missing or record doesn't exist, updates otherwise
- **Usage**: When you want create-or-update semantics
- **Returns**: Saved record

```typescript
// Will create if user doesn't exist
const user1 = await userResource.save({
  name: 'New User',
  email: 'new@example.com'
})

// Will update if user exists
const user2 = await userResource.save({
  id: 'existing-user',
  name: 'Updated Name'
})
```

**`delete(id: string | T): Promise<T | null>`**
- **Purpose**: Deletes a record by ID or record object
- **Behavior**: Removes record and updates internal lists
- **Usage**: For permanent record removal
- **Returns**: Deleted record or null if not found

```typescript
// Delete by ID
const deletedUser = await userResource.delete('user123')

// Delete by record
const userToDelete = await userResource.load('user456')
if (userToDelete) {
  await userResource.delete(userToDelete)
}
```

**`pick(id: string | T): Promise<T>`**
- **Purpose**: Removes and returns a record atomically
- **Behavior**: Combines delete operation with return of the deleted record
- **Usage**: When you need to extract a record from storage
- **Throws**: `UnknownRecordError` if record doesn't exist
- **Returns**: Picked record

```typescript
try {
  const pickedUser = await userResource.pick('user123')
  console.log('Picked user:', pickedUser.name)
  // User is now removed from storage
} catch (error) {
  console.error('User not found for picking')
}
```

**`erase(): Promise<void>`**
- **Purpose**: Completely erases all data in the resource
- **Behavior**: Removes all records and resets the resource to empty state
- **Usage**: For data cleanup or reset operations
- **Warning**: This operation is irreversible

```typescript
// Completely clear all user data
await userResource.erase()
console.log('All user data erased')
```

### Database Configuration

Resources can be configured through the context configuration:

```typescript
const context = makeClientContext({
  service: 'my-app',
  // ... other config
  dbs: [
    {
      alias: 'users',
      service: 'client-db',
      schema: 'app-users',
      host: []
    },
    {
      alias: 'settings',
      service: 'client-db', 
      schema: 'app-settings',
      host: []
    }
  ]
})
```

### Constants

#### `DEFAULT_DB_ALIAS`
Default database service alias (`'client-db'`).

#### `LIST_KEY`
Internal key used for maintaining record lists (`'_list'`).

## Usage Examples

### Basic Resource Setup

```typescript
import { appendClientResource } from '@owlmeans/client-resource'
import { makeClientContext } from '@owlmeans/client-context'

interface UserRecord extends ResourceRecord {
  id: string
  name: string
  email: string
  role: 'admin' | 'user'
  createdAt: Date
  lastLogin?: Date
}

// Create context and add resource
const context = makeClientContext(config)
appendClientResource(context, 'users')

// Initialize context
await context.configure().init()

// Access the resource
const userResource = context.resource<ClientResource<UserRecord>>('users')
```

### Complete CRUD Operations

```typescript
// Create a new user
const newUser = await userResource.create({
  name: 'Alice Johnson',
  email: 'alice@example.com',
  role: 'user',
  createdAt: new Date()
})
console.log('Created user:', newUser.id)

// Load a user
const user = await userResource.load(newUser.id)
if (user) {
  console.log('User found:', user.name)
}

// Update the user
const updatedUser = await userResource.update({
  id: newUser.id,
  lastLogin: new Date(),
  role: 'admin'
})

// List users with pagination
const userList = await userResource.list({}, {
  pager: { page: 0, size: 10 }
})
console.log('Users:', userList.items.length)
console.log('Total users:', userList.pager.total)

// Delete the user
const deletedUser = await userResource.delete(newUser.id)
console.log('Deleted user:', deletedUser?.name)
```

### Advanced Filtering and Pagination

```typescript
interface ProductRecord extends ResourceRecord {
  id: string
  name: string
  category: string
  price: number
  inStock: boolean
}

const productResource = context.resource<ClientResource<ProductRecord>>('products')

// Filter by category
const electronics = await productResource.list({
  category: 'electronics'
})

// Filter by availability
const availableProducts = await productResource.list({
  inStock: true
})

// Paginated results
let page = 0
const pageSize = 20
let hasMore = true

while (hasMore) {
  const result = await productResource.list({}, {
    pager: { page, size: pageSize }
  })
  
  console.log(`Page ${page + 1}:`, result.items.length)
  
  hasMore = (page + 1) * pageSize < result.pager.total
  page++
}
```

### Error Handling

```typescript
import { RecordExists, UnknownRecordError, ResourceError } from '@owlmeans/resource'

try {
  // Attempt to create user with specific ID
  const user = await userResource.create({
    id: 'specific-id',
    name: 'Test User',
    email: 'test@example.com'
  })
} catch (error) {
  if (error instanceof RecordExists) {
    console.error('User with this ID already exists')
  } else if (error instanceof ResourceError) {
    console.error('Resource error:', error.message)
  }
}

try {
  // Attempt to get non-existent user
  const user = await userResource.get('non-existent-id')
} catch (error) {
  if (error instanceof UnknownRecordError) {
    console.error('User not found')
  }
}
```

### Multiple Resources Management

```typescript
interface UserRecord extends ResourceRecord {
  id: string
  name: string
  email: string
}

interface PostRecord extends ResourceRecord {
  id: string
  title: string
  content: string
  authorId: string
  publishedAt: Date
}

// Setup multiple resources
const context = makeClientContext(config)
appendClientResource(context, 'users')
appendClientResource(context, 'posts')

await context.configure().init()

const userResource = context.resource<ClientResource<UserRecord>>('users')
const postResource = context.resource<ClientResource<PostRecord>>('posts')

// Create user and posts
const author = await userResource.create({
  name: 'John Doe',
  email: 'john@example.com'
})

const post1 = await postResource.create({
  title: 'First Post',
  content: 'Hello world!',
  authorId: author.id,
  publishedAt: new Date()
})

const post2 = await postResource.create({
  title: 'Second Post', 
  content: 'More content here',
  authorId: author.id,
  publishedAt: new Date()
})

// Find posts by author
const authorPosts = await postResource.list({
  authorId: author.id
})
console.log(`${author.name} has ${authorPosts.items.length} posts`)
```

### Resource with Custom Database Configuration

```typescript
const context = makeClientContext({
  service: 'advanced-app',
  // ... other config
  dbs: [
    {
      alias: 'user-data',
      service: 'indexed-db-service',
      schema: 'users-v2',
      host: []
    },
    {
      alias: 'cache-data',
      service: 'memory-db-service', 
      schema: 'temp-cache',
      host: []
    }
  ]
})

// Resources will use the configured database services
appendClientResource(context, 'user-data')
appendClientResource(context, 'cache-data')
```

### Reactive Resource Updates

```typescript
import { useState, useEffect } from 'react'
import { useContext } from '@owlmeans/client'

function UserList() {
  const context = useContext()
  const [users, setUsers] = useState([])
  
  useEffect(() => {
    const loadUsers = async () => {
      const userResource = context.resource('users')
      const result = await userResource.list()
      setUsers(result.items)
    }
    
    loadUsers()
  }, [])
  
  const addUser = async (userData) => {
    const userResource = context.resource('users')
    const newUser = await userResource.create(userData)
    setUsers(prev => [...prev, newUser])
  }
  
  const deleteUser = async (userId) => {
    const userResource = context.resource('users')
    await userResource.delete(userId)
    setUsers(prev => prev.filter(u => u.id !== userId))
  }
  
  return (
    <div>
      {users.map(user => (
        <div key={user.id}>
          {user.name}
          <button onClick={() => deleteUser(user.id)}>Delete</button>
        </div>
      ))}
    </div>
  )
}
```

### Data Migration and Cleanup

```typescript
// Migration helper
const migrateUserData = async () => {
  const userResource = context.resource<ClientResource<UserRecord>>('users')
  const users = await userResource.list()
  
  for (const user of users.items) {
    if (!user.createdAt) {
      await userResource.update({
        id: user.id,
        createdAt: new Date()
      })
    }
  }
}

// Cleanup old data
const cleanupOldUsers = async () => {
  const userResource = context.resource<ClientResource<UserRecord>>('users')
  const users = await userResource.list()
  
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  
  for (const user of users.items) {
    if (user.lastLogin && user.lastLogin < oneYearAgo) {
      await userResource.delete(user.id)
      console.log('Deleted inactive user:', user.name)
    }
  }
}

// Complete resource reset
const resetAllData = async () => {
  const userResource = context.resource('users')
  const postResource = context.resource('posts')
  
  await Promise.all([
    userResource.erase(),
    postResource.erase()
  ])
  
  console.log('All data erased')
}
```

## Error Handling

The package integrates with the OwlMeans error system and may throw the following errors:

### `ResourceError`
General resource operation errors.

### `UnknownRecordError`
Thrown when attempting to access a record that doesn't exist.

### `RecordExists`
Thrown when attempting to create a record with an ID that already exists.

```typescript
import { ResourceError, UnknownRecordError, RecordExists } from '@owlmeans/resource'

const handleResourceOperation = async () => {
  try {
    await userResource.create({ id: 'existing-id', name: 'Test' })
  } catch (error) {
    if (error instanceof RecordExists) {
      console.error('Record already exists')
    } else if (error instanceof UnknownRecordError) {
      console.error('Record not found')
    } else if (error instanceof ResourceError) {
      console.error('Resource error:', error.message)
    }
  }
}
```

## Performance Considerations

1. **Pagination**: Use pagination for large datasets to avoid memory issues
2. **Indexing**: Consider database indexing for frequently queried fields
3. **Batch Operations**: Group related operations together when possible
4. **Memory Management**: Use `pick()` instead of `get()` + `delete()` when extracting data
5. **Database Choice**: Choose appropriate database service based on data size and usage patterns

## Integration with Other Packages

### Client Context Integration
```typescript
import { makeClientContext } from '@owlmeans/client-context'
import { appendClientResource } from '@owlmeans/client-resource'

const context = makeClientContext(config)
appendClientResource(context, 'users')
```

### Authentication Integration
```typescript
import { appendClientResource } from '@owlmeans/client-resource'
import { AUTH_RESOURCE } from '@owlmeans/client-auth'

// Setup authentication resource
appendClientResource(context, AUTH_RESOURCE)
```

### Database Service Integration
```typescript
import { WebDbService } from '@owlmeans/web-db'
import { appendClientResource } from '@owlmeans/client-resource'

// Register database service first
context.registerService(webDbService)

// Then add resources that use it
appendClientResource(context, 'users')
```

## Best Practices

1. **Type Safety**: Always use TypeScript interfaces for your records
2. **Resource Naming**: Use descriptive names for resource aliases
3. **Error Handling**: Implement comprehensive error handling for all operations
4. **Data Validation**: Validate data before storing in resources
5. **Memory Management**: Use pagination for large datasets
6. **Consistent IDs**: Use consistent ID generation strategies
7. **Database Configuration**: Configure appropriate database services for your use case

## Dependencies

This package depends on:
- `@owlmeans/resource` - Base resource interfaces and utilities
- `@owlmeans/client-context` - Client context management
- `@owlmeans/context` - Core context system
- `@noble/hashes` - Cryptographic utilities for ID generation
- `@scure/base` - Base encoding for ID generation

## Related Packages

- [`@owlmeans/resource`](../resource) - Base resource interfaces
- [`@owlmeans/client-context`](../client-context) - Client context management
- [`@owlmeans/web-db`](../web-db) - Web database implementation
- [`@owlmeans/server-resource`](../server-resource) - Server-side resources
- [`@owlmeans/client-auth`](../client-auth) - Authentication with resource storage