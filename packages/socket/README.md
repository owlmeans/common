# @owlmeans/socket

Common WebSocket communication library for OwlMeans applications. This package provides a unified abstraction for real-time communication across server, web, and mobile environments with support for RPC calls, event handling, authentication, and message queuing.

## Overview

The `@owlmeans/socket` package provides:

- **Connection Abstraction**: Unified interface for WebSocket connections across platforms
- **RPC Communication**: Remote procedure call support with timeout and error handling
- **Event System**: Publish/subscribe event handling for real-time updates
- **Authentication Integration**: Built-in authentication flow support
- **Message Queuing**: Queue management for reliable message delivery
- **Request/Response Pattern**: Structured request/response communication
- **Error Handling**: Comprehensive error handling with resilient error types

## Installation

```bash
npm install @owlmeans/socket
```

## Core Concepts

### Connection Interface

The `Connection` interface provides a unified API for WebSocket communication, supporting various message types and communication patterns.

### Message Types

Different message types enable various communication patterns:
- **Call/Result**: RPC-style method calls with responses
- **Request/Response**: Structured request/response patterns
- **Event**: Publish/subscribe event notifications
- **Auth**: Authentication-specific messages

### Authentication Integration

Built-in support for authentication flows with stage-based progression and secure communication.

## API Reference

### Types

#### `Connection`
Core connection interface for WebSocket communication.

```typescript
interface Connection {
  stage: AuthenticationStage                    // Current authentication stage
  notify: <T>(event: string, payload: T) => Promise<void>     // Send events
  observe: <T>(event: string, handler: (event: EventMessage<T>) => Promise<void>) => () => void  // Listen to events
  call: <R, T extends any[]>(method: string, ...payload: T) => Promise<R>  // RPC calls
  perform: <R, T extends any[]>(method: string, handler: CallHendler<R, T>) => void  // Handle RPC calls
  request: <T, R>(payload: T, observer?: (payload: R) => Promise<boolean>) => Promise<() => void>  // Send requests
  reply: <T>(id: string, payload: T) => Promise<void>         // Reply to requests
  auth: <T, R>(stage: AuthenticationStage, payload: T) => Promise<R>  // Authentication
  close: () => Promise<void>                    // Close connection
}
```

#### `Message<T>`
Base message structure for all communication.

```typescript
interface Message<T> {
  type: MessageType     // Message type identifier
  id?: string          // Unique message ID
  sender?: string      // Sender identifier
  recipient?: string   // Recipient identifier
  dt?: number         // Timestamp
  payload: T          // Message payload
}
```

#### `MessageType`
Enumeration of supported message types.

```typescript
enum MessageType {
  Call = 'call',          // RPC method calls
  Result = 'result',      // RPC method results
  Error = 'error',        // Error responses
  Request = 'request',    // Request messages
  Response = 'response',  // Response messages
  Event = 'event',        // Event notifications
  Message = 'message',    // General messages
  Auth = 'auth',          // Authentication messages
  System = 'system'       // System messages
}
```

## Usage Examples

### Basic Connection Usage

```typescript
import { Connection, MessageType } from '@owlmeans/socket'

// Assuming connection is established
const connection: Connection = await createConnection()

// Send an event
await connection.notify('user-online', { userId: '123', status: 'active' })

// Listen for events
const unsubscribe = connection.observe('chat-message', async (event) => {
  console.log('New message:', event.payload)
})

// Make RPC call
const result = await connection.call('getUserProfile', '123')
console.log('User profile:', result)

// Handle RPC calls
connection.perform('echo', async (message: string) => {
  return `Echo: ${message}`
})
```

### Event System

```typescript
// Publisher
await connection.notify('order-status-changed', {
  orderId: 'order-123',
  status: 'shipped',
  timestamp: Date.now()
})

// Subscriber
const unsubscribe = connection.observe('order-status-changed', async (event) => {
  const { orderId, status } = event.payload
  console.log(`Order ${orderId} is now ${status}`)
  
  // Update UI or trigger other actions
  await updateOrderDisplay(orderId, status)
})

// Cleanup
unsubscribe()
```

### RPC Communication

```typescript
// Client-side: Make calls
try {
  const users = await connection.call('getUsers', { page: 1, limit: 10 })
  const user = await connection.call('getUserById', '123')
  const updated = await connection.call('updateUser', '123', { name: 'John Doe' })
} catch (error) {
  console.error('RPC call failed:', error)
}

// Server-side: Handle calls
connection.perform('getUsers', async (options: { page: number, limit: number }) => {
  const users = await userService.list(options)
  return users
})

connection.perform('getUserById', async (id: string) => {
  const user = await userService.get(id)
  if (!user) {
    throw new Error('User not found')
  }
  return user
})

connection.perform('updateUser', async (id: string, data: Partial<User>) => {
  return await userService.update(id, data)
})
```

### Request/Response Pattern

```typescript
// Send request and handle responses
const unsubscribe = await connection.request(
  { action: 'stream-data', filters: { category: 'important' } },
  async (response) => {
    console.log('Received chunk:', response)
    // Return true to continue receiving, false to stop
    return response.hasMore
  }
)

// Handle incoming requests
const unsubscribeHandler = connection.acknowledge(async (id: string, payload: any) => {
  const { action, filters } = payload
  
  if (action === 'stream-data') {
    // Process request and send responses
    const chunks = await getDataChunks(filters)
    
    for (const chunk of chunks) {
      await connection.reply(id, {
        data: chunk,
        hasMore: chunk.index < chunks.length - 1
      })
    }
    
    return true // Request handled
  }
  
  return false // Request not handled
})
```

### Authentication Flow

```typescript
// Authenticate connection
try {
  // Start authentication
  let stage = AuthenticationStage.Init
  let result = await connection.auth(stage, { clientId: 'my-app' })
  
  // Continue authentication based on challenge
  if (result.challenge) {
    stage = AuthenticationStage.Authenticate
    result = await connection.auth(stage, {
      response: await generateAuthResponse(result.challenge)
    })
  }
  
  console.log('Authentication successful:', result)
} catch (error) {
  console.error('Authentication failed:', error)
}

// Check authentication status
if (connection.stage === AuthenticationStage.Authenticated) {
  // Perform authenticated operations
  await connection.call('getProtectedData')
}
```

### Message Queuing

```typescript
// Enqueue messages for delivery
await connection.enqueue({ 
  type: 'user-notification',
  userId: '123',
  message: 'Welcome!'
})

await connection.enqueue({
  type: 'system-alert',
  level: 'warning',
  text: 'Maintenance scheduled'
}, 'maintenance-alert-1')

// Check queue status
const queueSize = connection.enqueued()
console.log(`${queueSize} messages queued`)

// Consume queued messages
const consumed = connection.consume()
if (consumed) {
  const [payload, id, remaining] = consumed
  console.log('Consumed message:', payload, 'ID:', id, 'Remaining:', remaining)
}

// Consume with filter
const alertsOnly = connection.consume((payload: any) => payload.type === 'system-alert')
```

### Connection Lifecycle

```typescript
// Listen to connection events
const unsubscribeListener = connection.listen(async (message) => {
  console.log('Connection message:', message)
  
  // Handle connection-level events
  if (typeof message === 'string') {
    console.log('Raw message:', message)
  } else {
    switch (message.type) {
      case MessageType.System:
        console.log('System message:', message.payload)
        break
      case MessageType.Error:
        console.error('Connection error:', message.payload)
        break
    }
  }
})

// Handle connection cleanup
const handleConnectionClose = async () => {
  // Unsubscribe from events
  unsubscribeListener()
  
  // Clean up resources
  await connection.close()
}

// Handle process termination
process.on('SIGTERM', handleConnectionClose)
process.on('SIGINT', handleConnectionClose)
```

### Error Handling

```typescript
import { SocketError } from '@owlmeans/socket'

try {
  await connection.call('riskyOperation', data)
} catch (error) {
  if (error instanceof SocketError) {
    console.error('Socket error:', error.message)
    
    // Handle specific socket errors
    switch (error.code) {
      case 'TIMEOUT':
        console.log('Call timed out')
        break
      case 'CONNECTION_LOST':
        console.log('Connection lost, attempting reconnect...')
        await reconnectSocket()
        break
      case 'AUTH_FAILED':
        console.log('Authentication failed')
        await reauthenticate()
        break
    }
  }
}
```

## Advanced Features

### Custom Message Preparation

```typescript
// Implement custom message preparation
const customConnection: Connection = {
  ...baseConnection,
  
  prepare: <T>(message: Message<T>, isRequest?: boolean) => {
    // Add custom headers or encryption
    return {
      ...message,
      sender: 'my-service',
      dt: Date.now(),
      // Add custom processing
    }
  }
}
```

### Timeout Configuration

```typescript
// Set default timeout
connection.defaultCallTimeout = 30000 // 30 seconds

// Use custom timeout for specific calls
try {
  const result = await connection.call('longRunningOperation', data)
} catch (error) {
  if (error.message.includes('timeout')) {
    console.log('Operation timed out')
  }
}
```

### Connection Multiplexing

```typescript
// Handle multiple concurrent operations
const operations = [
  connection.call('operation1', data1),
  connection.call('operation2', data2),
  connection.call('operation3', data3)
]

const results = await Promise.allSettled(operations)
results.forEach((result, index) => {
  if (result.status === 'fulfilled') {
    console.log(`Operation ${index + 1} succeeded:`, result.value)
  } else {
    console.error(`Operation ${index + 1} failed:`, result.reason)
  }
})
```

## Integration with OwlMeans Ecosystem

The `@owlmeans/socket` package integrates with:

- **@owlmeans/auth**: Authentication stages and flows
- **@owlmeans/error**: Resilient error handling
- **@owlmeans/client-socket**: Client-side WebSocket implementation
- **@owlmeans/server-socket**: Server-side WebSocket implementation
- **@owlmeans/context**: Service registration and lifecycle management

## Constants

```typescript
const CALL_TIMEOUT = 60000  // Default RPC call timeout (60 seconds)
```

## Best Practices

### Connection Management
- Always handle connection lifecycle events
- Implement proper reconnection logic
- Clean up event listeners on disconnect
- Use appropriate timeouts for different operations

### Error Handling
- Implement comprehensive error handling for all communication patterns
- Use appropriate retry strategies for failed operations
- Log connection events for debugging
- Handle authentication failures gracefully

### Performance
- Use appropriate message batching for high-frequency events
- Implement efficient event filtering
- Consider message compression for large payloads
- Monitor connection performance and adjust timeouts

### Security
- Always authenticate connections before sensitive operations
- Validate all incoming messages and payloads
- Use secure WebSocket connections (WSS) in production
- Implement proper authorization checks for RPC methods

Fixes #32.