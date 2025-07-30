# @owlmeans/auth-common

Common authentication components and modules for OwlMeans Common libraries. This package provides shared authentication infrastructure that bridges the core `@owlmeans/auth` package with client and server implementations, focusing on authentication modules, guards, middleware, and common types used across fullstack applications.

## Overview

The `@owlmeans/auth-common` package serves as a foundational layer for authentication in the OwlMeans ecosystem, providing:

- **Authentication Modules**: Predefined URL units for authentication flows including login, initialization, and rely functionality
- **Guard Services**: Authentication and authorization guard implementations for route protection
- **Common Types**: Shared interfaces and types used across client and server authentication implementations
- **Middleware**: Authentication middleware for request processing and token validation
- **Utility Functions**: Helper functions for authentication workflows and token management

This package follows the OwlMeans "quadra" pattern, providing common functionality that can be used by both server and client implementations.

## Installation

```bash
npm install @owlmeans/auth-common
```

## Core Concepts

### Authentication Modules

In the OwlMeans ecosystem, modules represent URL units that define authentication routes and their behavior. The auth-common package provides standardized authentication modules for:

- **Backend Authentication**: Server-side authentication endpoints
- **Frontend Authentication**: Client-side authentication routes  
- **Socket Authentication**: WebSocket authentication channels
- **Dispatcher Routes**: Authentication flow management and redirection

### Guards and Services

The package defines standard service interfaces for authentication and authorization:

- **AuthService**: Core authentication service with token validation and user management
- **AuthorizationService**: Permission-based authorization service
- **GuardService**: Route protection and access control

## API Reference

### Types

#### `AuthRequest`
Extended request interface with authentication token in query parameters.

```typescript
interface AuthRequest extends AbstractRequest {
  query: AuthToken
}
```

#### `AuthUIParams`
Parameters for authentication UI components.

```typescript
interface AuthUIParams {
  type?: string  // Authentication type identifier
}
```

#### `AuthService`
Core authentication service interface extending GuardService.

```typescript
interface AuthService extends GuardService {
  auth?: Auth                                           // Current authentication state
  authenticate: (token: AuthToken) => Promise<void>    // Authenticate with token (throws AuthenFailed)
  update: (token: string | undefined) => Promise<void> // Update authentication token
  user: () => Auth                                      // Get current authenticated user
  store: <T extends ResourceRecord = ResourceRecord>() => Resource<T>  // Get authentication storage resource
}
```

**Methods:**
- **`authenticate(token: AuthToken): Promise<void>`**: Validates and sets authentication token. Throws `AuthenFailed` on invalid token.
- **`update(token: string | undefined): Promise<void>`**: Updates the current authentication token, useful for token refresh.
- **`user(): Auth`**: Returns the current authenticated user object.
- **`store<T>(): Resource<T>`**: Provides access to the authentication storage resource for persistence.

#### `AuthorizationService`
Service interface for permission-based authorization.

```typescript
interface AuthorizationService extends InitializedService {
  isAllowed: (permissions: string | string[] | PermissionSet | PermissionSet[], token?: string | AuthToken | null, thr?: boolean) => Promise<boolean>
  update: (token?: string | AuthToken, thr?: boolean) => Promise<AuthToken | null>
}
```

**Methods:**
- **`isAllowed(permissions, token?, thr?): Promise<boolean>`**: Checks if given permissions are allowed for the token. Can throw on error if `thr` is true.
- **`update(token?, thr?): Promise<AuthToken | null>`**: Updates authorization context with new token and returns validated token.

#### `TrustedRecord`
Configuration record for trusted authentication entities.

```typescript
interface TrustedRecord extends ConfigRecord, Partial<Omit<Profile, "permissions" | "attributes">> {
  id: string  // Unique identifier for the trusted entity
}
```

### Modules

The package exports a standardized set of authentication modules through the `modules` array:

#### Backend Modules
- **`AUTHEN`**: Base authentication endpoint (`/authentication`)
- **`AUTHEN_INIT`**: Authentication initialization (`/init`) - POST with AllowanceRequestSchema
- **`AUTHEN_AUTHEN`**: Authentication execution (`/authenticate`) - POST with AuthCredentialsSchema  
- **`AUTHEN_RELY`**: WebSocket authentication rely (`/rely`) - with OptionalAuthTokenSchema

#### Frontend Modules
- **`CAUTHEN`**: Base client authentication (`/authentication`)
- **`CAUTHEN_AUTHEN`**: Client login page (`/login`)
- **`CAUTHEN_AUTHEN_DEFAULT`**: Default client auth route (`/`)
- **`CAUTHEN_AUTHEN_TYPED`**: Typed authentication (`/:type`)
- **`CAUTHEN_FLOW_ENTER`**: Authentication flow entry point (`/`)

#### Dispatcher Modules
- **`DISPATCHER`**: Authentication dispatcher (`/dispatcher`) - sticky module with AuthTokenSchema
- **`DISPATCHER_AUTHEN`**: Dispatcher authentication endpoint (`/authenticate`) - POST with AuthTokenSchema

```typescript
import { modules } from '@owlmeans/auth-common'

// All authentication modules are available in the modules array
console.log(modules.length) // 11 predefined authentication modules
```

### Constants

#### Rely Constants
```typescript
const RELY_PIN_PERFIX = 'rely-pin:'        // Prefix for rely PIN tokens
const RELY_TOKEN_PREFIX = 'rely-token:'    // Prefix for rely tokens
const RELY_CALL_TIMEOUT = 120              // Rely call timeout in seconds
const RELY_ACTION_TIMEOUT = 600            // Rely action timeout in seconds
```

#### Service Constants
```typescript
const DISPATCHER_PATH = '/dispatcher'      // Default dispatcher route path
const DEF_AUTH_SRV = 'auth'               // Default authentication service name
const DEFAULT_GUARD = DEF_AUTH_SRV        // Default guard service name
const TOKEN_UPDATE = 'auth-token-refresh' // Token update event name
```

### Guards

The package provides authentication guard implementations in the `/guards` subpackage:

#### Basic Ed25519 Guard
Authentication guard implementation for Ed25519 signature-based authentication.

```typescript
import { basicEd25519Guard } from '@owlmeans/auth-common/guards'
```

### Utilities

Authentication utility functions are available in the `/utils` subpackage:

#### Header Utilities
Functions for managing authentication headers in HTTP requests.

#### Trusted Entity Utilities  
Functions for managing trusted authentication entities and their validation.

```typescript
import { /* utility functions */ } from '@owlmeans/auth-common/utils'
```

## Usage Examples

### Using Authentication Modules

```typescript
import { modules } from '@owlmeans/auth-common'
import { makeBasicContext } from '@owlmeans/context'

const context = makeBasicContext(config)

// Register all authentication modules
modules.forEach(module => {
  context.registerModule(module)
})

await context.configure().init()

// Access specific authentication modules
const loginModule = context.module('cauthen-authen')
const authModule = context.module('authen')
```

### Implementing AuthService

```typescript
import type { AuthService } from '@owlmeans/auth-common'
import { createService } from '@owlmeans/context'

const authService = createService<AuthService>('auth', {
  auth: undefined,
  
  async authenticate(token) {
    // Validate token and set auth
    const validatedAuth = await validateToken(token)
    this.auth = validatedAuth
  },
  
  async update(token) {
    if (token) {
      await this.authenticate({ token })
    }
  },
  
  user() {
    if (!this.auth) {
      throw new Error('No authenticated user')
    }
    return this.auth
  },
  
  store() {
    // Return authentication storage resource
    return authStorageResource
  }
})
```

### Permission Checking

```typescript
import type { AuthorizationService } from '@owlmeans/auth-common'

const authzService: AuthorizationService = context.service('authorization')

// Check single permission
const canRead = await authzService.isAllowed('read', userToken)

// Check multiple permissions
const canReadWrite = await authzService.isAllowed(['read', 'write'], userToken)

// Check with permission sets
const canAccess = await authzService.isAllowed([{
  scope: 'documents',
  permissions: { read: true, write: true }
}], userToken)
```

### Using Constants

```typescript
import { DEF_AUTH_SRV, DISPATCHER_PATH, RELY_CALL_TIMEOUT } from '@owlmeans/auth-common'

// Configure authentication service
const authServiceName = DEF_AUTH_SRV

// Set up dispatcher route
const dispatcherRoute = DISPATCHER_PATH

// Configure rely timeout
const relyTimeout = RELY_CALL_TIMEOUT * 1000 // Convert to milliseconds
```

## Integration with OwlMeans Ecosystem

The auth-common package integrates with other OwlMeans packages:

- **@owlmeans/auth**: Core authentication types and validation
- **@owlmeans/basic-keys**: Cryptographic key management for signatures
- **@owlmeans/context**: Dependency injection and service registration
- **@owlmeans/module**: Module system and route definitions
- **@owlmeans/resource**: Data persistence and resource management
- **@owlmeans/route**: URL and routing infrastructure

## Package Structure

The authentication common library follows the OwlMeans package structure:

- **types**: TypeScript interfaces and type definitions
- **modules**: Predefined authentication modules for common flows
- **consts**: Static values and configuration constants
- **guards/**: Authentication guard implementations
- **utils/**: Internal utility functions for authentication workflows
- **middleware**: Authentication middleware for request processing

## Related Packages

This package serves as the foundation for:

- **@owlmeans/server-auth**: Server-side authentication implementation
- **@owlmeans/client-auth**: Client-side authentication implementation  
- **@owlmeans/web-oidc-provider**: OpenID Connect provider implementation
- **@owlmeans/web-oidc-rp**: OpenID Connect relying party implementation

## Error Handling

The package leverages the error types from `@owlmeans/auth`:

- **AuthenFailed**: Thrown by `authenticate()` method on authentication failure
- **AuthForbidden**: Thrown by authorization services on access denial
- **AuthError**: Base authentication error for general failures

Always handle authentication errors appropriately in your application:

```typescript
try {
  await authService.authenticate(token)
} catch (error) {
  if (error instanceof AuthenFailed) {
    // Handle authentication failure
  }
}
```