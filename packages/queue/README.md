# @owlmeans/queue

A foundational queue management system for OwlMeans Common applications. This package provides base interfaces and abstractions for implementing message queues, task queues, and asynchronous processing systems in distributed fullstack applications with a focus on security and proper queue management.

## Overview

The `@owlmeans/queue` package serves as the foundational layer for queue implementations in the OwlMeans ecosystem. It follows the OwlMeans "quadra" pattern where this common package contains shared abstractions that can be extended by:

- **Server implementations**: Backend queue processing and management
- **Client implementations**: Client-side queue interfaces and monitoring  
- **Web implementations**: Web-based queue management dashboards
- **Native implementations**: Mobile queue synchronization and offline support

## Installation

```bash
npm install @owlmeans/queue
```

## Key Concepts

### Queue Abstractions
Base interfaces and types that provide standardized queue functionality across different implementations and backends (Redis, RabbitMQ, AWS SQS, etc.).

### Message-based Architecture
Support for asynchronous, message-based communication patterns that enable loose coupling between microservices and scalable application architectures.

### OwlMeans Integration
Full integration with the OwlMeans Common library ecosystem including context management, authentication, resource management, and error handling.

## API Reference

*Note: This package currently provides foundational abstractions. Specific implementations are available in backend-specific packages.*

### Planned Core Interfaces

#### QueueService Interface
```typescript
interface QueueService<T = any> extends InitializedService {
  // Core queue operations
  enqueue: (message: T, options?: QueueOptions) => Promise<string>
  dequeue: (options?: DequeueOptions) => Promise<QueueMessage<T> | null>
  peek: (count?: number) => Promise<QueueMessage<T>[]>
  
  // Queue management
  size: () => Promise<number>
  purge: () => Promise<number>
  health: () => Promise<QueueHealth>
  
  // Batch operations
  enqueueBatch: (messages: T[], options?: QueueOptions) => Promise<string[]>
  dequeueBatch: (count: number, options?: DequeueOptions) => Promise<QueueMessage<T>[]>
}
```

#### QueueMessage Interface
```typescript
interface QueueMessage<T = any> {
  id: string                    // Unique message identifier
  payload: T                    // Message content
  timestamp: Date               // Enqueue timestamp
  attempts: number              // Processing attempt count
  priority?: number             // Message priority (higher = more important)
  delay?: number                // Delay before message becomes available
  ttl?: number                  // Time to live in milliseconds
  retry?: RetryConfig           // Retry configuration
  metadata?: Record<string, any> // Additional message metadata
}
```

#### QueueOptions Interface
```typescript
interface QueueOptions {
  delay?: number                // Delay before message becomes available (ms)
  priority?: number             // Message priority (0-100)
  maxRetries?: number           // Maximum retry attempts
  ttl?: number                  // Time to live (ms)
  deadLetterQueue?: string      // Dead letter queue name
  retryBackoff?: 'fixed' | 'exponential' | 'linear'
  retryDelay?: number           // Base retry delay (ms)
}
```

#### DequeueOptions Interface
```typescript
interface DequeueOptions {
  timeout?: number              // Polling timeout (ms)
  visibility?: number           // Message visibility timeout (ms)
  waitTime?: number            // Long polling wait time (ms)
}
```

### Queue Types

#### FIFO Queues
First-in-first-out message processing with guaranteed ordering.

```typescript
interface FifoQueueService<T> extends QueueService<T> {
  enforceOrder: boolean
  deduplication: boolean
}
```

#### Priority Queues
Priority-based message processing where higher priority messages are processed first.

```typescript
interface PriorityQueueService<T> extends QueueService<T> {
  setPriority: (messageId: string, priority: number) => Promise<void>
  getByPriority: (minPriority: number) => Promise<QueueMessage<T>[]>
}
```

#### Delay Queues
Scheduled message delivery with precise timing control.

```typescript
interface DelayQueueService<T> extends QueueService<T> {
  scheduleAt: (message: T, scheduleTime: Date, options?: QueueOptions) => Promise<string>
  scheduleIn: (message: T, delayMs: number, options?: QueueOptions) => Promise<string>
  cancelScheduled: (messageId: string) => Promise<boolean>
}
```

#### Dead Letter Queues
Failed message handling with automatic retry and dead letter routing.

```typescript
interface DeadLetterQueueService<T> extends QueueService<T> {
  deadLetterQueue: string
  reprocessDeadLetter: (messageId: string) => Promise<void>
  getDeadLetters: () => Promise<QueueMessage<T>[]>
}
```

### Processing Models

#### Worker Pool Configuration
```typescript
interface WorkerPoolConfig {
  concurrency: number           // Number of concurrent workers
  maxJobs?: number             // Maximum jobs per worker
  retryDelay?: number          // Delay between retries (ms)
  stalledInterval?: number     // Stalled job check interval (ms)
  maxStalledCount?: number     // Maximum stalled count before job fails
}
```

#### Batch Processing
```typescript
interface BatchProcessor<T, R> {
  process: (messages: QueueMessage<T>[]) => Promise<R[]>
  batchSize: number
  flushInterval?: number        // Auto-flush interval (ms)
}
```

### Queue Health and Monitoring

#### QueueHealth Interface
```typescript
interface QueueHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  pending: number               // Number of pending messages
  processing: number            // Number of messages being processed
  failed: number               // Number of failed messages
  completed: number            // Number of completed messages
  lastActivity: Date           // Last queue activity timestamp
  metrics: QueueMetrics
}
```

#### QueueMetrics Interface
```typescript
interface QueueMetrics {
  throughput: {
    messagesPerSecond: number
    averageProcessingTime: number
  }
  errors: {
    errorRate: number
    lastError?: Error
    errorCount: number
  }
  capacity: {
    utilizationPercent: number
    maxCapacity?: number
  }
}
```

## Usage Examples

### Basic Queue Service Registration

```typescript
import { createService } from '@owlmeans/context'
import { QueueService } from '@owlmeans/queue'

// Register a queue service (implementation-specific)
const queueService = createService<QueueService>('message-queue', {
  // Implementation-specific configuration
  async enqueue(message, options) {
    // Implementation logic
  },
  
  async dequeue(options) {
    // Implementation logic
  }
}, (service) => async () => {
  // Service initialization
  service.initialized = true
})

context.registerService(queueService)
```

### Message Processing with Error Handling

```typescript
// Message processing with retry logic
const processMessages = async () => {
  try {
    const message = await queueService.dequeue({ timeout: 5000 })
    
    if (message) {
      try {
        await processMessage(message.payload)
        console.log(`Processed message ${message.id}`)
      } catch (error) {
        if (message.attempts < 3) {
          // Retry with exponential backoff
          await queueService.enqueue(message.payload, {
            delay: Math.pow(2, message.attempts) * 1000,
            maxRetries: 3
          })
        } else {
          // Send to dead letter queue
          console.error(`Message ${message.id} failed after max retries`)
        }
      }
    }
  } catch (error) {
    console.error('Queue processing error:', error)
  }
}
```

### Queue Health Monitoring

```typescript
// Monitor queue health
const monitorQueue = async () => {
  const health = await queueService.health()
  
  if (health.status === 'unhealthy') {
    console.error('Queue is unhealthy:', health.metrics)
    // Alert administrators or trigger auto-scaling
  }
  
  console.log(`Queue status: ${health.status}`)
  console.log(`Pending messages: ${health.pending}`)
  console.log(`Throughput: ${health.metrics.throughput.messagesPerSecond}/s`)
}
```

## Implementation Packages

This base package is extended by implementation-specific packages:

### Backend Implementations
- **@owlmeans/redis**: Redis-based queue implementation with persistence
- **@owlmeans/mongo**: MongoDB-based queue with document storage
- **@owlmeans/queue-memory**: In-memory queue for development and testing

### Client-side Implementations
- **@owlmeans/client-queue**: Client-side queue interfaces and state management
- **@owlmeans/web-queue**: Web-based queue management dashboard
- **@owlmeans/native-queue**: Mobile queue synchronization and offline support

## Integration with OwlMeans Ecosystem

### Context Integration
```typescript
import { makeBasicContext } from '@owlmeans/context'
import { QueueService } from '@owlmeans/queue'

const context = makeBasicContext(config)
const queueService = context.service<QueueService>('queue')
```

### Authentication and Security
Queue services integrate with OwlMeans authentication system to ensure secure message processing:

```typescript
// Authenticated queue operations
const authenticatedEnqueue = async (message: any, token: string) => {
  // Validation and authentication logic
  if (await validateToken(token)) {
    return queueService.enqueue(message)
  }
  throw new Error('Unauthorized queue access')
}
```

### Error Handling
Integration with OwlMeans error handling system:

```typescript
import { ResilientError } from '@owlmeans/error'

try {
  await queueService.enqueue(message)
} catch (error) {
  throw new ResilientError('QUEUE_ENQUEUE_FAILED', 'Failed to enqueue message', { 
    originalError: error,
    messageId: message.id 
  })
}
```

## Best Practices

1. **Message Idempotency**: Design message handlers to be idempotent to handle duplicate processing
2. **Error Handling**: Implement proper retry logic with exponential backoff
3. **Dead Letter Queues**: Use dead letter queues for failed messages that exceed retry limits
4. **Monitoring**: Implement queue health monitoring and alerting
5. **Capacity Planning**: Monitor queue depth and processing rates to plan capacity
6. **Security**: Always validate and authenticate queue operations in production

## Related Packages

- **@owlmeans/context**: Context management and service registration
- **@owlmeans/resource**: Base resource system for queue persistence
- **@owlmeans/auth**: Authentication and authorization
- **@owlmeans/error**: Error handling and resilient error management
- **@owlmeans/redis**: Redis-based queue implementation
- **@owlmeans/mongo**: MongoDB-based queue implementation

## Development Status

This package provides foundational abstractions for queue systems. For immediate queue functionality, use implementation-specific packages:

1. **Redis Queues**: `@owlmeans/redis` for production queue implementations
2. **Memory Queues**: `@owlmeans/queue-memory` for development and testing
3. **Custom Implementation**: Extend these interfaces for custom queue backends

## TypeScript Support

This package is written in TypeScript and provides full type safety for queue operations:

```typescript
import type { QueueService, QueueMessage, QueueOptions } from '@owlmeans/queue'

interface UserMessage {
  userId: string
  action: 'create' | 'update' | 'delete'
  data: Record<string, any>
}

const userQueue: QueueService<UserMessage> = context.service('user-queue')
```