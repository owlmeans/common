# @owlmeans/web-oidc-provider

Web-based OpenID Connect Provider functionality for OwlMeans Common Libraries. This package provides client-side authentication state management and interaction handling for OIDC Provider implementations, designed for React-based web applications with secure authentication flows.

## Overview

The `@owlmeans/web-oidc-provider` package serves as the web frontend component for OIDC Provider functionality in the OwlMeans ecosystem. It handles client-side authentication state management, interaction flows, and cookie-based session management. This package is designed for fullstack applications with focus on security and proper OIDC authentication flows.

**Key Features:**
- **Authentication State Management**: Client-side OIDC authentication state tracking and validation
- **Interaction Handling**: OIDC interaction flow management with session persistence
- **Cookie Management**: Secure cookie-based session and interaction tracking
- **Multi-Entity Support**: Support for multiple entity authentication within the same session
- **DID Integration**: Decentralized Identity (DID) linking and validation
- **Stack-based Sessions**: Session stacking for complex authentication flows

This package follows the OwlMeans "quadra" pattern as the **web** implementation, complementing:
- **@owlmeans/oidc**: Common OIDC declarations and base functionality *(base package)*
- **@owlmeans/server-oidc-provider**: Server-side OIDC provider implementation
- **@owlmeans/web-oidc-provider**: Web client OIDC provider integration *(this package)*
- **@owlmeans/web-oidc-rp**: Web client OIDC Relying Party implementation

## Installation

```bash
npm install @owlmeans/web-oidc-provider
```

## Dependencies

This package requires and integrates with:
- `@owlmeans/oidc`: Core OIDC functionality and shared configuration
- `@owlmeans/auth`: Authentication system and types
- `@owlmeans/resource`: Resource management for interaction storage
- `@owlmeans/web-client`: Web client framework and context
- `universal-cookie`: Cookie management for cross-browser compatibility
- React: Peer dependency for web components

## Key Concepts

### OIDC Authentication States

The package manages various authentication states throughout the OIDC flow:

- **Authenticated**: User has valid authentication credentials
- **SameEntity**: Current user belongs to the same entity as the OIDC interaction
- **IdLinked**: User has a linked Decentralized Identity (DID)
- **ProfileExists**: User profile exists in the system
- **RegistrationAllowed**: New user registration is permitted

### Interaction Management

OIDC interactions are managed with:
- **Session Persistence**: Interactions persist across browser sessions via cookies
- **Stack-based Flow**: Support for nested authentication flows and entity switching
- **State Validation**: Continuous validation of authentication state
- **Secure Storage**: Encrypted storage of interaction data via OwlMeans resource system

### Cookie-based Session Management

Secure session management using:
- **Interaction Cookies**: Track current OIDC interaction sessions
- **Configurable TTL**: Adjustable session timeouts and expiration
- **Cross-domain Support**: Support for multi-domain OIDC flows
- **Secure Settings**: HttpOnly and Secure cookie flags for production environments

## API Reference

### Factory Functions

#### `makeAuthStateModel<C, T>(context, updateState): OidcAuthStateModel`

Creates an OIDC authentication state model for managing client-side authentication flow.

```typescript
import { makeAuthStateModel } from '@owlmeans/web-oidc-provider'
import { makeWebContext } from '@owlmeans/web-client'

const context = makeWebContext(config)

const authStateModel = makeAuthStateModel(context, async (uid: string) => {
  // Update authentication state from server
  const response = await fetch(`/api/oidc/auth-state/${uid}`)
  return response.json()
})
```

**Parameters:**
- `context`: `AppContext<C>` - Web application context
- `updateState`: `(uid: string) => Promise<{entityId?: string, did?: string}>` - Function to update authentication state from server

**Returns:** `OidcAuthStateModel` - Authentication state model instance

### Core Interfaces

#### `OidcAuthStateModel`

Main interface for managing OIDC authentication state on the client side.

```typescript
interface OidcAuthStateModel extends AuthStateProperties {
  // Initialization and state management
  init: (uid: string, reset?: boolean) => Promise<OidcAuthStateModel>
  updateAuthState: (uid: string) => Promise<OidcAuthState[]>
  
  // State validation methods
  isAuthenticated: () => boolean
  isSameEntity: () => boolean
  isIdLinked: () => boolean
  profileExists: () => boolean
  isRegistrationAllowed: () => boolean
  
  // Interaction management
  finishInteraction: (skipState?: boolean) => Promise<void>
  getState: () => OidcAuthState[]
}
```

**Methods:**

**`init(uid: string, reset?: boolean): Promise<OidcAuthStateModel>`**
- **Purpose**: Initialize the authentication state model for a specific interaction
- **Parameters**:
  - `uid`: Unique interaction identifier
  - `reset`: Optional flag to reset existing interaction stack
- **Behavior**: 
  - Loads existing state from cache or creates new state
  - Manages interaction stack for nested flows
  - Sets interaction cookies with appropriate TTL
- **Returns**: Promise resolving to the initialized model
- **Throws**: `SyntaxError` if no valid UID is provided

**`updateAuthState(uid: string): Promise<OidcAuthState[]>`**
- **Purpose**: Update authentication state by querying server and validating current session
- **Parameters**: `uid` - Interaction identifier
- **Behavior**:
  - Calls server to get updated authentication status
  - Validates current user against interaction entity
  - Updates DID linking status
  - Caches updated state
- **Returns**: Promise resolving to array of current authentication states

**`isAuthenticated(): boolean`**
- **Purpose**: Check if user is currently authenticated
- **Returns**: `true` if user has valid authentication

**`isSameEntity(): boolean`**
- **Purpose**: Check if authenticated user belongs to the same entity as the OIDC interaction
- **Returns**: `true` if user entity matches interaction entity

**`isIdLinked(): boolean`**
- **Purpose**: Check if user has a linked Decentralized Identity (DID)
- **Returns**: `true` if DID is linked to user account

**`profileExists(): boolean`**
- **Purpose**: Check if user profile exists in the system
- **Returns**: `true` if user profile is available

**`isRegistrationAllowed(): boolean`**
- **Purpose**: Check if new user registration is permitted
- **Returns**: `true` if registration is allowed

**`finishInteraction(skipState?: boolean): Promise<void>`**
- **Purpose**: Complete current interaction and restore previous session from stack
- **Parameters**: `skipState` - Optional flag to skip state update
- **Behavior**:
  - Removes current interaction from cache
  - Pops previous interaction from stack
  - Updates cookies to previous session
  - Optionally updates authentication state

**`getState(): OidcAuthState[]`**
- **Purpose**: Get current authentication states as array
- **Returns**: Array of active authentication state flags

#### `AuthStateProperties`

Properties maintained by the authentication state model.

```typescript
interface AuthStateProperties {
  did?: string           // Decentralized Identity identifier
  entityId?: string      // Entity identifier for multi-tenant support
  state: Set<OidcAuthState>  // Set of current authentication states
  uid: string           // Unique interaction identifier
}
```

#### `OidcInteraction`

Resource record for persisting interaction state across sessions.

```typescript
interface OidcInteraction extends ResourceRecord {
  stack: Array<{
    token: string | null    // Previous session authentication token
    uid: string            // Previous interaction identifier
  }>
}
```

#### `WithSharedConfig`

Configuration interface for OIDC provider settings.

```typescript
interface WithSharedConfig {
  oidc: OidcSharedConfig
}
```

### Enums

#### `OidcAuthState`

Enumeration of possible authentication states during OIDC flows.

```typescript
enum OidcAuthState {
  Authenticated = 'authenticated',           // User is authenticated
  SameEntity = 'same-entity',               // User belongs to interaction entity
  IdLinked = 'id-linked',                   // DID is linked to user
  ProfileExists = 'profile-exists',         // User profile exists
  RegistrationAllowed = 'registration-allowed'  // Registration permitted
}
```

## Usage Examples

### Basic OIDC Provider Integration

```typescript
import { makeAuthStateModel } from '@owlmeans/web-oidc-provider'
import { makeWebContext } from '@owlmeans/web-client'

// Configure web context with OIDC settings
const config = {
  service: 'oidc-provider',
  oidc: {
    clientCookie: {
      interaction: {
        name: '_oidc_interaction',
        ttl: 3600  // 1 hour
      }
    }
  }
}

const context = makeWebContext(config)

// Create authentication state model
const authState = makeAuthStateModel(context, async (uid) => {
  // Fetch authentication state from server
  const response = await fetch(`/api/oidc/interaction/${uid}/state`, {
    credentials: 'include'
  })
  
  if (!response.ok) {
    throw new Error('Failed to fetch authentication state')
  }
  
  return response.json()
})

// Initialize for specific interaction
await authState.init(interactionId)
```

### OIDC Authentication Flow Management

```typescript
// Handle OIDC authentication flow
const handleOidcFlow = async (interactionId: string) => {
  try {
    // Initialize authentication state
    await authState.init(interactionId)
    
    // Check current authentication status
    if (authState.isAuthenticated()) {
      if (authState.isSameEntity()) {
        // User is authenticated and belongs to correct entity
        console.log('User authenticated for correct entity')
        
        if (authState.isIdLinked()) {
          console.log('DID is linked to user account')
        }
        
        // Proceed with OIDC authorization
        await proceedWithAuthorization()
      } else {
        // User authenticated but for different entity
        console.log('User needs to switch entities or re-authenticate')
        await promptEntitySwitch()
      }
    } else {
      // User not authenticated
      if (authState.isRegistrationAllowed()) {
        console.log('User can register or login')
        await showLoginOrRegisterForm()
      } else {
        console.log('Registration not allowed, login required')
        await showLoginForm()
      }
    }
  } catch (error) {
    console.error('OIDC flow error:', error)
    await handleAuthenticationError(error)
  }
}

const proceedWithAuthorization = async () => {
  // Continue with OIDC authorization grant
  const states = authState.getState()
  console.log('Current states:', states)
  
  // Make authorization decision based on current state
  window.location.href = '/oidc/auth/consent'
}

const showLoginForm = async () => {
  // Display login form component
  // After successful login, update authentication state
  await authState.updateAuthState(authState.uid)
}
```

### Multi-Entity Authentication

```typescript
// Handle entity switching in OIDC flows
const handleEntitySwitch = async (newEntityId: string) => {
  try {
    // Store current interaction in stack
    await authState.init(newEntityId, false)  // Don't reset stack
    
    // Check if user is already authenticated for new entity
    if (authState.isAuthenticated() && authState.isSameEntity()) {
      console.log('User already authenticated for target entity')
      return true
    }
    
    // Redirect to authentication for new entity
    window.location.href = `/auth/entity/${newEntityId}`
    
  } catch (error) {
    console.error('Entity switch error:', error)
    return false
  }
}

// Complete interaction and return to previous session
const completeInteraction = async () => {
  try {
    await authState.finishInteraction()
    console.log('Returned to previous interaction:', authState.uid)
    
    // Redirect to original application
    window.location.href = '/dashboard'
  } catch (error) {
    console.error('Failed to complete interaction:', error)
  }
}
```

### DID Integration

```typescript
// Handle Decentralized Identity linking
const handleDidLinking = async (didDocument: any) => {
  try {
    // Link DID to user account
    const response = await fetch('/api/did/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        did: didDocument.id,
        interactionId: authState.uid
      })
    })
    
    if (response.ok) {
      // Update authentication state to reflect DID linking
      await authState.updateAuthState(authState.uid)
      
      if (authState.isIdLinked()) {
        console.log('DID successfully linked')
        return true
      }
    }
    
    throw new Error('DID linking failed')
  } catch (error) {
    console.error('DID linking error:', error)
    return false
  }
}

// Verify DID authentication
const verifyDidAuth = async (signature: string, challenge: string) => {
  if (!authState.isIdLinked()) {
    throw new Error('DID not linked to account')
  }
  
  // Verify DID signature with server
  const response = await fetch('/api/did/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      signature,
      challenge,
      interactionId: authState.uid
    })
  })
  
  return response.ok
}
```

### React Component Integration

```typescript
import React, { useEffect, useState } from 'react'
import { makeAuthStateModel, OidcAuthState } from '@owlmeans/web-oidc-provider'

interface OidcProviderProps {
  interactionId: string
  onStateChange?: (states: OidcAuthState[]) => void
}

const OidcProvider: React.FC<OidcProviderProps> = ({ 
  interactionId, 
  onStateChange 
}) => {
  const [authState, setAuthState] = useState<any>(null)
  const [currentStates, setCurrentStates] = useState<OidcAuthState[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setLoading(true)
        
        const model = makeAuthStateModel(context, async (uid) => {
          // Fetch state from server
          const response = await fetch(`/api/oidc/state/${uid}`)
          return response.json()
        })
        
        await model.init(interactionId)
        const states = model.getState()
        
        setAuthState(model)
        setCurrentStates(states)
        onStateChange?.(states)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()
  }, [interactionId])

  const handleLogin = async (credentials: any) => {
    try {
      // Perform login
      await performLogin(credentials)
      
      // Update authentication state
      const states = await authState.updateAuthState(interactionId)
      setCurrentStates(states)
      onStateChange?.(states)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleComplete = async () => {
    try {
      await authState.finishInteraction()
      // Redirect or update UI
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div>Loading authentication...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div className="oidc-provider">
      <div className="auth-status">
        <h3>Authentication Status</h3>
        <ul>
          {currentStates.map(state => (
            <li key={state}>{state}</li>
          ))}
        </ul>
      </div>
      
      {!authState.isAuthenticated() && (
        <LoginForm onLogin={handleLogin} />
      )}
      
      {authState.isAuthenticated() && authState.isSameEntity() && (
        <ConsentForm onConsent={handleComplete} />
      )}
      
      {authState.isAuthenticated() && !authState.isSameEntity() && (
        <EntitySwitchForm onSwitch={handleEntitySwitch} />
      )}
    </div>
  )
}
```

## Configuration

### OIDC Provider Configuration

```typescript
interface OidcProviderConfig {
  oidc: {
    clientCookie: {
      interaction: {
        name: string      // Cookie name for interaction tracking
        ttl: number       // Time to live in seconds
      }
    }
    provider: {
      issuer: string        // OIDC provider issuer URL
      clientId: string      // OAuth2 client identifier
      redirectUri: string   // Redirect URI after authentication
    }
  }
  defaultEntityId?: string  // Default entity for multi-tenant scenarios
}
```

### Cookie Security Settings

```typescript
// Production cookie settings
const productionCookieConfig = {
  secure: true,           // Require HTTPS
  httpOnly: true,         // Prevent XSS access
  sameSite: 'strict',     // CSRF protection
  domain: '.example.com', // Cross-subdomain access
  path: '/'              // Site-wide access
}
```

## Error Handling

### Common Error Scenarios

```typescript
// Handle authentication state errors
const handleAuthErrors = async (error: Error) => {
  switch (error.message) {
    case 'no-uid':
      console.error('No interaction UID provided')
      // Redirect to OIDC entry point
      window.location.href = '/oidc/auth'
      break
      
    case 'invalid-interaction':
      console.error('Invalid or expired interaction')
      // Clear cookies and restart flow
      await clearInteractionCookies()
      window.location.href = '/oidc/auth'
      break
      
    case 'entity-mismatch':
      console.error('User entity does not match interaction')
      // Prompt for entity switch or re-authentication
      await promptEntitySwitch()
      break
      
    default:
      console.error('Authentication error:', error)
      // Show generic error message
      showErrorMessage('Authentication failed. Please try again.')
  }
}

// Cleanup after errors
const clearInteractionCookies = async () => {
  const cookies = new Cookies()
  cookies.remove('_oidc_interaction', { path: '/' })
  
  // Clear cached state
  await authState.finishInteraction(true)
}
```

## Security Considerations

### Cookie Security
- **Secure Flags**: Always use `Secure` and `HttpOnly` flags in production
- **SameSite Protection**: Configure `SameSite` attribute for CSRF protection
- **TTL Management**: Implement appropriate session timeouts

### State Validation
- **Server Verification**: Always verify authentication state with server
- **Entity Validation**: Validate user entity matches interaction requirements
- **DID Verification**: Verify DID signatures using cryptographic validation

### Session Management
- **Stack Protection**: Limit interaction stack depth to prevent abuse
- **Cache Security**: Secure in-memory state cache with appropriate cleanup
- **Token Handling**: Secure handling of authentication tokens in stacked sessions

## Integration with OwlMeans Ecosystem

### Context Integration
```typescript
import { makeWebContext } from '@owlmeans/web-client'

const context = makeWebContext(config)
const authService = context.auth()
```

### Resource System Integration
```typescript
import { useStoreModel } from '@owlmeans/web-client'

// Persistent interaction storage
const interactionStore = useStoreModel<OidcInteraction>('oidc-interactions')
```

### Authentication System Integration
```typescript
import type { Auth } from '@owlmeans/auth'

// Validate against OwlMeans auth system
const currentUser: Auth = context.auth().user()
const isAuthenticated = await context.auth().authenticated()
```

## Best Practices

1. **State Synchronization**: Always synchronize client state with server state
2. **Error Recovery**: Implement robust error recovery mechanisms
3. **Security**: Use secure cookie settings and validate all state transitions
4. **Performance**: Cache authentication state appropriately with proper TTL
5. **User Experience**: Provide clear feedback during authentication flows
6. **Multi-Entity**: Handle entity switching gracefully in multi-tenant scenarios

## Related Packages

- **@owlmeans/oidc**: Core OIDC functionality and shared configuration
- **@owlmeans/server-oidc-provider**: Server-side OIDC provider implementation
- **@owlmeans/web-oidc-rp**: Web OIDC Relying Party implementation
- **@owlmeans/auth**: Core authentication system
- **@owlmeans/web-client**: Web client framework and context
- **@owlmeans/resource**: Resource management for state persistence

## TypeScript Support

This package is written in TypeScript and provides full type safety:

```typescript
import type { 
  OidcAuthStateModel, 
  OidcAuthState, 
  OidcInteraction,
  WithSharedConfig 
} from '@owlmeans/web-oidc-provider'

const authState: OidcAuthStateModel = makeAuthStateModel(context, updateFunction)
const states: OidcAuthState[] = authState.getState()
```