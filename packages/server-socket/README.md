# @owlmeans/server-socket

The **@owlmeans/server-socket** package provides WebSocket server functionality for OwlMeans Common Libraries, designed for fullstack microservices and microclients development with focus on security and proper authentication and authorization.

## Purpose

This package serves as the server-side WebSocket implementation that:

- **Provides WebSocket server capabilities** using Fastify WebSocket integration
- **Supports real-time communication** between server and clients
- **Integrates with module system** for WebSocket route handling
- **Implements authentication and authorization** for WebSocket connections
- **Offers connection management** with lifecycle hooks and proper cleanup
- **Enables bidirectional messaging** with typed message handling

## Core Concepts

### Socket Service
A service that manages WebSocket server functionality and integrates with the Fastify web server to provide WebSocket endpoints.

### Connection Handling
Provides abstraction for WebSocket connections with proper lifecycle management, authentication, and error handling.

### Module Integration
WebSocket endpoints are defined using the OwlMeans module system, allowing for consistent routing, validation, and middleware application.

### Authentication & Authorization
WebSocket connections can be protected using the same guard and gate system used for HTTP endpoints.

## API Reference

### Services

#### `createSocketService(alias?): SocketService`

Creates a WebSocket service that can be registered with a server context.

```typescript
import { createSocketService } from '@owlmeans/server-socket'

const socketService = createSocketService('websocket')
```

**Parameters:**
- `alias`: string (optional) - Service alias, defaults to `DEFAULT_ALIAS` ('socket-server')

**Returns:** SocketService instance

#### `SocketService`

Interface for the WebSocket service.

```typescript
interface SocketService extends InitializedService {
  update: (api: ApiServer) => Promise<void>
}
```

**Methods:**
- `update(api)`: Configures the WebSocket server with the provided API server instance

### Helper Functions

#### `handleConnection<T>(handler): RefedModuleHandler`

Creates a WebSocket connection handler that integrates with the module system.

```typescript
import { handleConnection } from '@owlmeans/server-socket'
import type { Connection } from '@owlmeans/socket'

const myConnectionHandler = handleConnection<MyConnection>(
  async (conn, ctx, req, res) => {
    // Handle WebSocket connection
    console.log('New WebSocket connection')
    
    conn.onMessage(async (message) => {
      console.log('Received:', message)
      await conn.send({ type: 'echo', data: message })
    })
    
    conn.onClose(() => {
      console.log('Connection closed')
    })
  }
)
```

**Parameters:**
- `handler`: Function that handles WebSocket connections with signature:
  - `conn`: Connection instance
  - `ctx`: Server context
  - `req`: Abstract request
  - `res`: Abstract response

**Returns:** Module handler compatible with OwlMeans modules

### Types

#### `Config`

Configuration interface extending ServerConfig.

```typescript
interface Config extends ServerConfig {}
```

#### `Context<C>`

Context interface that extends ServerContext with API server capabilities.

```typescript
interface Context<C extends Config = Config> extends ServerContext<C>, ApiServerAppend {}
```

### Constants

#### `DEFAULT_ALIAS`

Default alias for the socket service.

```typescript
const DEFAULT_ALIAS = 'socket-server'
```

## Usage Examples

### Basic WebSocket Server Setup

```typescript
import { makeServerContext, makeServerConfig } from '@owlmeans/server-context'
import { createSocketService } from '@owlmeans/server-socket'
import { createApiService } from '@owlmeans/server-api'
import { AppType } from '@owlmeans/context'

// Create server configuration
const config = makeServerConfig(AppType.Backend, 'websocket-server', {
  host: 'localhost',
  port: 3000
})

// Create context and services
const context = makeServerContext(config)
const apiService = createApiService()
const socketService = createSocketService()

// Register services
context.registerService(apiService)
context.registerService(socketService)

// Configure and initialize
context.configure()
await context.init()

console.log('WebSocket server running on ws://localhost:3000')
```

### WebSocket Module with Authentication

```typescript
import { module, guard } from '@owlmeans/module'
import { route } from '@owlmeans/route'
import { handleConnection } from '@owlmeans/server-socket'
import type { Connection } from '@owlmeans/socket'

// Create WebSocket module with authentication
const chatModule = module(
  route('chat-socket', '/ws/chat'),
  guard('authenticated')
)

// Set WebSocket handler
chatModule.handle = handleConnection<Connection>(
  async (conn, ctx, req, res) => {
    const userId = req.auth?.user?.id
    
    if (!userId) {
      await conn.close(1008, 'Authentication required')
      return
    }
    
    console.log(`User ${userId} connected to chat`)
    
    // Join user to chat room
    await joinChatRoom(conn, userId)
    
    // Handle incoming messages
    conn.onMessage(async (message) => {
      if (message.type === 'chat-message') {
        await broadcastMessage(userId, message.content)
      }
    })
    
    // Handle disconnection
    conn.onClose(() => {
      console.log(`User ${userId} disconnected from chat`)
      leaveChatRoom(userId)
    })
  }
)

// Register module with context
context.registerModule(chatModule)
```

### Real-time Data Streaming

```typescript
import { handleConnection } from '@owlmeans/server-socket'
import type { Connection } from '@owlmeans/socket'

const dataStreamModule = module(
  route('data-stream', '/ws/data'),
  guard('authenticated')
)

dataStreamModule.handle = handleConnection<Connection>(
  async (conn, ctx, req, res) => {
    const userId = req.auth?.user?.id
    
    // Start streaming data to client
    const streamInterval = setInterval(async () => {
      const data = await fetchLatestData(userId)
      await conn.send({
        type: 'data-update',
        timestamp: Date.now(),
        data: data
      })
    }, 1000)
    
    // Handle client requests
    conn.onMessage(async (message) => {
      switch (message.type) {
        case 'subscribe':
          await subscribeToChannel(userId, message.channel)
          break
        case 'unsubscribe':
          await unsubscribeFromChannel(userId, message.channel)
          break
        case 'get-history':
          const history = await getHistoricalData(message.from, message.to)
          await conn.send({
            type: 'history-data',
            requestId: message.requestId,
            data: history
          })
          break
      }
    })
    
    // Cleanup on disconnect
    conn.onClose(() => {
      clearInterval(streamInterval)
      unsubscribeFromAllChannels(userId)
    })
  }
)
```

### WebSocket with Validation

```typescript
import { module, filter, body } from '@owlmeans/module'
import { route } from '@owlmeans/route'
import { handleConnection } from '@owlmeans/server-socket'

// Define message validation schema
const messageSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['join', 'leave', 'message'] },
    content: { type: 'string', maxLength: 1000 },
    roomId: { type: 'string' }
  },
  required: ['type']
}

const validatedSocketModule = module(
  route('validated-socket', '/ws/validated'),
  filter(body(messageSchema))
)

validatedSocketModule.handle = handleConnection<Connection>(
  async (conn, ctx, req, res) => {
    conn.onMessage(async (message) => {
      // Message is automatically validated against schema
      try {
        switch (message.type) {
          case 'join':
            await joinRoom(conn, message.roomId)
            await conn.send({ type: 'joined', roomId: message.roomId })
            break
          case 'leave':
            await leaveRoom(conn, message.roomId)
            await conn.send({ type: 'left', roomId: message.roomId })
            break
          case 'message':
            await broadcastToRoom(message.roomId, {
              type: 'room-message',
              content: message.content,
              sender: req.auth?.user?.id
            })
            break
        }
      } catch (error) {
        await conn.send({
          type: 'error',
          message: error.message
        })
      }
    })
  }
)
```

### Connection Management

```typescript
import { handleConnection } from '@owlmeans/server-socket'
import type { Connection } from '@owlmeans/socket'

// Global connection registry
const connections = new Map<string, Connection>()

const managedConnectionModule = module(
  route('managed-connection', '/ws/managed')
)

managedConnectionModule.handle = handleConnection<Connection>(
  async (conn, ctx, req, res) => {
    const connectionId = generateConnectionId()
    
    // Register connection
    connections.set(connectionId, conn)
    
    // Send connection info
    await conn.send({
      type: 'connection-established',
      connectionId: connectionId,
      serverTime: Date.now()
    })
    
    // Handle ping/pong for connection health
    conn.onMessage(async (message) => {
      if (message.type === 'ping') {
        await conn.send({ type: 'pong', timestamp: Date.now() })
      }
    })
    
    // Cleanup on disconnect
    conn.onClose(() => {
      connections.delete(connectionId)
      console.log(`Connection ${connectionId} closed`)
    })
    
    // Send periodic server stats
    const statsInterval = setInterval(async () => {
      await conn.send({
        type: 'server-stats',
        activeConnections: connections.size,
        serverUptime: process.uptime()
      })
    }, 30000)
    
    conn.onClose(() => {
      clearInterval(statsInterval)
    })
  }
)

// Function to broadcast to all connections
const broadcastToAll = async (message: any) => {
  const promises = Array.from(connections.values()).map(conn =>
    conn.send(message).catch(console.error)
  )
  await Promise.allSettled(promises)
}
```

### Error Handling

```typescript
import { handleConnection } from '@owlmeans/server-socket'
import { ResilientError } from '@owlmeans/error'

const errorHandlingModule = module(
  route('error-handling', '/ws/errors')
)

errorHandlingModule.handle = handleConnection<Connection>(
  async (conn, ctx, req, res) => {
    conn.onMessage(async (message) => {
      try {
        await processMessage(message)
      } catch (error) {
        if (error instanceof ResilientError) {
          // Handle known errors gracefully
          await conn.send({
            type: 'error',
            code: error.code,
            message: error.message,
            recoverable: true
          })
        } else {
          // Handle unknown errors
          console.error('Unexpected error:', error)
          await conn.send({
            type: 'error',
            message: 'Internal server error',
            recoverable: false
          })
        }
      }
    })
    
    conn.onError((error) => {
      console.error('WebSocket connection error:', error)
    })
  }
)
```

## Integration Patterns

### With Chat Systems

```typescript
// Real-time chat implementation
const chatRooms = new Map<string, Set<Connection>>()

const joinRoom = async (conn: Connection, roomId: string) => {
  if (!chatRooms.has(roomId)) {
    chatRooms.set(roomId, new Set())
  }
  chatRooms.get(roomId)!.add(conn)
}

const broadcastToRoom = async (roomId: string, message: any) => {
  const room = chatRooms.get(roomId)
  if (room) {
    const promises = Array.from(room).map(conn => conn.send(message))
    await Promise.allSettled(promises)
  }
}
```

### With Gaming Applications

```typescript
// Game server with real-time updates
const gameSessionModule = module(
  route('game-session', '/ws/game/:sessionId'),
  guard('authenticated')
)

gameSessionModule.handle = handleConnection<Connection>(
  async (conn, ctx, req, res) => {
    const sessionId = req.params.sessionId
    const playerId = req.auth?.user?.id
    
    await joinGameSession(sessionId, playerId, conn)
    
    conn.onMessage(async (message) => {
      switch (message.type) {
        case 'player-move':
          await processPlayerMove(sessionId, playerId, message.move)
          await broadcastGameState(sessionId)
          break
        case 'player-action':
          await processPlayerAction(sessionId, playerId, message.action)
          break
      }
    })
  }
)
```

### With Monitoring Systems

```typescript
// Real-time monitoring dashboard
const monitoringModule = module(
  route('monitoring', '/ws/monitor'),
  guard('admin')
)

monitoringModule.handle = handleConnection<Connection>(
  async (conn, ctx, req, res) => {
    // Send initial system state
    await conn.send({
      type: 'system-state',
      data: await getSystemMetrics()
    })
    
    // Subscribe to system events
    const unsubscribe = await subscribeToSystemEvents(async (event) => {
      await conn.send({
        type: 'system-event',
        event: event
      })
    })
    
    conn.onClose(unsubscribe)
  }
)
```

## Security Considerations

### Authentication and Authorization
- **Guard Integration** - Use authentication guards to protect WebSocket endpoints
- **Token Validation** - Validate JWT tokens or session tokens before accepting connections
- **Connection Limits** - Implement connection limits per user or IP address

### Data Validation
- **Message Validation** - Always validate incoming WebSocket messages
- **Rate Limiting** - Implement rate limiting for message frequency
- **Sanitization** - Sanitize user input to prevent injection attacks

### Connection Security
- **TLS/SSL** - Use secure WebSocket connections (WSS) in production
- **Origin Validation** - Validate connection origins to prevent CSRF attacks
- **Connection Timeouts** - Implement proper timeout mechanisms

## Best Practices

1. **Implement proper error handling** - Always handle connection errors and message processing errors
2. **Use connection pooling** - Manage connections efficiently to prevent memory leaks
3. **Implement heartbeat mechanism** - Use ping/pong to detect dead connections
4. **Validate all messages** - Never trust incoming WebSocket messages without validation
5. **Handle cleanup properly** - Always clean up resources when connections close
6. **Monitor connection health** - Track connection metrics and performance

## Error Handling

The package integrates with OwlMeans error handling:

- **ResilientError** - For recoverable errors that clients can handle
- **Connection errors** - Proper handling of WebSocket connection failures
- **Authentication errors** - Clear error messages for authentication failures
- **Validation errors** - Detailed validation error reporting

## Dependencies

This package depends on:
- `@owlmeans/context` - For service registration and context management
- `@owlmeans/server-api` - For API server integration
- `@owlmeans/server-context` - For server-side context management
- `@owlmeans/server-module` - For module system integration
- `@owlmeans/module` - For core module functionality
- `@owlmeans/socket` - For connection abstractions
- `@owlmeans/error` - For error handling
- `@fastify/websocket` - For WebSocket server implementation

## Related Packages

- [`@owlmeans/socket`](../socket) - WebSocket connection abstractions
- [`@owlmeans/client-socket`](../client-socket) - Client-side WebSocket implementation
- [`@owlmeans/server-api`](../server-api) - HTTP API server functionality
- [`@owlmeans/server-module`](../server-module) - Server-side module system