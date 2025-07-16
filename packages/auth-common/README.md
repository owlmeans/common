# @owlmeans/auth-common

Common authentication declarations and utilities for the OwlMeans Authentication subsystem.

## Overview

The `@owlmeans/auth-common` package provides shared types, interfaces, middleware, guards, and utilities that form the foundation of the OwlMeans authentication system. This package contains essential declarations used across both client and server-side authentication implementations.

## Installation

```bash
npm install @owlmeans/auth-common
```

## Quick Start

### Basic Usage

```typescript
import { AuthService, AuthRequest, extractAuthToken } from '@owlmeans/auth-common'
import { makeBasicEd25519Guard } from '@owlmeans/auth-common'

// Using the authentication service interface
const authService: AuthService = {
  // Implementation details...
}

// Extracting auth token from request
const token = extractAuthToken(req, AuthroizationType.Ed25519BasicToken)
```

### With Guard

```typescript
import { makeBasicEd25519Guard } from '@owlmeans/auth-common'

// Create Ed25519 authentication guard
const guard = makeBasicEd25519Guard('trusted-users-resource', {
  cache: 'redis-cache-resource'
})
```

## API Reference

### Core Types

#### `AuthRequest`

Extends `AbstractRequest` with authentication token in query.

```typescript
interface AuthRequest extends AbstractRequest {
  query: AuthToken
}
```

#### `AuthUIParams`

Parameters for authentication UI components.

```typescript
interface AuthUIParams {
  type?: string
}
```

#### `AuthService`

Core authentication service interface that extends `GuardService`.

```typescript
interface AuthService extends GuardService {
  auth?: Auth
  authenticate: (token: AuthToken) => Promise<void>
  update: (token: string | undefined) => Promise<void>
  user: () => Auth
  store: <T extends ResourceRecord = ResourceRecord>() => Resource<T>
}
```

**Methods:**
- `authenticate(token)` - Authenticates with given token, throws `AuthenFailed` on failure
- `update(token)` - Updates the current authentication token
- `user()` - Returns current authenticated user
- `store()` - Returns the authentication data store

#### `AuthorizationService`

Service for handling authorization and permission checks.

```typescript
interface AuthorizationService extends InitializedService {
  isAllowed: (
    permissions: string | string[] | PermissionSet | PermissionSet[], 
    token?: string | AuthToken | null, 
    thr?: boolean
  ) => Promise<boolean>
  
  update: (token?: string | AuthToken, thr?: boolean) => Promise<AuthToken | null>
}
```

**Methods:**
- `isAllowed(permissions, token?, thr?)` - Checks if given permissions are allowed
- `update(token?, thr?)` - Updates authorization with new token

#### `TrustedRecord`

Configuration record for trusted entities.

```typescript
interface TrustedRecord extends ConfigRecord, Partial<Omit<Profile, "permissions" | "attributes">> {
  id: string
}
```

### Constants

#### Authentication Constants

```typescript
const RELY_PIN_PERFIX = 'rely-pin:'           // Prefix for rely pins
const RELY_TOKEN_PREFIX = 'rely-token:'       // Prefix for rely tokens
const RELY_CALL_TIMEOUT = 120                 // Call timeout in seconds
const RELY_ACTION_TIMEOUT = 600               // Action timeout in seconds
const DISPATCHER_PATH = '/dispatcher'         // Dispatcher endpoint path
const DEF_AUTH_SRV = 'auth'                  // Default auth service name
const DEFAULT_GUARD = DEF_AUTH_SRV           // Default guard service
const TOKEN_UPDATE = 'auth-token-refresh'     // Token update event name
```

### Modules

The package exports pre-configured authentication modules for routing:

#### Backend Modules
- `AUTHEN` - Base authentication route (`/authentication`)
- `AUTHEN_INIT` - Initialization endpoint (`/init`)
- `AUTHEN_AUTHEN` - Authentication endpoint (`/authenticate`)
- `AUTHEN_RELY` - Socket-based rely endpoint (`/rely`)
- `DISPATCHER_AUTHEN` - Dispatcher authentication endpoint (`/authenticate`)

#### Frontend Modules
- `CAUTHEN` - Client authentication route (`/authentication`)
- `CAUTHEN_AUTHEN` - Client login route (`/login`)
- `CAUTHEN_AUTHEN_DEFAULT` - Default client route (`/`)
- `CAUTHEN_AUTHEN_TYPED` - Typed client route (`/:type`)
- `CAUTHEN_FLOW_ENTER` - Flow entry point (`/`)
- `DISPATCHER` - Dispatcher route (`/dispatcher`)

### Middleware

#### `authMiddleware`

Context middleware that automatically applies authentication headers to guarded backend modules.

```typescript
const authMiddleware: Middleware = {
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Loading,
  apply: async context => {
    // Automatically adds authentication headers to guarded modules
  }
}
```

**Features:**
- Applies to backend modules with guards
- Automatically adds authentication headers
- Prevents duplicate application

### Guards

#### Ed25519 Basic Authentication Guard

The `makeBasicEd25519Guard` function creates a guard that implements Ed25519 signature-based authentication.

```typescript
const guard = makeBasicEd25519Guard(resource: string, opts?: BasicEd25519GuardOptions)
```

**Parameters:**
- `resource` - Resource name containing trusted users
- `opts.cache` - Optional cache resource for nonces (prevents replay attacks)

**Configuration:**
```typescript
interface BasicEd25519GuardOptions {
  cache?: string  // Cache resource name (recommended: redis)
}
```

**Constants:**
```typescript
const GUARD_ED25519 = 'guard:ed25519-basic-signature'
const BED255_TIME_HEADER = 'X-Auth-Time'      // Timestamp header
const BED255_NONCE_HEADER = 'X-Auth-Nonce'    // Nonce header
const BED255_SIG_TTL = 60 * 1000              // Signature TTL (60s)
const BED255_CASHE_RESOURCE = 'basic-ed25519-nonce-cache'
```

**Usage Example:**
```typescript
import { makeBasicEd25519Guard } from '@owlmeans/auth-common'

// Create guard with cache
const guard = makeBasicEd25519Guard('trusted-services', {
  cache: 'redis-nonce-cache'
})

// Use in context
context.use(guard)
```

### Utilities

#### `extractAuthToken`

Extracts authentication token from request headers.

```typescript
function extractAuthToken(
  req: Partial<AbstractRequest>, 
  type: string | null = AuthroizationType.Ed25519BasicToken, 
  onlyValue: boolean = true
): string | null
```

**Parameters:**
- `req` - Request object
- `type` - Expected authorization type (null for any type)
- `onlyValue` - Return only token value (true) or full header (false)

**Returns:** Token string or null if not found

**Example:**
```typescript
import { extractAuthToken } from '@owlmeans/auth-common/utils'

const token = extractAuthToken(req, AuthroizationType.Ed25519BasicToken)
if (token) {
  // Process authentication token
}
```

#### `trust`

Resolves trusted user from resource and creates key pair.

```typescript
async function trust<C extends Config, T extends Context<C>>(
  context: T, 
  resource: string, 
  userName: string, 
  field: string = 'name'
): Promise<{ user: TrustedRecord, key: KeyPair }>
```

**Parameters:**
- `context` - Application context
- `resource` - Resource name containing trusted users
- `userName` - User identifier
- `field` - Field to search by (default: 'name')

**Returns:** Object with user record and key pair

**Example:**
```typescript
import { trust } from '@owlmeans/auth-common/utils'

const { user, key } = await trust(context, 'trusted-services', 'service-id', 'id')
const signature = await key.sign(payload)
```

## Usage Patterns

### Setting up Authentication Service

```typescript
import { AuthService } from '@owlmeans/auth-common'
import { createService } from '@owlmeans/context'

const authService: AuthService = createService('auth', {
  authenticate: async (token: AuthToken) => {
    // Validate and store token
  },
  update: async (token?: string) => {
    // Update current token
  },
  user: () => currentAuth,
  store: () => authResourceStore
})
```

### Implementing Custom Guard

```typescript
import { GuardService } from '@owlmeans/module'
import { extractAuthToken } from '@owlmeans/auth-common/utils'

const customGuard: GuardService = {
  authenticated: async (req) => {
    const token = extractAuthToken(req, 'Custom-Token')
    return token ? `Custom ${token}` : null
  },
  
  match: async (req) => {
    return extractAuthToken(req, 'Custom-Token') !== null
  },
  
  handle: async (req, res) => {
    // Custom authentication logic
    return true
  }
}
```

### Using with Context

```typescript
import { authMiddleware } from '@owlmeans/auth-common'

const context = createContext({
  middlewares: [authMiddleware],
  services: {
    auth: authService
  }
})
```

## Integration with OwlMeans Common

This package is part of the OwlMeans Common library ecosystem and follows the standard package structure:

- **types** - Interface definitions and POJO types
- **consts** - Static values and configuration constants
- **modules** - Route definitions with authentication endpoints
- **middleware** - Context middleware for authentication
- **guards** - Authentication guard implementations
- **utils** - Helper functions for authentication tasks

## Dependencies

This package depends on other OwlMeans Common packages:

- `@owlmeans/auth` - Base authentication types and constants
- `@owlmeans/basic-ids` - ID generation utilities
- `@owlmeans/basic-keys` - Cryptographic key operations
- `@owlmeans/client-module` - Client-side module system
- `@owlmeans/context` - Application context management
- `@owlmeans/module` - Module system interfaces
- `@owlmeans/resource` - Resource management
- `@owlmeans/route` - Routing system

## License

Part of the OwlMeans Common library ecosystem.