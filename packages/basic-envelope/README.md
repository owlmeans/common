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

### Types

#### `Envelope`
Core envelope structure containing message and metadata.

```typescript
interface Envelope {
  t: string           // Type identifier
  msg: string         // Base64-encoded message content
  sig?: string        // Optional cryptographic signature
  dt: number          // Creation timestamp (milliseconds)
  ttl: number | null  // Time-to-live in milliseconds (null = no expiration)
}
```

#### `EnvelopeModel<T>`
Model interface providing envelope operations and message handling.

```typescript
interface EnvelopeModel<T extends {} | string = string> {
  envelope: Envelope
  
  // Methods
  send: <M extends T>(msg: M, ttl?: number | null) => EnvelopeModel
  wrap: () => string
  tokenize: () => string
  message: <M extends T>(preserve?: boolean) => M
  type: () => string
  sign: (key: KeyPairModel, kind?: EnvelopeKind) => Promise<string>
  verify: (key: KeyPairModel) => Promise<boolean>
}
```

**Methods:**
- **`send<M>(msg: M, ttl?: number | null): EnvelopeModel`**: Sets message content and optional TTL
- **`wrap(): string`**: Returns base64-encoded JSON representation
- **`tokenize(): string`**: Returns compact tokenized format
- **`message<M>(preserve?: boolean): M`**: Extracts message content (preserve=true returns raw string)
- **`type(): string`**: Returns envelope type identifier
- **`sign(key: KeyPairModel, kind?: EnvelopeKind): Promise<string>`**: Signs envelope and returns specified format
- **`verify(key: KeyPairModel): Promise<boolean>`**: Verifies envelope signature and TTL

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

### Constants

#### `EnvelopeKind`
Enumeration of serialization formats.

```typescript
enum EnvelopeKind {
  Wrap = 'wrap',    // Base64-encoded JSON format
  Token = 'token'   // Compact tokenized format
}
```

#### `DEFAULT_TTL`
Default time-to-live for envelopes.

```typescript
const DEFAULT_TTL = 5 * 60 * 1000  // 5 minutes in milliseconds
```

### CLI Tool

The package includes a command-line tool `owlkeys` for envelope operations:

```bash
npx owlkeys --help
```

## Usage Examples

### Basic Message Envelope

```typescript
import { makeEnvelopeModel } from '@owlmeans/basic-envelope'

// Create envelope for a simple message
const envelope = makeEnvelopeModel<string>('notification')
envelope.send('Hello, World!', 60000) // 1 minute TTL

// Get message content
const message = envelope.message<string>()
console.log(message) // "Hello, World!"

// Get envelope type
console.log(envelope.type()) // "notification"
```

### Object Message with Custom TTL

```typescript
interface ApiRequest {
  method: string
  endpoint: string
  data: any
}

const envelope = makeEnvelopeModel<ApiRequest>('api-request')
envelope.send({
  method: 'POST',
  endpoint: '/users',
  data: { name: 'Alice', email: 'alice@example.com' }
}, 30000) // 30 seconds TTL

// Serialize for transmission
const wrapped = envelope.wrap()
console.log(wrapped) // Base64-encoded JSON string
```

### Cryptographic Signing

```typescript
import { makeEnvelopeModel, EnvelopeKind } from '@owlmeans/basic-envelope'
import { makeKeyPair } from '@owlmeans/basic-keys'

// Create key pair for signing
const keyPair = await makeKeyPair()

// Create and sign envelope
const envelope = makeEnvelopeModel('secure-message')
envelope.send('Confidential data', null) // No expiration

// Sign and get tokenized format
const signedToken = await envelope.sign(keyPair, EnvelopeKind.Token)
console.log(signedToken) // Signed tokenized representation

// Later: verify the envelope
const isValid = await envelope.verify(keyPair)
console.log(isValid) // true if signature and TTL are valid
```

### Deserializing Existing Envelopes

```typescript
import { makeEnvelopeModel, EnvelopeKind } from '@owlmeans/basic-envelope'

// Deserialize from wrapped format
const wrappedData = "eyJ0IjoibXktbWVzc2FnZSIsIm1zZyI6Ik..." // Base64 data
const envelope = makeEnvelopeModel<string>(wrappedData, EnvelopeKind.Wrap)

// Extract message
const message = envelope.message<string>()
console.log(`Type: ${envelope.type()}, Message: ${message}`)

// Check if still valid (not expired)
if (envelope.envelope.ttl !== null) {
  const isExpired = envelope.envelope.dt + envelope.envelope.ttl < Date.now()
  console.log(`Expired: ${isExpired}`)
}
```

### Message Preservation

```typescript
// When you need the raw message string without JSON parsing
const envelope = makeEnvelopeModel<string>('raw-data')
envelope.send('{"json": "string"}')

// Get parsed object (default behavior)
const parsed = envelope.message() // Returns parsed JSON object

// Get raw string (preserve=true)
const raw = envelope.message(true) // Returns "{"json": "string"}"
```

### TTL and Expiration

```typescript
import { DEFAULT_TTL } from '@owlmeans/basic-envelope'

const envelope = makeEnvelopeModel('temporary-data')

// Use default TTL (5 minutes)
envelope.send('Data with default TTL', DEFAULT_TTL)

// No expiration
envelope.send('Permanent data', null)

// Custom TTL (1 hour)
envelope.send('Hourly data', 60 * 60 * 1000)

// Check expiration during verification
const keyPair = await makeKeyPair()
await envelope.sign(keyPair)

// Verification automatically checks TTL
const isValid = await envelope.verify(keyPair)
// Returns false if envelope has expired
```

## Integration with OwlMeans Ecosystem

The basic-envelope package integrates with other OwlMeans packages:

- **@owlmeans/basic-keys**: Provides KeyPairModel for cryptographic operations
- **@owlmeans/auth**: Can be used for secure authentication token generation
- **@owlmeans/client** and **@owlmeans/server**: For secure inter-service communication

## Security Considerations

### TTL Validation
Always validate TTL during verification to prevent replay attacks:

```typescript
const isValid = await envelope.verify(keyPair)
// Automatically checks both signature and TTL validity
```

### Key Management
Use proper key management practices:

```typescript
// Generate keys securely
const keyPair = await makeKeyPair()

// Store private keys securely
// Share public keys safely for verification
```

### Message Serialization
Be cautious with message content:

```typescript
// Avoid sensitive data in messages unless properly encrypted
const envelope = makeEnvelopeModel('public-data')
envelope.send(publicData) // Safe for transmission

// For sensitive data, consider additional encryption layers
```

## Error Handling

The package handles common error scenarios:

```typescript
try {
  // Invalid JSON in message will fall back to string
  const message = envelope.message<any>()
} catch (error) {
  console.error('Envelope processing error:', error)
}

// Verification failures
const isValid = await envelope.verify(invalidKey)
// Returns false instead of throwing (unless key operations fail)
```

## Performance Considerations

- **Message Size**: Base64 encoding increases size by ~33%
- **TTL Checking**: Verification includes timestamp validation overhead
- **Cryptographic Operations**: Signing/verification has computational cost
- **Memory Usage**: Large messages increase memory footprint

## Best Practices

1. **Use appropriate TTL values** for your use case
2. **Validate envelopes** before processing messages
3. **Handle expired envelopes** gracefully
4. **Use type parameters** for better TypeScript support
5. **Choose appropriate serialization format** (wrap vs token) based on transmission needs

## Package Structure

Following OwlMeans Common library structure:

- **types**: TypeScript interfaces and type definitions
- **model**: Factory functions for creating envelope models
- **consts**: Constants and enumerations
- **utils/**: Internal utility functions for serialization