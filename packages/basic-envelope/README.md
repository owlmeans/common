# @owlmeans/basic-envelope

A lightweight cryptographic message envelope library for OwlMeans Common applications. This package provides secure message wrapping, signing, and verification capabilities using Ed25519 cryptographic signatures, designed as an alternative to JWT/JWE tokens with enhanced security and simplicity.

## Overview

The `@owlmeans/basic-envelope` package enables secure message transmission and storage by providing:

- **Message Envelopes**: Lightweight containers for messages with built-in expiration and type identification
- **Cryptographic Signing**: Ed25519 signature support for message authentication and integrity
- **Flexible Serialization**: Multiple output formats including wrapped strings and tokenized representations
- **TTL Support**: Time-to-live functionality for automatic message expiration
- **Type Safety**: Full TypeScript support with generic message types

This package is particularly useful for creating secure authentication tokens, signed API requests, and encrypted inter-service communication.

## Installation

```bash
npm install @owlmeans/basic-envelope
```

## Core Concepts

### Envelope Structure

An envelope is a container that wraps a message with metadata including:
- **Type identifier**: Categorizes the message purpose
- **Message payload**: The actual data (string or object)
- **Signature**: Optional cryptographic signature for verification
- **Timestamp**: Creation time for ordering and TTL calculations
- **TTL**: Time-to-live for automatic expiration

### Envelope Kinds

The package supports different serialization formats:
- **Wrap**: Base64-encoded JSON representation
- **Token**: Compact tokenized format for transmission

## API Reference

### Factory Functions

The package uses factory functions for object creation following OwlMeans Common conventions:

#### `makeEnvelopeModel<T>(type, kind?): EnvelopeModel<T>`

Creates an envelope model for wrapping and managing messages with cryptographic capabilities.

```typescript
import { makeEnvelopeModel, EnvelopeKind } from '@owlmeans/basic-envelope'

// Create a new envelope
const envelope = makeEnvelopeModel<UserData>('user-session')

// Create from existing wrapped envelope
const wrappedEnvelope = makeEnvelopeModel('eyJ0IjoiZXhhbXBsZSIsLi4u', EnvelopeKind.Wrap)

// Create from tokenized envelope
const tokenizedEnvelope = makeEnvelopeModel('example:msg:signature', EnvelopeKind.Token)
```

**Parameters:**
- `type`: string - Type identifier for new envelopes, or serialized envelope for reconstruction
- `kind`: EnvelopeKind (optional) - Specifies format when reconstructing from serialized data

**Returns:** EnvelopeModel<T> instance with methods for message management and cryptographic operations

**Generic Type Parameter:**
- `T`: Type of the message payload (defaults to string)

### Core Interfaces

#### `Envelope`
Core envelope structure containing message and metadata.

```typescript
interface Envelope {
  t: string           // Type identifier for categorizing messages
  msg: string         // Base64-encoded message content
  sig?: string        // Optional cryptographic signature
  dt: number          // Creation timestamp (milliseconds)
  ttl: number | null  // Time-to-live in milliseconds (null = no expiration)
}
```

**Properties:**
- `t`: Message type identifier used for categorization and routing  
- `msg`: Base64-encoded message payload (automatically encoded by envelope methods)
- `sig`: Optional Ed25519 signature for message authentication and integrity verification
- `dt`: Creation timestamp used for ordering and TTL calculations (milliseconds since epoch)
- `ttl`: Time-to-live for automatic expiration, null indicates no expiration

#### `EnvelopeModel<T>`
Factory-created envelope manager providing comprehensive message operations and cryptographic functions.

```typescript
interface EnvelopeModel<T extends {} | string = string> {
  envelope: Envelope
  
  // Message management methods
  send<M extends T>(msg: M, ttl?: number | null): EnvelopeModel
  message<M extends T>(preserve?: boolean): M
  type(): string
  
  // Serialization methods
  wrap(): string
  tokenize(): string
  
  // Cryptographic methods
  sign(key: KeyPairModel, kind?: EnvelopeKind): Promise<string>
  verify(key: KeyPairModel): Promise<boolean>
}
```

### EnvelopeModel Methods Reference

#### Message Management Methods

**`send<M extends T>(msg: M, ttl?: number | null): EnvelopeModel`**

Sets the message content and optional TTL, with automatic encoding based on message type.

```typescript
// Send a string message
envelope.send('Hello, World!')

// Send an object with 1-hour TTL
envelope.send({ userId: '123', action: 'login' }, 3600000)

// Send with no expiration
envelope.send(messageData, null)
```

- **Purpose**: Encodes and stores message data in the envelope with optional expiration
- **Behavior**: 
  - String messages are stored directly
  - Objects are JSON-serialized then Base64-encoded automatically
  - Updates TTL if provided, maintains existing TTL if not specified
- **Parameters**:
  - `msg: M`: Message payload extending type T
  - `ttl?: number | null`: Time-to-live in milliseconds, null for no expiration
- **Returns**: The same EnvelopeModel instance for method chaining
- **Throws**: No exceptions - handles all message types gracefully

**`message<M extends T>(preserve?: boolean): M`**

Retrieves and decodes the message content from the envelope.

```typescript
// Get decoded object message
const userData = envelope.message<UserData>()

// Get raw string message without decoding
const rawMessage = envelope.message<string>(true)
```

- **Purpose**: Extracts the original message from the envelope with configurable decoding
- **Behavior**:
  - Default (`preserve` false): Attempts JSON parsing followed by Base64 decoding
  - Preserve mode (`preserve` true): Returns raw message string without processing
  - Gracefully falls back to string if JSON parsing fails
- **Parameters**:
  - `preserve?: boolean`: If true, returns raw message without decoding
- **Returns**: Decoded message of type M
- **Error Handling**: Silent fallback to string type on decode errors

**`type(): string`**

Returns the type identifier of the envelope for message categorization.

```typescript
const messageType = envelope.type() // e.g., 'user-session'
```

- **Purpose**: Provides access to the envelope's type identifier
- **Returns**: String identifier used for message routing and categorization
- **Use Cases**: Message dispatching, route determination, debugging

#### Serialization Methods

**`wrap(): string`**

Serializes the envelope to a Base64-encoded JSON string for secure transmission.

```typescript
const wrappedEnvelope = envelope.wrap()
// Returns: "eyJ0IjoiZXhhbXBsZSIsIm1zZyI6IkhlbGxvIiwiZHQiOjE2Mzk..."

// Can be reconstructed later
const restored = makeEnvelopeModel(wrappedEnvelope, EnvelopeKind.Wrap)
```

- **Purpose**: Creates a wrapped representation suitable for storage or secure transmission
- **Behavior**: JSON-serializes the complete envelope then Base64-encodes the result
- **Returns**: Base64-encoded envelope string
- **Use Cases**: Database storage, HTTP headers, secure URL parameters
- **Security**: Preserves all envelope data including signatures

**`tokenize(): string`**

Creates a compact token format for efficient transmission and parsing.

```typescript
const token = envelope.tokenize()
// Returns: "user-session:SGVsbG8gV29ybGQ:signature_if_present"

// Reconstruct from token
const restored = makeEnvelopeModel(token, EnvelopeKind.Token)
```

- **Purpose**: Creates a human-readable, compact token representation
- **Behavior**: Combines type, message, and signature with colon separators
- **Format**: `type:base64_message:signature` (signature omitted if not present)
- **Returns**: Compact token string
- **Use Cases**: API tokens, authentication headers, URL fragments, debugging
- **Advantages**: Easily parseable, more compact than wrapped format

#### Cryptographic Methods

**`sign(key: KeyPairModel, kind?: EnvelopeKind): Promise<string>`**

Signs the envelope with Ed25519 cryptographic signature for authentication and integrity.

```typescript
import { makeKeyPairModel } from '@owlmeans/basic-keys'

const keyPair = makeKeyPairModel()
await keyPair.generate()

// Sign and get signature only
const signature = await envelope.sign(keyPair)

// Sign and get wrapped envelope
const signedWrapped = await envelope.sign(keyPair, EnvelopeKind.Wrap)

// Sign and get tokenized envelope  
const signedToken = await envelope.sign(keyPair, EnvelopeKind.Token)
```

- **Purpose**: Provides cryptographic authentication and tamper-detection
- **Behavior**:
  - Creates Ed25519 signature of envelope data (excluding existing signature field)
  - Stores signature in `envelope.sig` property for future verification
  - Returns formatted output based on `kind` parameter
- **Parameters**:
  - `key: KeyPairModel`: Ed25519 key pair instance for signing
  - `kind?: EnvelopeKind`: Output format - Wrap, Token, or raw signature (default)
- **Returns**: Promise resolving to signature string or formatted envelope
- **Security**: Uses industry-standard Ed25519 signatures for cryptographic authenticity
- **Error Handling**: Propagates key pair errors (e.g., missing private key)

**`verify(key: KeyPairModel): Promise<boolean>`**

Verifies envelope signature and validates TTL expiration for complete authenticity check.

```typescript
// Verify signature and TTL
const isValid = await envelope.verify(keyPair)

if (isValid) {
  console.log('Envelope is authentic and not expired')
  // Safe to process message
} else {
  console.log('Envelope is invalid or expired - reject')
  // Handle invalid envelope
}
```

- **Purpose**: Validates both cryptographic authenticity and temporal freshness
- **Behavior**:
  - Returns `false` immediately if no signature is present
  - Checks TTL expiration if TTL is set (compares `dt + ttl` with current time)
  - Verifies Ed25519 signature against envelope data (excluding signature field)
  - All conditions must pass for `true` result
- **Parameters**:
  - `key: KeyPairModel`: Key pair instance with public key for verification
- **Returns**: Promise resolving to boolean validation result
- **Security**: Combines cryptographic verification with temporal validation
- **Use Cases**: Authentication token validation, message integrity checking

### Factory Functions

#### `makeEnvelopeModel<T>(type: string, kind?: EnvelopeKind): EnvelopeModel<T>`

Creates a new envelope model instance.

**Parameters:**
- `type`: Type identifier for the envelope
- `kind`: Optional kind for deserializing existing envelopes

**Returns:** EnvelopeModel instance

**Example:**
```typescript
import { makeEnvelopeModel } from '@owlmeans/basic-envelope'

// Create new envelope
const envelope = makeEnvelopeModel<UserData>('user-profile')

// Send message
envelope.send({ userId: '123', name: 'John' }, 300000) // 5 minutes TTL

// Get wrapped representation
const wrapped = envelope.wrap()
```

### Constants and Enums

#### `EnvelopeKind`
Enumeration defining available envelope serialization formats.

```typescript
enum EnvelopeKind {
  Wrap = 'wrap',      // Base64-encoded JSON format - secure, complete data preservation
  Token = 'token'     // Compact colon-separated format - human-readable, efficient
}
```

**Usage Guidelines:**
- Use `Wrap` for secure storage, HTTP headers, or when preserving all metadata is critical
- Use `Token` for API tokens, URLs, or when human readability and compactness are important

#### `DEFAULT_TTL`
Default time-to-live value applied to new envelopes.

```typescript
const DEFAULT_TTL = 5 * 60 * 1000  // 5 minutes in milliseconds
```

**Behavior**: Applied automatically when creating new envelopes unless explicitly overridden

## Error Handling

The basic-envelope package follows OwlMeans Common error handling patterns and integrates with cryptographic operations that may throw errors.

### Common Error Scenarios

#### Key-Related Errors
```typescript
import { makeKeyPairModel } from '@owlmeans/basic-keys'

try {
  const keyPair = makeKeyPairModel()
  // Error: Attempting to sign without generating keys
  await envelope.sign(keyPair)
} catch (error) {
  console.error('Key operation failed:', error.message)
  // Handle missing private key or key generation errors
}
```

#### TTL Validation Errors
```typescript
// Expired envelope verification
const expiredEnvelope = makeEnvelopeModel('expired-message')
expiredEnvelope.send('data', 1) // 1ms TTL
await new Promise(resolve => setTimeout(resolve, 10)) // Wait for expiration

const isValid = await expiredEnvelope.verify(keyPair)
// Returns false - envelope has expired
```

#### Malformed Data Errors
```typescript
try {
  // Invalid wrapped data
  const malformed = makeEnvelopeModel('invalid-base64', EnvelopeKind.Wrap)
} catch (error) {
  console.error('Failed to parse envelope:', error.message)
}
```

### Error Types and Handling

The package gracefully handles various error conditions:

1. **Silent Fallbacks**: Message decoding errors fall back to string representation
2. **Validation Failures**: Verification methods return `false` rather than throwing
3. **Key Errors**: Cryptographic errors are propagated from the key pair implementation
4. **Parse Errors**: Malformed envelope data results in constructor exceptions

## Advanced Usage Examples

### Authentication Token System
```typescript
import { makeEnvelopeModel, EnvelopeKind } from '@owlmeans/basic-envelope'
import { makeKeyPairModel } from '@owlmeans/basic-keys'

// Setup authentication system
const authKeys = makeKeyPairModel()
await authKeys.generate()

// Create authentication token
const sessionEnvelope = makeEnvelopeModel<SessionData>('user-session')
const sessionData = {
  userId: 'user123',
  permissions: ['read', 'write'],
  loginTime: Date.now()
}

// Sign and create token with 1-hour expiration
const authToken = await sessionEnvelope
  .send(sessionData, 3600000)
  .sign(authKeys, EnvelopeKind.Token)

console.log('Auth token:', authToken)
// user-session:eyJ1c2VySWQ...base64...:signature

// Later: verify token
const receivedEnvelope = makeEnvelopeModel(authToken, EnvelopeKind.Token)
const isValidToken = await receivedEnvelope.verify(authKeys)

if (isValidToken) {
  const session = receivedEnvelope.message<SessionData>()
  console.log('Valid session for user:', session.userId)
} else {
  console.log('Invalid or expired token')
}
```

### Secure Message Transmission
```typescript
// Sender side
const messageEnvelope = makeEnvelopeModel<ApiRequest>('api-request')
const apiRequest = {
  method: 'POST',
  endpoint: '/users',
  data: { name: 'John Doe', email: 'john@example.com' }
}

// Create signed message with 30-second TTL
const signedMessage = await messageEnvelope
  .send(apiRequest, 30000)
  .sign(senderKeys, EnvelopeKind.Wrap)

// Transmit wrapped message
await sendToServer(signedMessage)

// Receiver side
const receivedEnvelope = makeEnvelopeModel(signedMessage, EnvelopeKind.Wrap)

// Verify authenticity and freshness
if (await receivedEnvelope.verify(senderKeys)) {
  const request = receivedEnvelope.message<ApiRequest>()
  // Process authenticated API request
  console.log('Processing request:', request.method, request.endpoint)
} else {
  // Reject unauthenticated or expired request
  throw new Error('Invalid request signature or expired')
}
```

### Multi-Format Message Exchange
```typescript
// Create message once
const dataEnvelope = makeEnvelopeModel<UserProfile>('user-profile')
dataEnvelope.send({
  id: '123',
  name: 'Alice Smith',
  preferences: { theme: 'dark', notifications: true }
})

// Generate multiple formats for different use cases
const forDatabase = dataEnvelope.wrap()        // Secure storage
const forUrl = dataEnvelope.tokenize()         // URL transmission
const forHeaders = await dataEnvelope.sign(keys, EnvelopeKind.Wrap) // Signed secure

// Each format can be reconstructed to the same data
const fromDb = makeEnvelopeModel(forDatabase, EnvelopeKind.Wrap)
const fromUrl = makeEnvelopeModel(forUrl, EnvelopeKind.Token)
const fromHeaders = makeEnvelopeModel(forHeaders, EnvelopeKind.Wrap)

// All contain the same user profile data
console.log('Same data:', 
  fromDb.message<UserProfile>().id === 
  fromUrl.message<UserProfile>().id &&
  fromHeaders.message<UserProfile>().id
)
```

## Integration Patterns

### Express.js Middleware
```typescript
import express from 'express'
import { makeEnvelopeModel, EnvelopeKind } from '@owlmeans/basic-envelope'

// Authentication middleware using envelope tokens
const authenticateToken = (serverKeys) => async (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' })
  }

  try {
    const token = authHeader.substring(7)
    const envelope = makeEnvelopeModel(token, EnvelopeKind.Token)
    
    if (await envelope.verify(serverKeys)) {
      req.user = envelope.message()
      next()
    } else {
      res.status(401).json({ error: 'Invalid or expired token' })
    }
  } catch (error) {
    res.status(400).json({ error: 'Malformed token' })
  }
}

const app = express()
app.use('/api', authenticateToken(serverKeys))
```

### React Hook Integration
```typescript
import { useState, useEffect } from 'react'
import { makeEnvelopeModel, EnvelopeKind } from '@owlmeans/basic-envelope'

// Custom hook for secure message handling
function useSecureMessage<T>(initialMessage?: T) {
  const [envelope] = useState(() => makeEnvelopeModel<T>('react-state'))
  const [message, setMessage] = useState<T | null>(initialMessage || null)

  const updateMessage = (newMessage: T, ttl?: number) => {
    envelope.send(newMessage, ttl)
    setMessage(newMessage)
  }

  const getSecureToken = async (keys) => {
    return await envelope.sign(keys, EnvelopeKind.Token)
  }

  const verifyMessage = async (token: string, keys) => {
    try {
      const received = makeEnvelopeModel(token, EnvelopeKind.Token)
      if (await received.verify(keys)) {
        const data = received.message<T>()
        setMessage(data)
        return true
      }
    } catch (error) {
      console.error('Message verification failed:', error)
    }
    return false
  }

  return { message, updateMessage, getSecureToken, verifyMessage }
}
```

## Security Considerations

### Cryptographic Security
1. **Key Management**: Use `@owlmeans/basic-keys` for proper Ed25519 key generation and management
2. **Signature Verification**: Always verify signatures before processing messages in production
3. **TTL Usage**: Implement appropriate TTL values to prevent replay attacks
4. **Key Rotation**: Regularly rotate signing keys and update verification keys

### Data Protection
1. **Sensitive Data**: Avoid including sensitive data in message types or identifiers
2. **Message Encoding**: Automatic Base64 encoding provides basic obfuscation but not encryption
3. **Transmission Security**: Use HTTPS/TLS for envelope transmission over networks
4. **Storage Security**: Encrypt wrapped envelopes before database storage

### Validation Best Practices
1. **Input Validation**: Validate envelope data before processing messages
2. **Type Safety**: Use TypeScript generics for compile-time message type checking
3. **Error Handling**: Implement proper error handling for verification failures
4. **Audit Logging**: Log envelope verification results for security monitoring

## Performance Considerations

### Memory Usage
- **Large Messages**: Consider message size impact on memory usage
- **Batch Operations**: Process multiple envelopes efficiently rather than individually
- **Key Caching**: Cache key pairs to avoid repeated generation operations

### Serialization Performance
- **Format Selection**: Choose appropriate format (wrap vs token) based on use case
- **Compression**: Consider compression for large messages before envelope wrapping
- **JSON Parsing**: Message decoding involves JSON parsing - optimize for large objects

## Best Practices

1. **TTL Management**: Set appropriate TTL values based on use case security requirements
2. **Type Safety**: Always use TypeScript generics for compile-time message validation
3. **Error Handling**: Implement comprehensive error handling for all envelope operations
4. **Key Management**: Use proper key generation and storage practices from `@owlmeans/basic-keys`
5. **Format Selection**: Choose envelope format (wrap vs token) based on transmission requirements
6. **Verification**: Always verify envelopes in production environments before processing
7. **Logging**: Implement appropriate logging for debugging without exposing sensitive data

## Package Structure

Following OwlMeans Common library structure:

- **types**: TypeScript interfaces (`Envelope`, `EnvelopeModel`)
- **model**: Factory functions (`makeEnvelopeModel`)
- **consts**: Constants and enumerations (`EnvelopeKind`, `DEFAULT_TTL`)
- **helper**: Utility functions for envelope operations
- **utils**: Internal utilities for serialization and parsing

## Dependencies

This package depends on:
- `@owlmeans/basic-keys` - Ed25519 key pair management for cryptographic operations
- `@scure/base` - Base64 and UTF-8 encoding utilities
- `uuid` - UUID generation (if needed for message identification)

## Related Packages

- [`@owlmeans/basic-keys`](../basic-keys) - Cryptographic key management
- [`@owlmeans/auth`](../auth) - Authentication system integration
- [`@owlmeans/error`](../error) - Error handling system

