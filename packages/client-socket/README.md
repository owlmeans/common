# @owlmeans/client-socket

The **@owlmeans/client-socket** package provides client-side WebSocket integration for OwlMeans Common Libraries, enabling real-time communication between React frontend applications and backend services through WebSocket connections.

## Purpose

This package serves as the client-side WebSocket implementation, specifically designed for:

- **React WebSocket Integration**: Seamless WebSocket connections in React applications
- **Module-based Socket Management**: Integration with the OwlMeans module system for WebSocket endpoints
- **Connection Lifecycle Management**: Automatic connection establishment, maintenance, and cleanup
- **Authentication Integration**: Built-in authentication support for secure WebSocket connections
- **Real-time Communication**: Enable real-time features like chat, notifications, and live updates
- **TypeScript Support**: Full TypeScript support with proper type safety

## Key Concepts

### Client-side WebSocket Management
This package provides client-side WebSocket functionality that integrates with the OwlMeans module system, allowing WebSocket connections to be defined as modules.

### Connection Abstraction
Wraps native WebSocket connections in a unified `Connection` interface that provides consistent API for message handling, authentication, and lifecycle management.

### React Integration
Provides React hooks for managing WebSocket connections with automatic cleanup and re-connection logic.

### Module-driven Connections
WebSocket endpoints are defined as modules, ensuring consistent URL generation and authentication handling across the application.

## Installation

```bash
npm install @owlmeans/client-socket
```

## API Reference

### Types

#### `Config`
Configuration interface extending ClientConfig.

```typescript
interface Config extends ClientConfig { }
```

#### `Context<C extends Config = Config>`
Context interface for client applications with socket support.

```typescript
interface Context<C extends Config = Config> extends ClientContext<C> { }
```

### Core Functions

#### `ws(module: ClientModule<string>, request?: AbstractRequest<{ token?: string }>): Promise<Connection>`

Creates a WebSocket connection using a client module.

**Parameters:**
- `module`: Client module that defines the WebSocket endpoint
- `request`: Optional request object with authentication token

**Returns:** Promise that resolves to a Connection instance

```typescript
import { ws } from '@owlmeans/client-socket'

const socketModule = context.module<ClientModule>('chat-socket')
const connection = await ws(socketModule, {
  query: { token: authToken }
})
```

### React Hooks

#### `useWs(module: string | ClientModule<any>, request?: Partial<AbstractRequest<any>>): Connection | null`

React hook for managing WebSocket connections with automatic lifecycle management.

**Parameters:**
- `module`: Module alias or ClientModule instance
- `request`: Optional request parameters

**Returns:** Connection instance or null if not connected

```typescript
import { useWs } from '@owlmeans/client-socket'

function ChatComponent() {
  const connection = useWs('chat-socket', {
    query: { room: 'general' }
  })
  
  useEffect(() => {
    if (connection) {
      connection.on('message', handleMessage)
    }
  }, [connection])
  
  return <div>Chat interface</div>
}
```

### Utility Functions

#### `makeConnection<C extends Config = Config, T extends Context<C> = Context<C>>(conn: WebSocket, context: T): Connection`

Creates a Connection wrapper around a native WebSocket instance.

**Parameters:**
- `conn`: Native WebSocket instance
- `context`: Application context

**Returns:** Connection wrapper with enhanced functionality

## Usage Examples

### Basic WebSocket Connection

```typescript
import { useWs } from '@owlmeans/client-socket'
import { useContext } from '@owlmeans/client'
import { useEffect, useState } from 'react'

function WebSocketExample() {
  const [messages, setMessages] = useState<string[]>([])
  const connection = useWs('websocket-endpoint')
  
  useEffect(() => {
    if (connection) {
      connection.on('message', (message) => {
        setMessages(prev => [...prev, message.payload])
      })
      
      // Send a message
      connection.send({ 
        type: 'text',
        payload: 'Hello WebSocket!'
      })
    }
  }, [connection])
  
  return (
    <div>
      <h3>Messages:</h3>
      {messages.map((msg, idx) => (
        <div key={idx}>{msg}</div>
      ))}
    </div>
  )
}
```

### Authenticated WebSocket Connection

```typescript
import { useWs } from '@owlmeans/client-socket'
import { useAuth } from '@owlmeans/client-auth'
import { useEffect } from 'react'

function AuthenticatedSocket() {
  const auth = useAuth()
  const connection = useWs('secure-socket', {
    query: { 
      token: auth.getToken() 
    }
  })
  
  useEffect(() => {
    if (connection) {
      connection.on('authenticated', () => {
        console.log('Socket authenticated successfully')
      })
      
      connection.on('auth-error', (error) => {
        console.error('Socket authentication failed:', error)
      })
    }
  }, [connection])
  
  return <div>Authenticated WebSocket connection</div>
}
```

### Chat Application

```typescript
import { useWs } from '@owlmeans/client-socket'
import { useState, useEffect } from 'react'

interface ChatMessage {
  id: string
  user: string
  message: string
  timestamp: number
}

function ChatRoom({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  
  const connection = useWs('chat-socket', {
    query: { room: roomId }
  })
  
  useEffect(() => {
    if (connection) {
      connection.on('chat-message', (event) => {
        const message: ChatMessage = event.payload
        setMessages(prev => [...prev, message])
      })
      
      connection.on('user-joined', (event) => {
        console.log(`${event.payload.user} joined the room`)
      })
      
      connection.on('user-left', (event) => {
        console.log(`${event.payload.user} left the room`)
      })
    }
  }, [connection, roomId])
  
  const sendMessage = () => {
    if (connection && inputMessage.trim()) {
      connection.send({
        type: 'chat-message',
        payload: {
          message: inputMessage,
          room: roomId
        }
      })
      setInputMessage('')
    }
  }
  
  return (
    <div>
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id}>
            <strong>{msg.user}:</strong> {msg.message}
          </div>
        ))}
      </div>
      <div className="input">
        <input
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  )
}
```

### Real-time Notifications

```typescript
import { useWs } from '@owlmeans/client-socket'
import { useEffect, useState } from 'react'

interface Notification {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
}

function NotificationSystem() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const connection = useWs('notification-socket')
  
  useEffect(() => {
    if (connection) {
      connection.on('notification', (event) => {
        const notification: Notification = event.payload
        setNotifications(prev => [notification, ...prev])
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
          setNotifications(prev => 
            prev.filter(n => n.id !== notification.id)
          )
        }, 5000)
      })
      
      connection.on('notification-clear', (event) => {
        const { notificationId } = event.payload
        setNotifications(prev => 
          prev.filter(n => n.id !== notificationId)
        )
      })
    }
  }, [connection])
  
  return (
    <div className="notification-container">
      {notifications.map(notification => (
        <div key={notification.id} className={`notification ${notification.type}`}>
          <h4>{notification.title}</h4>
          <p>{notification.message}</p>
        </div>
      ))}
    </div>
  )
}
```

### Live Data Updates

```typescript
import { useWs } from '@owlmeans/client-socket'
import { useState, useEffect } from 'react'

interface LiveData {
  timestamp: number
  value: number
  status: string
}

function LiveDataDashboard() {
  const [data, setData] = useState<LiveData[]>([])
  const connection = useWs('live-data-socket')
  
  useEffect(() => {
    if (connection) {
      connection.on('data-update', (event) => {
        const newData: LiveData = event.payload
        setData(prev => {
          const updated = [newData, ...prev.slice(0, 99)] // Keep last 100 entries
          return updated
        })
      })
      
      // Request initial data
      connection.send({
        type: 'request-initial-data',
        payload: {}
      })
    }
  }, [connection])
  
  return (
    <div>
      <h2>Live Data Stream</h2>
      <div className="data-grid">
        {data.map((item, idx) => (
          <div key={idx} className="data-item">
            <span>Value: {item.value}</span>
            <span>Status: {item.status}</span>
            <span>Time: {new Date(item.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Connection Status Management

```typescript
import { useWs } from '@owlmeans/client-socket'
import { useState, useEffect } from 'react'

function ConnectionStatusProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const connection = useWs('main-socket')
  
  useEffect(() => {
    if (connection) {
      setIsConnected(true)
      setConnectionError(null)
      
      connection.on('close', () => {
        setIsConnected(false)
        setConnectionError('Connection lost')
      })
      
      connection.on('error', (event) => {
        setConnectionError(event.payload.message)
      })
    } else {
      setIsConnected(false)
    }
  }, [connection])
  
  return (
    <div>
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? 'Connected' : 'Disconnected'}
        {connectionError && <span>: {connectionError}</span>}
      </div>
      {children}
    </div>
  )
}
```

### Manual Connection Management

```typescript
import { ws } from '@owlmeans/client-socket'
import { useContext } from '@owlmeans/client'
import { useEffect, useState } from 'react'

function ManualConnectionComponent() {
  const context = useContext()
  const [connection, setConnection] = useState<Connection | null>(null)
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  
  const connect = async () => {
    try {
      setStatus('connecting')
      const socketModule = context.module<ClientModule>('manual-socket')
      const conn = await ws(socketModule)
      
      conn.on('close', () => {
        setStatus('disconnected')
        setConnection(null)
      })
      
      setConnection(conn)
      setStatus('connected')
    } catch (error) {
      console.error('Connection failed:', error)
      setStatus('disconnected')
    }
  }
  
  const disconnect = async () => {
    if (connection) {
      await connection.close()
      setConnection(null)
      setStatus('disconnected')
    }
  }
  
  useEffect(() => {
    return () => {
      if (connection) {
        connection.close()
      }
    }
  }, [])
  
  return (
    <div>
      <div>Status: {status}</div>
      <button onClick={connect} disabled={status !== 'disconnected'}>
        Connect
      </button>
      <button onClick={disconnect} disabled={status === 'disconnected'}>
        Disconnect
      </button>
    </div>
  )
}
```

## Error Handling

```typescript
import { useWs } from '@owlmeans/client-socket'
import { useEffect, useState } from 'react'

function ErrorHandlingExample() {
  const [error, setError] = useState<string | null>(null)
  const connection = useWs('error-prone-socket')
  
  useEffect(() => {
    if (connection) {
      connection.on('error', (event) => {
        setError(event.payload.message || 'Unknown error occurred')
      })
      
      connection.on('close', (event) => {
        if (event.payload.code !== 1000) { // Not a normal closure
          setError(`Connection closed unexpectedly (Code: ${event.payload.code})`)
        }
      })
      
      // Clear error when reconnected
      connection.on('open', () => {
        setError(null)
      })
    }
  }, [connection])
  
  return (
    <div>
      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}
      <div>
        Connection Status: {connection ? 'Connected' : 'Disconnected'}
      </div>
    </div>
  )
}
```

## Integration Patterns

### Module Definition

```typescript
// Define WebSocket module in your module configuration
import { module } from '@owlmeans/client-module'
import { route } from '@owlmeans/route'

const chatSocketModule = module(
  route('chat-socket', '/ws/chat'),
  guard('authenticated')
)

// Register the module with your context
context.registerModule(chatSocketModule)
```

### Context Provider Pattern

```typescript
import React, { createContext, useContext as useReactContext } from 'react'
import { Connection } from '@owlmeans/socket'
import { useWs } from '@owlmeans/client-socket'

const SocketContext = createContext<Connection | null>(null)

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const connection = useWs('global-socket')
  
  return (
    <SocketContext.Provider value={connection}>
      {children}
    </SocketContext.Provider>
  )
}

export function useGlobalSocket() {
  const connection = useReactContext(SocketContext)
  if (!connection) {
    throw new Error('useGlobalSocket must be used within SocketProvider')
  }
  return connection
}
```

## Best Practices

1. **Connection Management**: Always handle connection lifecycle properly with cleanup
2. **Error Handling**: Implement comprehensive error handling for network issues
3. **Reconnection Logic**: Consider implementing automatic reconnection for critical connections
4. **Message Validation**: Validate incoming messages to ensure data integrity
5. **Performance**: Avoid creating too many simultaneous WebSocket connections
6. **Authentication**: Securely handle authentication tokens in WebSocket connections
7. **Memory Leaks**: Ensure proper cleanup of event listeners and connections

## Dependencies

This package depends on:
- `@owlmeans/auth` - Authentication framework
- `@owlmeans/client` - Client framework
- `@owlmeans/client-context` - Client context management
- `@owlmeans/client-module` - Client module system
- `@owlmeans/context` - Context management
- `@owlmeans/module` - Module system
- `@owlmeans/socket` - Core socket functionality
- `react` - React framework

## Related Packages

- [`@owlmeans/socket`](../socket) - Core socket functionality
- [`@owlmeans/server-socket`](../server-socket) - Server-side WebSocket implementation
- [`@owlmeans/client`](../client) - Client framework
- [`@owlmeans/client-module`](../client-module) - Client module system
