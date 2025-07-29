# @owlmeans/client-auth

Client-side authentication library for OwlMeans Common applications. This package provides comprehensive authentication capabilities for React-based frontend applications, including token management, session persistence, and integration with the OwlMeans authentication subsystem.

## Overview

The `@owlmeans/client-auth` package extends the base `@owlmeans/auth` and `@owlmeans/auth-common` packages with client-specific functionality. It provides:

- **Token Management**: Secure storage and retrieval of authentication tokens
- **Session Persistence**: Client-side session management across browser sessions
- **Authentication Service**: Centralized authentication logic for client applications
- **React Components**: Pre-built authentication UI components
- **Module Integration**: Authentication modules for client-side routing and API calls
- **Manager Components**: Authentication manager UI for administrative interfaces

This package is part of the OwlMeans authentication quadra:
- **@owlmeans/auth**: Common authentication declarations and utilities
- **@owlmeans/auth-common**: Shared authentication logic
- **@owlmeans/client-auth**: Client-side authentication implementation *(this package)*
- **@owlmeans/server-auth**: Server-side authentication implementation

## Installation

```bash
npm install @owlmeans/client-auth
```

## Core Concepts

### Authentication Service
The authentication service manages the client-side authentication state, including token storage, validation, and user session management.

### Token Management
Client-side tokens are securely stored using the resource system and automatically attached to API requests for authentication.

### Resource-based Storage
Authentication data is persisted using the OwlMeans resource system, allowing for consistent data management across the application.

## API Reference

### Factory Functions

#### `makeAuthService(alias?: string): AuthService`

Creates a client-side authentication service instance.

```typescript
import { makeAuthService } from '@owlmeans/client-auth'

const authService = makeAuthService('main-auth')
```

**Parameters:**
- `alias`: string (optional) - Service alias for registration, defaults to 'auth'

**Returns:** AuthService instance with client-specific capabilities

### Core Interfaces

#### `AuthService`

Main authentication service interface that extends the base AuthService from `@owlmeans/auth-common`.

```typescript
interface AuthService extends InitializedService {
  token?: string
  auth?: Auth
  
  // Authentication methods
  authenticated(): Promise<string | null>
  authenticate(token: AuthToken): Promise<void>
  update(token?: string): Promise<void>
  
  // Guard and handler methods
  match(): Promise<boolean>
  handle<T>(): Promise<T | void>
}
```

#### `ClientAuthRecord`

Interface for authentication data stored in client resources.

```typescript
interface ClientAuthRecord extends ResourceRecord {
  token: string          // Authentication token
  profileId?: string     // Optional profile identifier
}
```

#### `ClientAuthResource`

Resource interface for managing authentication data persistence.

```typescript
interface ClientAuthResource extends ClientResource<ClientAuthRecord> {
  // Inherits standard resource methods for CRUD operations
}
```

#### `AuthServiceAppend`

Interface for services that need authentication capabilities.

```typescript
interface AuthServiceAppend {
  auth(): AuthService
}
```

### Authentication Service Methods

#### `authenticated(): Promise<string | null>`

**Purpose**: Checks if the current session is authenticated and returns the auth token

**Behavior**:
- Checks for existing token in memory
- Falls back to loading token from persistent storage
- Validates token format and expiration
- Returns null if no valid authentication found

**Usage**: Primary method for checking authentication status

**Returns**: Promise that resolves to auth token string or null

```typescript
const authService = makeAuthService()

const token = await authService.authenticated()
if (token) {
  console.log('User is authenticated')
} else {
  console.log('User needs to authenticate')
}
```

#### `authenticate(token: AuthToken): Promise<void>`

**Purpose**: Authenticates the user with the provided token

**Behavior**:
- Calls the authentication dispatcher module with the token
- Stores the received authentication token
- Updates the authentication state
- Persists authentication data for future sessions

**Usage**: Called after successful login to establish authentication

**Parameters**: 
- `token`: AuthToken - Authentication token received from login process

**Throws**: `AuthorizationError` if authentication fails

```typescript
try {
  await authService.authenticate(loginToken)
  console.log('Authentication successful')
} catch (error) {
  console.error('Authentication failed:', error.message)
}
```

#### `update(token?: string): Promise<void>`

**Purpose**: Updates the authentication state with a new token

**Behavior**:
- If token is provided, stores it and updates authentication state
- If token is null/undefined, clears authentication state
- Updates persistent storage accordingly
- Parses token to extract Auth payload

**Usage**: Called to refresh authentication or clear session

**Parameters**:
- `token`: string (optional) - New authentication token, or undefined to clear

```typescript
// Update with new token
await authService.update('Bearer new-auth-token')

// Clear authentication
await authService.update()
```

#### `match(): Promise<boolean>`

**Purpose**: Guard method that checks if authentication requirements are met

**Behavior**: Returns true if user is authenticated, false otherwise

**Usage**: Used by routing and module systems for access control

**Returns**: Promise that resolves to boolean indicating authentication status

```typescript
const canAccess = await authService.match()
if (canAccess) {
  // Allow access to protected resource
}
```

#### `handle<T>(): Promise<T | void>`

**Purpose**: Handler method for processing authenticated requests

**Behavior**: Currently returns undefined, can be extended for custom handling

**Usage**: Used by module system for request processing

**Returns**: Promise that resolves to undefined or custom result

### Module Functions

#### `elevate(modules: ClientModule[], alias: string): void`

Elevates authentication modules to client-side modules with enhanced capabilities.

```typescript
import { elevate } from '@owlmeans/client-auth'

elevate(authModules, 'dispatcher-auth')
```

#### `setupExternalAuthentication(service: string): void`

Configures external authentication flow for a specific service.

```typescript
import { setupExternalAuthentication } from '@owlmeans/client-auth'

setupExternalAuthentication('oauth-provider')
```

### Constants

#### Authentication Configuration
```typescript
const DEFAULT_ALIAS = 'auth'        // Default service alias
const AUTH_RESOURCE = 'auth'        // Resource identifier for auth data
const USER_ID = 'user'             // Default user identifier
```

### Components

The package provides React components for authentication UI:

#### Authentication Dispatcher
Located in `./components/dispatcher`, provides components for handling authentication flows.

#### Manager Components  
Located in `./manager/components`, provides administrative interfaces for authentication management.

**Import paths:**
```typescript
import { /* components */ } from '@owlmeans/client-auth'
import { /* manager components */ } from '@owlmeans/client-auth/manager'
```

### Manager Functionality

The package includes a manager subsystem accessible via `/manager` export:

```typescript
import { /* manager functions */ } from '@owlmeans/client-auth/manager'
import { /* manager modules */ } from '@owlmeans/client-auth/manager/modules'
import { /* manager plugins */ } from '@owlmeans/client-auth/manager/plugins'
```

The manager provides:
- Administrative authentication interfaces
- User management components
- Authentication flow configuration
- Plugin system for extending authentication capabilities

## Usage Examples

### Basic Authentication Setup

```typescript
import { makeAuthService } from '@owlmeans/client-auth'
import { makeClientContext } from '@owlmeans/client-context'

// Create context and auth service
const context = makeClientContext(config)
const authService = makeAuthService()

// Register the service
context.registerService(authService)

// Initialize context
await context.configure().init()

// Check authentication status
const isAuthenticated = await authService.authenticated()
console.log('Authenticated:', isAuthenticated != null)
```

### Authentication Flow

```typescript
import { makeAuthService } from '@owlmeans/client-auth'

const authService = makeAuthService()

// Authenticate with token from login
const loginToken = { /* token from login process */ }
try {
  await authService.authenticate(loginToken)
  console.log('Successfully authenticated')
} catch (error) {
  console.error('Authentication failed:', error)
}

// Check authentication status
const token = await authService.authenticated()
if (token) {
  console.log('User is authenticated with token:', token)
}

// Clear authentication
await authService.update()
console.log('Authentication cleared')
```

### Module Integration

```typescript
import { modules, setupExternalAuthentication } from '@owlmeans/client-auth'
import { makeClientContext } from '@owlmeans/client-context'

const context = makeClientContext(config)

// Register authentication modules
context.registerModules(modules)

// Setup external authentication
setupExternalAuthentication('google-oauth')

// Initialize context
await context.configure().init()
```

### Protected Resource Access

```typescript
import { makeAuthService } from '@owlmeans/client-auth'

const authService = makeAuthService()

// Guard for protected resources
const canAccess = await authService.match()
if (!canAccess) {
  throw new Error('Authentication required')
}

// Access protected resource
const protectedData = await api.getProtectedData()
```

### React Component Integration

```typescript
import React from 'react'
import { useContext } from 'react'
import { makeAuthService } from '@owlmeans/client-auth'

const AuthProvider = ({ children }) => {
  const authService = makeAuthService()
  
  const login = async (credentials) => {
    try {
      await authService.authenticate(credentials)
      // Redirect to dashboard
    } catch (error) {
      // Handle login error
    }
  }
  
  const logout = async () => {
    await authService.update() // Clear authentication
    // Redirect to login
  }
  
  return (
    <AuthContext.Provider value={{ authService, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
```

## Error Handling

The package uses the OwlMeans error system and may throw the following errors:

### `AuthorizationError`
Thrown when authentication fails or access is denied.

```typescript
import { AuthorizationError } from '@owlmeans/auth'

try {
  await authService.authenticate(invalidToken)
} catch (error) {
  if (error instanceof AuthorizationError) {
    console.error('Authentication failed:', error.message)
  }
}
```

Common scenarios:
- Invalid authentication token
- Expired token
- Insufficient permissions
- Network errors during authentication

## Resource Management

Authentication data is managed through the OwlMeans resource system:

```typescript
// Access the auth resource directly
const authResource = context.resource<ClientAuthResource>('auth')

// Load stored authentication data
const authRecord = await authResource.load('user')

// Save authentication data
await authResource.save({
  id: 'user',
  token: 'Bearer auth-token-here',
  profileId: 'user-profile-123'
})

// Clear authentication data
await authResource.delete('user')
```

## Integration with Other Packages

### Authentication Quadra Integration

```typescript
// Common authentication (shared)
import { AuthRole, AuthenticationType } from '@owlmeans/auth'

// Shared authentication logic
import { authMiddleware } from '@owlmeans/auth-common'

// Client authentication (this package)
import { makeAuthService } from '@owlmeans/client-auth'

// Server authentication (backend)
import { makeServerAuthService } from '@owlmeans/server-auth'
```

### Context Integration

```typescript
import { makeClientContext } from '@owlmeans/client-context'
import { makeAuthService } from '@owlmeans/client-auth'

const context = makeClientContext(config)
const authService = makeAuthService()

context.registerService(authService)
```

### Module Integration

```typescript
import { modules } from '@owlmeans/client-auth'
import { makeClientContext } from '@owlmeans/client-context'

const context = makeClientContext(config)
context.registerModules(modules)
```

### Flow Integration

```typescript
import { makeAuthService } from '@owlmeans/client-auth'
import { FlowService } from '@owlmeans/client-flow'

// Authentication can be integrated with user flows
const authService = makeAuthService()
const flowService = context.service<FlowService>('flow')

// Use authentication in flow steps
await flowService.addStep('authenticate', async () => {
  const isAuth = await authService.authenticated()
  if (!isAuth) {
    throw new Error('Authentication required')
  }
})
```

## Best Practices

1. **Single Authentication Service**: Use one primary authentication service per application
2. **Context Registration**: Always register the authentication service with the application context
3. **Error Handling**: Implement proper error handling for authentication failures
4. **Token Security**: Let the service handle token storage and validation
5. **Module Integration**: Use provided modules for consistent authentication flows
6. **Manager Access**: Use manager components for administrative authentication features

## Dependencies

This package depends on:
- `@owlmeans/auth` - Core authentication types and constants
- `@owlmeans/auth-common` - Shared authentication logic
- `@owlmeans/client-context` - Client-side context management
- `@owlmeans/client-module` - Client-side module system
- `@owlmeans/client-resource` - Client-side resource management
- `@owlmeans/basic-envelope` - Token envelope handling
- `@owlmeans/context` - Core context system

## Related Packages

- [`@owlmeans/auth`](../auth) - Core authentication declarations
- [`@owlmeans/auth-common`](../auth-common) - Shared authentication logic  
- [`@owlmeans/server-auth`](../server-auth) - Server-side authentication
- [`@owlmeans/client-context`](../client-context) - Client context management
- [`@owlmeans/client-module`](../client-module) - Client module system