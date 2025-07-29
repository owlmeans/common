# @owlmeans/state

A reactive state management library for OwlMeans Common applications. This package provides a comprehensive state management system with subscription-based reactivity, resource integration, and real-time data synchronization for building responsive fullstack applications.

## Overview

The `@owlmeans/state` package is a reactive state management library in the OwlMeans Common ecosystem that provides:

- **Reactive State Management**: Subscribe to state changes with automatic updates
- **Resource Integration**: Built on top of OwlMeans Resource system for data persistence
- **Real-time Synchronization**: Live updates across multiple subscribers
- **Model-Based Architecture**: Type-safe state models with built-in update methods
- **Query Subscriptions**: Subscribe to filtered data sets with criteria
- **Memory Management**: Automatic cleanup and unsubscription handling
- **Context Integration**: Seamless integration with OwlMeans context system

## Installation

```bash
npm install @owlmeans/state
```

## Core Concepts

### State Resource

The `StateResource` extends the standard OwlMeans Resource interface with reactive capabilities, allowing components to subscribe to data changes and receive automatic updates.

### State Model

A `StateModel` wraps resource records with reactive capabilities, providing methods to update data and automatically notify subscribers of changes.

### Subscriptions

Subscriptions connect components to state changes, automatically triggering updates when subscribed data changes.

### Listeners

Functions that handle state change notifications, receiving updated state models when data changes.

## API Reference

### Types

#### `StateResource<T extends ResourceRecord>`
Extended resource interface with subscription capabilities.

```typescript
interface StateResource<T extends ResourceRecord> extends Resource<T> {
  subscribe: (params: StateSubscriptionOption<T>) => [() => void, StateModel<T>[]]
  listen: (listener: StateListener<T>) => () => void
  erase: () => Promise<void>
}
```

#### `StateModel<T extends ResourceRecord>`
Reactive wrapper for resource records.

```typescript
interface StateModel<T extends ResourceRecord> {
  record: T
  commit: (force?: boolean) => void
  update: (data?: Partial<T>) => void
  clear: () => void
}
```

#### `StateSubscriptionOption<T>`
Configuration for state subscriptions.

```typescript
interface StateSubscriptionOption<T extends ResourceRecord> {
  id?: string | string[]        // Specific record IDs to subscribe to
  _systemId?: string           // System-level subscription identifier
  query?: ListCriteria         // Query criteria for filtered subscriptions
  default?: Partial<T>         // Default data for new records
  listener: StateListener<T>   // Callback function for updates
}
```

#### `StateListener<T>`
Function type for handling state changes.

```typescript
interface StateListener<T extends ResourceRecord> {
  (record: StateModel<T>[]): void | Promise<void>
}
```

### Factory Functions

#### `createStateResource<R>(alias?: string): StateResource<R>`
Creates a new state resource with reactive capabilities.

**Parameters:**
- `alias`: Optional resource alias (defaults to 'state')

**Returns:** StateResource instance with subscription support

#### `appendStateResource<C, T>(ctx: T, alias?: string): T & StateResourceAppend`
Appends a state resource to an existing context.

**Parameters:**
- `ctx`: OwlMeans context instance
- `alias`: Optional resource alias

**Returns:** Context with state resource capabilities

### Core Methods

#### `subscribe(params: StateSubscriptionOption<T>): [() => void, StateModel<T>[]]`
Subscribes to state changes for specific records or queries.

**Parameters:**
- `params`: Subscription configuration with listener and criteria

**Returns:** Tuple of [unsubscribe function, current state models]

#### `listen(listener: StateListener<T>): () => void`
Adds a global listener for all state changes.

**Parameters:**
- `listener`: Function to handle state changes

**Returns:** Unsubscribe function

#### `erase(): Promise<void>`
Clears all state data and notifies subscribers.

### State Model Methods

#### `commit(force?: boolean): void`
Persists model changes to the underlying resource.

#### `update(data?: Partial<T>): void`
Updates model data and notifies subscribers.

#### `clear(): void`
Clears model data while maintaining subscription.

### Error Types

#### `StateToolingError`
Base error for state management tooling issues.

#### `StateListenerError`
Error related to listener management and execution.

## Usage Examples

### Basic State Subscription

```typescript
import { createStateResource } from '@owlmeans/state'

interface User extends ResourceRecord {
  id?: string
  name: string
  email: string
  status: 'active' | 'inactive'
}

// Create state resource
const userState = createStateResource<User>('users')

// Subscribe to a specific user
const [unsubscribe, models] = userState.subscribe({
  id: 'user123',
  listener: (models) => {
    const user = models[0]
    console.log('User updated:', user.record)
  }
})

// Get current state immediately
if (models.length > 0) {
  console.log('Current user:', models[0].record)
}

// Update user data
models[0].update({ status: 'inactive' })
models[0].commit()

// Cleanup
unsubscribe()
```

### Multiple Record Subscription

```typescript
// Subscribe to multiple users
const [unsubscribe, models] = userState.subscribe({
  id: ['user1', 'user2', 'user3'],
  listener: (models) => {
    console.log(`Received updates for ${models.length} users`)
    models.forEach(model => {
      console.log(`User ${model.record.id}: ${model.record.name}`)
    })
  }
})
```

### Query-Based Subscription

```typescript
// Subscribe to active users
const [unsubscribe, models] = userState.subscribe({
  query: {
    status: 'active',
    role: ['admin', 'moderator']
  },
  listener: (models) => {
    console.log(`Active admin/moderator users: ${models.length}`)
  }
})
```

### Global State Listening

```typescript
// Listen to all state changes
const unsubscribe = userState.listen((models) => {
  console.log('Global state change detected')
  // Handle any user state changes
})
```

### React Integration Example

```typescript
import React, { useEffect, useState } from 'react'

const UserProfile: React.FC<{ userId: string }> = ({ userId }) => {
  const [user, setUser] = useState<StateModel<User> | null>(null)

  useEffect(() => {
    const [unsubscribe, models] = userState.subscribe({
      id: userId,
      default: { name: '', email: '', status: 'active' },
      listener: (models) => {
        setUser(models[0] || null)
      }
    })

    // Set initial state
    if (models.length > 0) {
      setUser(models[0])
    }

    return unsubscribe
  }, [userId])

  const handleUpdate = (data: Partial<User>) => {
    if (user) {
      user.update(data)
      user.commit()
    }
  }

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h2>{user.record.name}</h2>
      <p>Email: {user.record.email}</p>
      <p>Status: {user.record.status}</p>
      <button onClick={() => handleUpdate({ status: 'inactive' })}>
        Deactivate User
      </button>
    </div>
  )
}
```

### Context Integration

```typescript
import { createBasicContext } from '@owlmeans/context'
import { appendStateResource } from '@owlmeans/state'

// Create context with state capabilities
const context = createBasicContext()
appendStateResource(context, 'user-state')

// Access state resource from context
const stateResource = context.getStateResource<User>('user-state')
```

### Bulk Operations

```typescript
// Subscribe to system-level changes
const [unsubscribe, models] = userState.subscribe({
  _systemId: 'bulk-operations',
  listener: async (models) => {
    // Handle bulk updates
    console.log(`Processing ${models.length} records`)
    
    // Batch commit changes
    models.forEach(model => model.commit())
  }
})

// Perform bulk updates
await userState.create({ name: 'User 1', email: 'user1@example.com' })
await userState.create({ name: 'User 2', email: 'user2@example.com' })
```

### Default Data Handling

```typescript
// Subscribe with default data for new records
const [unsubscribe, models] = userState.subscribe({
  id: 'new-user',
  default: {
    name: 'New User',
    email: '',
    status: 'active'
  },
  listener: (models) => {
    const user = models[0]
    if (!user.record.email) {
      // User still needs email
      console.log('User needs email address')
    }
  }
})
```

### Error Handling

```typescript
import { StateListenerError } from '@owlmeans/state'

try {
  const [unsubscribe, models] = userState.subscribe({
    id: 'user123',
    listener: async (models) => {
      // Async listener that might throw
      await processUserData(models[0].record)
    }
  })
} catch (error) {
  if (error instanceof StateListenerError) {
    console.error('Listener error:', error.message)
  }
}
```

## Advanced Features

### Custom Subscription Patterns

```typescript
// Conditional subscriptions
const subscribeToUser = (userId: string, condition: (user: User) => boolean) => {
  return userState.subscribe({
    id: userId,
    listener: (models) => {
      const user = models[0]
      if (user && condition(user.record)) {
        // Handle conditional updates
        console.log('Condition met for user:', user.record.id)
      }
    }
  })
}

// Subscribe only to active users
const [unsubscribe] = subscribeToUser('user123', user => user.status === 'active')
```

### Memory Management

```typescript
class UserManager {
  private subscriptions: (() => void)[] = []

  subscribeToUser(userId: string) {
    const [unsubscribe] = userState.subscribe({
      id: userId,
      listener: this.handleUserUpdate.bind(this)
    })
    
    this.subscriptions.push(unsubscribe)
  }

  cleanup() {
    // Clean up all subscriptions
    this.subscriptions.forEach(unsubscribe => unsubscribe())
    this.subscriptions = []
  }

  private handleUserUpdate(models: StateModel<User>[]) {
    // Handle updates
  }
}
```

### Performance Optimization

```typescript
// Debounced updates
let updateTimeout: NodeJS.Timeout

const [unsubscribe] = userState.subscribe({
  id: 'user123',
  listener: (models) => {
    clearTimeout(updateTimeout)
    updateTimeout = setTimeout(() => {
      // Process updates after debounce
      console.log('Processing debounced update')
    }, 100)
  }
})
```

## Integration with OwlMeans Ecosystem

The `@owlmeans/state` package integrates with:

- **@owlmeans/resource**: Built on the resource system for data persistence
- **@owlmeans/context**: Context-based service registration and access
- **@owlmeans/client**: React hooks and component integration
- **@owlmeans/error**: Error handling and reporting
- **@owlmeans/client-resource**: Client-side resource management

## Best Practices

### Subscription Management
- Always store unsubscribe functions and call them during cleanup
- Use specific IDs when possible instead of broad queries
- Implement proper error handling in listeners
- Avoid creating subscriptions in render loops

### Performance
- Use query-based subscriptions for filtered data sets
- Implement debouncing for high-frequency updates
- Clean up unused subscriptions promptly
- Use default data to avoid loading states

### Memory Management
- Implement proper cleanup in component unmount
- Use weak references for large object graphs
- Monitor subscription count in development
- Clean up system subscriptions when no longer needed

### Error Handling
- Wrap async listeners in try-catch blocks
- Implement fallback UI for failed state updates
- Log subscription errors for debugging
- Use defensive programming for model access

Fixes #32.