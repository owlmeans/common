# @owlmeans/queue

Queue management system for OwlMeans Common applications. This package provides a foundation for implementing message queues, task queues, and asynchronous processing systems in distributed OwlMeans applications.

## Overview

The `@owlmeans/queue` package serves as a base package for queue implementations in the OwlMeans ecosystem. While currently minimal, it is designed to provide:

- **Queue Abstractions**: Base interfaces and types for queue implementations
- **Task Management**: Foundation for asynchronous task processing
- **Message Queuing**: Infrastructure for message-based communication
- **Processing Pipelines**: Support for multi-stage processing workflows

This package follows the OwlMeans "quadra" pattern and is intended to be extended by specific queue implementations for different backends (Redis, RabbitMQ, AWS SQS, etc.).

## Installation

```bash
npm install @owlmeans/queue
```

## Status

This package is currently in development and provides foundational types and interfaces for queue systems. Specific implementations will be available in future releases or as separate packages.

## Planned Features

### Queue Types
- **FIFO Queues**: First-in-first-out message processing
- **Priority Queues**: Priority-based message processing
- **Delay Queues**: Scheduled message delivery
- **Dead Letter Queues**: Failed message handling

### Processing Models
- **Worker Pools**: Concurrent message processing
- **Pipeline Processing**: Multi-stage message transformation
- **Batch Processing**: Efficient bulk message handling
- **Retry Mechanisms**: Automatic retry with backoff strategies

### Integration Points
- **Resource Integration**: Integration with OwlMeans resource system
- **Context Management**: Queue services within OwlMeans contexts
- **Authentication**: Secure queue access with OwlMeans auth system
- **Monitoring**: Queue metrics and health monitoring

## Future API Design

The package will likely provide interfaces similar to:

```typescript
// Planned interfaces (not yet implemented)
interface QueueService<T = any> extends InitializedService {
  enqueue: (message: T, options?: QueueOptions) => Promise<string>
  dequeue: (options?: DequeueOptions) => Promise<QueueMessage<T> | null>
  peek: (count?: number) => Promise<QueueMessage<T>[]>
  size: () => Promise<number>
  purge: () => Promise<number>
}

interface QueueMessage<T = any> {
  id: string
  payload: T
  timestamp: Date
  attempts: number
  priority?: number
}

interface QueueOptions {
  delay?: number
  priority?: number
  maxRetries?: number
  ttl?: number
}
```

## Related Packages

While this package is in development, consider these related OwlMeans packages:

- **@owlmeans/redis**: Redis integration for Redis-based queue implementations
- **@owlmeans/mongo**: MongoDB integration for persistent queue storage
- **@owlmeans/resource**: Base resource system for queue service integration
- **@owlmeans/context**: Context management for queue services

## Contributing

This package is part of the OwlMeans Common ecosystem. Contributions for queue implementations and features are welcome. Please refer to the main repository for contribution guidelines.

## Development

If you need queue functionality immediately, consider:

1. **Redis Queues**: Use `@owlmeans/redis` for Redis-based queue implementations
2. **Custom Implementation**: Extend this package with your specific queue backend
3. **Third-party Integration**: Integrate existing queue libraries with OwlMeans context system

## License

See the LICENSE file in the repository root for license information.