# @owlmeans/server-auth

Server-side authentication service for OwlMeans Common applications. This package provides a comprehensive server authentication implementation with Ed25519 signature verification, token management, cache integration, and centralized authentication hub capabilities.

## Overview

The `@owlmeans/server-auth` package delivers server-side authentication functionality for the OwlMeans ecosystem, offering:

- **Authentication Service**: Server-side authentication with Ed25519 signature verification
- **Token Management**: Authentication token creation, validation, and lifecycle management
- **Guard Integration**: Seamless integration with OwlMeans module guard system
- **Cache Support**: Authentication state caching for performance optimization
- **Central Auth Hub**: Complete authentication manager application for centralized authentication
- **Trusted Entity Support**: Integration with trusted service authentication

This package follows the OwlMeans "quadra" pattern as a server-side implementation complementing `@owlmeans/auth-common` and working with client authentication packages.

## Installation

```bash
npm install @owlmeans/server-auth
```

## Dependencies

This package requires and integrates with:
- `@owlmeans/auth`: Core authentication types and validation
- `@owlmeans/auth-common`: Common authentication components
- `@owlmeans/basic-envelope`: Cryptographic message envelopes
- `@owlmeans/server-context`: Server context management
- `@owlmeans/basic-keys`: Cryptographic operations
- `@owlmeans/static-resource`: Resource management

## Core Concepts

### Authentication Service

The server authentication service handles token validation, signature verification, and authentication state management using Ed25519 cryptographic signatures.

### Token Verification

Implements secure token verification using envelope-based signatures and trusted entity validation, ensuring non-repudiable authentication.

### Central Auth Hub

Includes a complete authentication manager application that can serve as a centralized authentication hub for microservices architectures.

## API Reference

### Types

#### `AuthService`
Main server authentication service interface extending GuardService.

```typescript
interface AuthService extends GuardService {
  authenticate: (token: AuthToken) => Promise<AuthToken>
  unpack: (token: string) => Promise<Auth>
}
```

**Methods:**
- **`authenticate(token: AuthToken): Promise<AuthToken>`**: Validates and processes authentication token
- **`unpack(token: string): Promise<Auth>`**: Unpacks and verifies authentication token to extract Auth object

#### `AuthServiceAppend`
Interface for contexts that provide authentication service access.

```typescript
interface AuthServiceAppend {
  auth: () => AuthService
}
```

#### `AuthSpent`
Interface for authentication cache records.

```typescript
interface AuthSpent extends ResourceRecord {
  // Cache record for authentication state
}
```

### Factory Functions

#### `makeAuthService(alias?: string): AuthService`

Creates a server authentication service instance with signature verification capabilities.

**Parameters:**
- `alias` (optional): Service alias (default: `DEFAULT_ALIAS`)

**Returns:** AuthService instance

**Features:**
- Ed25519 signature verification
- Token unpacking and validation
- Cache integration for performance
- Trusted entity authentication

**Example:**
```typescript
import { makeAuthService } from '@owlmeans/server-auth'

const authService = makeAuthService('auth')

// Use as a guard service
const isAuthenticated = await authService.match(request)
if (isAuthenticated) {
  const result = await authService.handle(request, response)
}

// Authenticate tokens
const validatedToken = await authService.authenticate(authToken)

// Unpack tokens to Auth objects
const auth = await authService.unpack(bearerToken)
```

### Service Methods

#### `match(req: AbstractRequest): Promise<boolean>`

Checks if a request contains valid authentication token format.

**Parameters:**
- `req`: Request object to check for authentication

**Returns:** Promise resolving to boolean indicating if auth token is present

**Example:**
```typescript
const hasAuth = await authService.match(req)
if (hasAuth) {
  // Request has authentication token
}
```

#### `handle<T>(req: AbstractRequest, res: AbstractResponse<Auth>): Promise<T>`

Processes authentication request and validates the token signature.

**Parameters:**
- `req`: Request object with authentication token
- `res`: Response object to resolve with Auth data

**Returns:** Promise resolving to boolean indicating success

**Process:**
1. Extracts Ed25519 token from request
2. Creates envelope from token
3. Verifies signature against trusted entity
4. Resolves response with Auth object on success

**Example:**
```typescript
const success = await authService.handle(req, res)
if (success) {
  // Authentication successful, Auth data available in res
}
```

#### `authenticate(token: AuthToken): Promise<AuthToken>`

Validates and processes an authentication token.

**Parameters:**
- `token`: Authentication token to validate

**Returns:** Promise resolving to validated AuthToken

**Throws:** `AuthenFailed` if token validation fails

**Example:**
```typescript
try {
  const validToken = await authService.authenticate(userToken)
  // Token is valid and can be used
} catch (error) {
  if (error instanceof AuthenFailed) {
    // Handle authentication failure
  }
}
```

#### `unpack(token: string): Promise<Auth>`

Unpacks a bearer token string and extracts the Auth object.

**Parameters:**
- `token`: Bearer token string (e.g., "Bearer ed25519:...")

**Returns:** Promise resolving to Auth object

**Process:**
1. Splits bearer token to extract authorization part
2. Creates envelope from token
3. Verifies signature against trusted entity
4. Returns unpacked Auth object

**Example:**
```typescript
const bearerToken = "Bearer ed25519:eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
const auth = await authService.unpack(bearerToken)

console.log(auth.userId) // Access user information
console.log(auth.role)   // Access user role
```

### Constants

#### Authentication Constants

```typescript
const DEFAULT_ALIAS = 'auth'                    // Default service alias
const AUTH_CACHE = 'auth-cache'                 // Cache resource name
const AUTH_SRV_KEY = 'server-auth-key'          // Server key identifier
const AUTHEN_TIMEFRAME = 60 * 60 * 1000        // Authentication timeframe (1 hour)
```

### Modules

The package provides predefined authentication modules for server-side routing. These modules are automatically configured with proper validation schemas and authentication handlers.

```typescript
import { modules } from '@owlmeans/server-auth'

// Modules include server-side authentication endpoints
// with proper request/response validation
```

## Usage Examples

### Basic Server Authentication Setup

```typescript
import { makeAuthService } from '@owlmeans/server-auth'
import { makeServerContext } from '@owlmeans/server-context'

// Create server context
const context = makeServerContext({
  service: 'auth-server',
  type: AppType.Backend,
  layer: Layer.Service
})

// Create and register authentication service
const authService = makeAuthService('auth')
context.registerService(authService)

await context.configure().init()

// Service is now available for authentication
```

### Using as Module Guard

```typescript
import { guard } from '@owlmeans/module'

// Create module with authentication guard
const protectedModule = module(
  route('protected', '/api/protected'),
  guard('auth') // References the auth service
)

// The auth service will automatically validate tokens for this module
```

### Manual Token Validation

```typescript
const authService = makeAuthService()

// Validate incoming request
const isValid = await authService.match(req)
if (isValid) {
  const success = await authService.handle(req, res)
  if (success) {
    // Authentication successful
    const auth = res.value // Auth object
    console.log(`Authenticated user: ${auth.userId}`)
  }
}
```

### Token Processing

```typescript
// Process authentication token
try {
  const authToken = { token: 'user-auth-token' }
  const validatedToken = await authService.authenticate(authToken)
  
  // Token is now validated and can be used
  console.log('Token validated successfully')
} catch (error) {
  console.error('Authentication failed:', error.message)
}
```

### Bearer Token Unpacking

```typescript
// Extract Auth from bearer token
const bearerToken = req.headers.authorization // "Bearer ed25519:..."

try {
  const auth = await authService.unpack(bearerToken)
  
  // Use Auth object
  console.log(`User: ${auth.userId}, Role: ${auth.role}`)
  console.log(`Scopes: ${auth.scopes.join(', ')}`)
} catch (error) {
  console.error('Token unpacking failed:', error)
}
```

### Integration with Express.js

```typescript
import express from 'express'

const app = express()
const authService = makeAuthService()

// Authentication middleware
app.use(async (req, res, next) => {
  const hasAuth = await authService.match(req)
  
  if (hasAuth) {
    try {
      const authRes = { resolve: (auth) => { req.auth = auth } }
      await authService.handle(req, authRes)
      next()
    } catch (error) {
      res.status(401).json({ error: 'Authentication failed' })
    }
  } else {
    res.status(401).json({ error: 'No authentication provided' })
  }
})

// Protected routes
app.get('/api/protected', (req, res) => {
  res.json({ 
    message: 'Access granted',
    user: req.auth.userId 
  })
})
```

### Cache Integration

```typescript
// Service automatically uses cache for performance
// Cache resource should be configured in context

const context = makeServerContext({
  service: 'auth-app',
  // ... other config
  resources: [{
    alias: 'auth-cache',
    type: 'redis', // or other cache implementation
    config: {
      // cache configuration
    }
  }]
})

const authService = makeAuthService()
context.registerService(authService)

// Cache is automatically used for authentication state
```

### Multi-Service Authentication

```typescript
// Configure multiple auth services for different purposes
const userAuthService = makeAuthService('user-auth')
const serviceAuthService = makeAuthService('service-auth') 
const adminAuthService = makeAuthService('admin-auth')

context.registerService(userAuthService)
context.registerService(serviceAuthService)
context.registerService(adminAuthService)

// Use different services for different authentication needs
const userAuth = await userAuthService.authenticate(userToken)
const serviceAuth = await serviceAuthService.authenticate(serviceToken)
```

## Authentication Manager Application

The package includes a complete authentication manager application for centralized authentication:

### Manager Features

- **Central Authentication Hub**: Serves as authentication center for microservices
- **Token Issuance**: Issues authentication tokens for validated users
- **Multi-Service Support**: Handles authentication for multiple services
- **Admin Interface**: Management interface for authentication configuration

### Manager Usage

```typescript
// Located in src/manager - see manager/README.md for details
import { authManager } from '@owlmeans/server-auth/manager'

// The manager provides a complete authentication application
// that can be deployed as a standalone service
```

## Security Considerations

### Token Security
- All tokens use Ed25519 signatures for non-repudiable authentication
- Tokens include expiration times to limit exposure windows
- Signature verification prevents token tampering

### Trusted Entities
- Authentication relies on trusted entity verification
- Trusted entities must be properly configured and secured
- Private keys should be stored securely and rotated regularly

### Cache Security
- Authentication cache should be secured and encrypted
- Cache entries should have appropriate TTL values
- Cache should be cleared on security events

## Error Handling

The package provides comprehensive error handling:

- **AuthenFailed**: Authentication token validation failed
- **AuthorizationError**: Authorization verification failed
- **SyntaxError**: Configuration or context errors

```typescript
try {
  const auth = await authService.unpack(token)
} catch (error) {
  if (error instanceof AuthenFailed) {
    // Handle authentication failure
  } else if (error instanceof AuthorizationError) {
    // Handle authorization failure
  }
}
```

## Performance Considerations

- **Cache Integration**: Uses cache for frequently accessed authentication data
- **Signature Verification**: Ed25519 operations are computationally efficient
- **Token Reuse**: Validated tokens can be cached to avoid repeated verification
- **Resource Management**: Proper cleanup of authentication resources

## Integration with OwlMeans Ecosystem

This package integrates with:

- **@owlmeans/auth-common**: Common authentication components
- **@owlmeans/client-auth**: Client-side authentication
- **@owlmeans/basic-envelope**: Cryptographic message envelopes
- **@owlmeans/server-context**: Server context management
- **@owlmeans/module**: Module guard system integration

## Best Practices

1. **Configure cache** for better authentication performance
2. **Use trusted entities** for secure signature verification
3. **Implement proper error handling** for authentication failures
4. **Set appropriate token TTL** values for security
5. **Monitor authentication logs** for security analysis
6. **Rotate trusted keys** regularly

## Related Packages

- **@owlmeans/client-auth**: Client-side authentication
- **@owlmeans/auth-common**: Common authentication components
- **@owlmeans/server-context**: Server context management
- **@owlmeans/basic-envelope**: Cryptographic envelopes
- **@owlmeans/static-resource**: Resource management

## Manager Application

For detailed information about the authentication manager application, see the [Manager README](src/manager/README.md).

The manager provides a complete authentication service that can function as a central authentication hub for microservices architectures.
