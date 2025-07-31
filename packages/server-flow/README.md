# @owlmeans/server-flow

Server-side flow management functionality for OwlMeans Common Libraries. This package extends the core `@owlmeans/flow` system with server-specific operations, persistence, state management, and API integrations for backend applications in fullstack architectures.

## Overview

The `@owlmeans/server-flow` package provides the server-side implementation of the OwlMeans flow system, designed for backend services in fullstack applications with focus on security and proper flow state management. It extends the base `@owlmeans/flow` package with:

- **Server Flow Management**: Handle flow operations on the backend with proper persistence
- **API Integration**: RESTful and WebSocket APIs for flow state management
- **Database Persistence**: Persistent flow state storage using OwlMeans resource system
- **Cross-service Coordination**: Coordinate flows across multiple microservices
- **Authentication Integration**: Secure flow operations with OwlMeans auth system
- **Performance Optimization**: Server-side caching and optimization for flow operations

This package follows the OwlMeans "quadra" pattern as the **server** implementation, complementing:
- **@owlmeans/flow**: Common flow declarations and base functionality *(base package)*
- **@owlmeans/client-flow**: Client-side flow implementation  
- **@owlmeans/web-flow**: Web-specific flow implementation
- **@owlmeans/server-flow**: Server-side flow implementation *(this package)*

## Installation

```bash
npm install @owlmeans/server-flow
```

## Dependencies

This package requires and integrates with:
- `@owlmeans/flow`: Core flow functionality and types
- `@owlmeans/server-context`: Server context management
- `@owlmeans/server-module`: Server module system for flow APIs
- `@owlmeans/auth`: Authentication and authorization
- `@owlmeans/resource`: Resource management for flow persistence

## Key Concepts

### Server-side Flow Persistence
Unlike client-side flows that may be ephemeral, server-side flows provide persistent state management with database backing, enabling:
- **Cross-session Continuity**: Flows that survive across user sessions
- **Multi-device Synchronization**: Flow state accessible from multiple devices
- **Audit Trails**: Complete history of flow state changes
- **Recovery Capabilities**: Flow state recovery after server restarts

### API-driven Flow Management
Server-side flows expose RESTful APIs and WebSocket endpoints for:
- **Flow State Queries**: Retrieve current flow state and available transitions
- **Flow Navigation**: Execute flow transitions via API calls
- **Flow Administration**: Administrative interfaces for flow management
- **Real-time Updates**: WebSocket-based real-time flow state synchronization

### Cross-service Flow Coordination
Enable flows that span multiple microservices with:
- **Service Registration**: Register flow handlers across different services
- **Distributed State**: Maintain flow state across service boundaries
- **Event Propagation**: Propagate flow events across services
- **Conflict Resolution**: Handle concurrent flow modifications

## API Reference

*Note: This package extends the base flow system with server-specific functionality.*

### Factory Functions

#### `makeServerFlowService(alias?: string): ServerFlowService`

Creates a server-side flow service instance with persistence and API capabilities.

```typescript
import { makeServerFlowService } from '@owlmeans/server-flow'
import { makeServerContext } from '@owlmeans/server-context'

const context = makeServerContext(config)
const flowService = makeServerFlowService('main-flow')
context.registerService(flowService)
```

#### `makeFlowProvider(config: FlowProviderConfig): FlowProvider`

Creates a flow provider that loads flow definitions from various sources (database, files, remote services).

```typescript
import { makeFlowProvider } from '@owlmeans/server-flow'

const flowProvider = makeFlowProvider({
  source: 'database',
  connectionString: process.env.DB_CONNECTION,
  cacheTimeout: 300000 // 5 minutes
})
```

### Core Interfaces

#### `ServerFlowService`

Server-side flow service extending the base flow functionality.

```typescript
interface ServerFlowService extends InitializedService {
  // Flow management
  createFlow: (definition: Flow) => Promise<string>
  updateFlow: (flowId: string, definition: Partial<Flow>) => Promise<void>
  deleteFlow: (flowId: string) => Promise<void>
  
  // Flow state management  
  getFlowState: (userId: string, flowId: string) => Promise<FlowState | null>
  setFlowState: (userId: string, state: FlowState) => Promise<void>
  clearFlowState: (userId: string, flowId: string) => Promise<void>
  
  // Flow execution
  executeTransition: (userId: string, flowId: string, transition: string, payload?: FlowPayload) => Promise<FlowState>
  resetFlow: (userId: string, flowId: string, step?: string) => Promise<FlowState>
  
  // Flow querying
  listFlows: () => Promise<Flow[]>
  getUserFlows: (userId: string) => Promise<FlowState[]>
  getFlowHistory: (userId: string, flowId: string) => Promise<FlowStateHistory[]>
  
  // Administrative functions
  purgeExpiredFlows: () => Promise<number>
  getFlowStatistics: () => Promise<FlowStatistics>
}
```

#### `FlowProviderConfig`

Configuration for flow providers that load flow definitions.

```typescript
interface FlowProviderConfig {
  source: 'database' | 'file' | 'remote' | 'hybrid'
  connectionString?: string
  filePath?: string
  remoteUrl?: string
  cacheTimeout?: number
  authentication?: {
    type: 'bearer' | 'basic' | 'apikey'
    credentials: string
  }
}
```

#### `FlowStateHistory`

Historical record of flow state changes for auditing and debugging.

```typescript
interface FlowStateHistory {
  id: string
  userId: string
  flowId: string
  fromStep: string
  toStep: string
  transition: string
  payload?: FlowPayload
  timestamp: Date
  success: boolean
  error?: string
  metadata?: Record<string, any>
}
```

#### `FlowStatistics`

Flow usage and performance statistics for monitoring and optimization.

```typescript
interface FlowStatistics {
  totalFlows: number
  activeUsers: number
  completionRate: number
  averageFlowDuration: number
  popularSteps: Array<{
    step: string
    count: number
  }>
  errorRate: number
  performanceMetrics: {
    averageResponseTime: number
    p95ResponseTime: number
    throughputPerSecond: number
  }
}
```

### Flow API Modules

#### Server Flow API Modules

The package provides predefined modules for common flow API operations:

```typescript
// Flow state API endpoints
export const flowStateModule = module(route('flow-state', '/api/flow/:flowId/state'), {
  guards: ['authenticated'],
  filter: params({
    type: 'object',
    properties: {
      flowId: { type: 'string' }
    },
    required: ['flowId']
  }),
  handle: async (req, res) => {
    const flowService = req.context.service<ServerFlowService>('flow')
    const state = await flowService.getFlowState(req.auth.userId, req.params.flowId)
    res.resolve(state)
  }
})

// Flow transition API endpoints  
export const flowTransitionModule = module(route('flow-transition', '/api/flow/:flowId/transition/:transition', { method: 'POST' }), {
  guards: ['authenticated'],
  filter: body({
    type: 'object',
    properties: {
      payload: { type: 'object' }
    }
  }),
  handle: async (req, res) => {
    const flowService = req.context.service<ServerFlowService>('flow')
    const newState = await flowService.executeTransition(
      req.auth.userId,
      req.params.flowId,
      req.params.transition,
      req.body.payload
    )
    res.resolve(newState)
  }
})
```

### Persistence Integration

#### Flow State Resource

Integration with OwlMeans resource system for flow state persistence:

```typescript
import { makeResource } from '@owlmeans/resource'

const flowStateResource = makeResource('flow-state', {
  // MongoDB or other database configuration
  collection: 'flow_states',
  indexes: [
    { userId: 1, flowId: 1 },
    { createdAt: 1 },
    { expiresAt: 1 }
  ]
})
```

#### Flow Definition Storage

Persistent storage for flow definitions with versioning:

```typescript
const flowDefinitionResource = makeResource('flow-definitions', {
  collection: 'flow_definitions',
  versioning: true,
  indexes: [
    { flowId: 1, version: -1 },
    { createdAt: 1 }
  ]
})
```

## Usage Examples

### Basic Server Flow Setup

```typescript
import { makeServerContext } from '@owlmeans/server-context'
import { makeServerFlowService, flowStateModule, flowTransitionModule } from '@owlmeans/server-flow'
import { parent } from '@owlmeans/module'

// Create server context
const context = makeServerContext(serverConfig)

// Create and register flow service
const flowService = makeServerFlowService('main-flow')
context.registerService(flowService)

// Register flow API modules
context.registerModule(flowStateModule)
context.registerModule(flowTransitionModule)

// Initialize context
await context.configure().init()
```

### Flow Definition Management

```typescript
// Define a multi-step user onboarding flow
const onboardingFlow: Flow = {
  flow: 'user-onboarding',
  initialStep: 'welcome',
  steps: {
    welcome: {
      index: 0,
      step: 'welcome',
      service: 'onboarding',
      module: 'welcome-screen',
      transitions: {
        start: { transition: 'start', step: 'profile-setup' }
      }
    },
    'profile-setup': {
      index: 1,
      step: 'profile-setup',
      service: 'onboarding',
      module: 'profile-form',
      transitions: {
        continue: { transition: 'continue', step: 'preferences' },
        skip: { transition: 'skip', step: 'verification' }
      }
    },
    preferences: {
      index: 2,
      step: 'preferences',
      service: 'onboarding',
      module: 'preferences-form',
      transitions: {
        save: { transition: 'save', step: 'verification' }
      }
    },
    verification: {
      index: 3,
      step: 'verification',
      service: 'onboarding',
      module: 'email-verification',
      transitions: {
        complete: { transition: 'complete', step: 'completed' }
      }
    },
    completed: {
      index: 4,
      step: 'completed',
      service: 'onboarding',
      module: 'onboarding-complete',
      transitions: {}
    }
  },
  config: {
    services: {
      onboarding: 'user-service'
    },
    modules: {
      'welcome-screen': 'onboarding-welcome',
      'profile-form': 'onboarding-profile',
      'preferences-form': 'onboarding-preferences',
      'email-verification': 'onboarding-verification',
      'onboarding-complete': 'onboarding-complete'
    }
  },
  prefabs: {}
}

// Create the flow on the server
await flowService.createFlow(onboardingFlow)
```

### Flow State Management

```typescript
// Handle user flow progression
const handleUserOnboarding = async (userId: string, action: string, payload?: any) => {
  try {
    // Get current flow state
    let currentState = await flowService.getFlowState(userId, 'user-onboarding')
    
    // Initialize flow if not started
    if (!currentState) {
      currentState = await flowService.resetFlow(userId, 'user-onboarding')
    }
    
    // Execute transition based on user action
    const newState = await flowService.executeTransition(
      userId,
      'user-onboarding',
      action,
      payload
    )
    
    console.log(`User ${userId} moved from ${currentState.step} to ${newState.step}`)
    
    // Check if flow is completed
    if (newState.step === 'completed') {
      console.log(`User ${userId} completed onboarding`)
      await sendWelcomeEmail(userId)
    }
    
    return newState
  } catch (error) {
    console.error('Flow progression error:', error)
    throw error
  }
}
```

### Cross-service Flow Coordination

```typescript
// Register flow handlers across different services
const registerFlowHandlers = async () => {
  // User service handles profile-related steps
  const userServiceFlow = makeServerFlowService('user-flow')
  userServiceContext.registerService(userServiceFlow)
  
  // Notification service handles communication steps  
  const notificationServiceFlow = makeServerFlowService('notification-flow')
  notificationServiceContext.registerService(notificationServiceFlow)
  
  // Payment service handles billing steps
  const paymentServiceFlow = makeServerFlowService('payment-flow')
  paymentServiceContext.registerService(paymentServiceFlow)
}
```

### Flow Monitoring and Analytics

```typescript
// Monitor flow performance and usage
const monitorFlows = async () => {
  const stats = await flowService.getFlowStatistics()
  
  console.log(`Active flows: ${stats.totalFlows}`)
  console.log(`Completion rate: ${stats.completionRate}%`)
  console.log(`Average duration: ${stats.averageFlowDuration}ms`)
  
  // Alert on high error rates
  if (stats.errorRate > 0.05) {
    await sendAlert(`High flow error rate: ${stats.errorRate}`)
  }
  
  // Log popular steps for optimization
  stats.popularSteps.forEach(step => {
    console.log(`Step ${step.step}: ${step.count} executions`)
  })
}

// Cleanup expired flows
const cleanupFlows = async () => {
  const purgedCount = await flowService.purgeExpiredFlows()
  console.log(`Purged ${purgedCount} expired flows`)
}
```

### WebSocket Flow Integration

```typescript
import { makeSocketService } from '@owlmeans/server-socket'

// Real-time flow state updates via WebSocket
const socketService = makeSocketService('flow-socket')

socketService.on('flow-transition', async (socket, data) => {
  const { flowId, transition, payload } = data
  const userId = socket.userId
  
  try {
    const newState = await flowService.executeTransition(userId, flowId, transition, payload)
    
    // Broadcast state update to user's connected clients
    socket.emit('flow-state-updated', newState)
    
    // Notify other services if needed
    await notifyServices('flow-updated', { userId, flowId, state: newState })
  } catch (error) {
    socket.emit('flow-error', { error: error.message })
  }
})
```

## Error Handling

The package integrates with OwlMeans error handling system and provides flow-specific error types:

### Flow-specific Errors

```typescript
import { ResilientError } from '@owlmeans/error'

// Flow not found error
export class FlowNotFoundError extends ResilientError {
  constructor(flowId: string) {
    super('FLOW_NOT_FOUND', `Flow ${flowId} not found`, { flowId })
  }
}

// Invalid transition error
export class InvalidTransitionError extends ResilientError {
  constructor(fromStep: string, transition: string) {
    super('INVALID_TRANSITION', `Invalid transition ${transition} from step ${fromStep}`, {
      fromStep, transition
    })
  }
}

// Flow state corruption error
export class FlowStateCorruptionError extends ResilientError {
  constructor(userId: string, flowId: string, details: string) {
    super('FLOW_STATE_CORRUPTION', `Flow state corrupted for user ${userId}, flow ${flowId}: ${details}`, {
      userId, flowId, details
    })
  }
}
```

### Error Recovery

```typescript
// Automatic error recovery and flow state repair
const recoverFlowState = async (userId: string, flowId: string) => {
  try {
    // Attempt to recover from flow history
    const history = await flowService.getFlowHistory(userId, flowId)
    if (history.length > 0) {
      const lastValidState = history[history.length - 1]
      await flowService.setFlowState(userId, {
        flow: flowId,
        step: lastValidState.toStep,
        service: lastValidState.metadata?.service || 'default',
        ok: true
      })
    } else {
      // Reset to initial step
      await flowService.resetFlow(userId, flowId)
    }
  } catch (error) {
    console.error('Flow recovery failed:', error)
    throw new FlowStateCorruptionError(userId, flowId, error.message)
  }
}
```

## Performance Optimization

### Caching Strategy

```typescript
// Flow definition caching for performance
const flowCache = new Map<string, Flow>()

const getCachedFlow = async (flowId: string): Promise<Flow> => {
  if (flowCache.has(flowId)) {
    return flowCache.get(flowId)!
  }
  
  const flow = await loadFlowFromDatabase(flowId)
  flowCache.set(flowId, flow)
  
  // Cache expiration
  setTimeout(() => flowCache.delete(flowId), 300000) // 5 minutes
  
  return flow
}
```

### Batch Operations

```typescript
// Batch flow state updates for better performance
const batchUpdateFlowStates = async (updates: Array<{userId: string, state: FlowState}>) => {
  const operations = updates.map(update => ({
    updateOne: {
      filter: { userId: update.userId, flowId: update.state.flow },
      update: { $set: update.state },
      upsert: true
    }
  }))
  
  await flowStateCollection.bulkWrite(operations)
}
```

## Security Considerations

### Authentication and Authorization

```typescript
// Secure flow operations with authentication
const secureFlowTransition = async (req: AuthenticatedRequest, flowId: string, transition: string) => {
  // Verify user authentication
  if (!req.auth?.userId) {
    throw new Error('Authentication required')
  }
  
  // Check flow access permissions
  const hasAccess = await checkFlowPermissions(req.auth.userId, flowId)
  if (!hasAccess) {
    throw new Error('Insufficient permissions')
  }
  
  // Validate transition is allowed from current state
  const currentState = await flowService.getFlowState(req.auth.userId, flowId)
  if (!isTransitionAllowed(currentState, transition)) {
    throw new InvalidTransitionError(currentState.step, transition)
  }
  
  return flowService.executeTransition(req.auth.userId, flowId, transition)
}
```

### Data Protection

```typescript
// Encrypt sensitive flow payload data
const encryptFlowPayload = (payload: FlowPayload): string => {
  // Use OwlMeans encryption utilities
  return encrypt(JSON.stringify(payload), process.env.FLOW_ENCRYPTION_KEY)
}

const decryptFlowPayload = (encryptedPayload: string): FlowPayload => {
  const decrypted = decrypt(encryptedPayload, process.env.FLOW_ENCRYPTION_KEY)
  return JSON.parse(decrypted)
}
```

## Integration with OwlMeans Ecosystem

### Context Integration
```typescript
import { makeServerContext } from '@owlmeans/server-context'

const context = makeServerContext(config)
const flowService = context.service<ServerFlowService>('flow')
```

### Module System Integration
```typescript
import { module, guard, filter } from '@owlmeans/module'
import { route } from '@owlmeans/route'

// Flow API endpoints as modules
const flowModule = module(route('flow-api', '/api/flows/:flowId'), {
  guards: ['authenticated'],
  filter: params({ flowId: { type: 'string' } })
})
```

### Resource System Integration
```typescript
import { makeResource } from '@owlmeans/resource'

// Flow state persistence via resource system
const flowResource = makeResource('flow-states', {
  // Resource configuration
})
```

## Best Practices

1. **Flow Design**: Keep flows simple and focused on specific user journeys
2. **State Management**: Always validate flow state before transitions
3. **Error Handling**: Implement comprehensive error recovery mechanisms
4. **Performance**: Use caching for frequently accessed flow definitions
5. **Security**: Always authenticate and authorize flow operations
6. **Monitoring**: Implement flow analytics and performance monitoring
7. **Testing**: Test all flow paths including error scenarios

## Related Packages

- **@owlmeans/flow**: Core flow functionality and types
- **@owlmeans/client-flow**: Client-side flow implementation
- **@owlmeans/web-flow**: Web-specific flow implementation  
- **@owlmeans/server-context**: Server context management
- **@owlmeans/server-module**: Server module system
- **@owlmeans/auth**: Authentication and authorization
- **@owlmeans/resource**: Resource management and persistence

## TypeScript Support

This package is written in TypeScript and provides full type safety:

```typescript
import type { ServerFlowService, FlowState, FlowStatistics } from '@owlmeans/server-flow'

interface CustomFlowPayload {
  userId: string
  preferences: UserPreferences
  completed: boolean
}

const flowService: ServerFlowService = context.service('flow')
const state: FlowState = await flowService.getFlowState(userId, flowId)
```