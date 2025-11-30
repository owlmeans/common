# OwlMeans Client Auth Manager

The **OwlMeans Client Auth Manager** is a comprehensive React-based authentication management system for client-side applications within the OwlMeans Common Libraries ecosystem. This manager provides React components, hooks, and utilities for handling authentication flows, credential management, and secure communication with authentication services.

## Purpose

This manager provides client-side authentication capabilities designed for:

- **React Authentication Components**: Pre-built UI components for authentication flows
- **Authentication State Management**: Centralized authentication state handling
- **Credential Security**: Secure credential management and validation
- **Authentication HOCs**: Higher-Order Components for protected routes and features
- **WebSocket Tunneling**: Real-time authentication tunnel management
- **Multi-Authentication Types**: Support for various authentication methods (password, wallet, etc.)

## Key Concepts

### Authentication Components
React components that handle various authentication scenarios:
- **Authentication HOC**: Higher-Order Component that wraps other components with authentication
- **Tunnel Consumer**: Component for handling WebSocket authentication tunnels
- **Credential Management**: Secure handling of user credentials

### Module Integration
The manager integrates with the OwlMeans module system to provide:
- **Elevated Modules**: Enhanced modules with client-specific authentication handling
- **Route Protection**: Automatic authentication requirements for protected routes
- **API Integration**: Seamless integration with authentication APIs

### Error Management
Comprehensive error handling for authentication scenarios:
- **Credential Errors**: Specialized error types for credential validation
- **Resilient Error System**: Integration with OwlMeans error management

## Installation

This manager is part of the `@owlmeans/client-auth` package:

```bash
npm install @owlmeans/client-auth
```

## API Reference

### Types

#### `TunnelAuthenticationProps`
Props interface for tunnel authentication components.

```typescript
interface TunnelAuthenticationProps {
  type: AuthenticationType
  onAuthenticated?: (auth: Auth) => void
  onError?: (error: Error) => void
  // Additional authentication props
}
```

### Components

#### `AuthenticationHOC(component?, type?)`
Higher-Order Component that adds authentication capabilities to wrapped components.

```typescript
function AuthenticationHOC(
  component?: ComponentType, 
  type?: AuthenticationType
): ComponentType<AuthenticationProps>
```

**Parameters:**
- `component`: Optional base component to wrap
- `type`: Authentication type to use

**Returns:** Enhanced component with authentication capabilities

```typescript
import { AuthenticationHOC } from '@owlmeans/client-auth/manager'

// Create an authentication-protected component
const ProtectedComponent = AuthenticationHOC(MyComponent)

// Or with specific authentication type
const WalletAuthComponent = AuthenticationHOC(
  MyComponent, 
  AuthenticationType.WalletDid
)
```

#### `TunnelConsumer`
React component for handling WebSocket authentication tunnels.

```typescript
const TunnelConsumer: FC<Partial<TunnelAuthenticationProps>>
```

Provides a consumer interface for authentication tunnels with automatic WebSocket connection management.

```typescript
import { TunnelConsumer } from '@owlmeans/client-auth/manager'

function App() {
  return (
    <TunnelConsumer 
      onAuthenticated={(auth) => console.log('Authenticated:', auth)}
      onError={(error) => console.error('Auth error:', error)}
    />
  )
}
```

### Error Classes

#### `AuthenCredError`
Specialized error class for credential-related authentication failures.

```typescript
class AuthenCredError extends AuthManagerError {
  static typeName: string
  constructor(message?: string)
}
```

**Usage:**
```typescript
import { AuthenCredError } from '@owlmeans/client-auth/manager'

try {
  await authenticateCredentials(credentials)
} catch (error) {
  if (error instanceof AuthenCredError) {
    console.error('Credential error:', error.message)
  }
}
```

### Modules

#### `modules`
Pre-configured authentication modules for client applications.

```typescript
const modules: CommonModule[]
```

Contains elevated modules for:
- `AUTHEN` - Base authentication module
- `AUTHEN_INIT` - Authentication initialization
- `AUTHEN_AUTHEN` - User authentication
- `AUTHEN_RELY` - Authentication relay
- `CAUTHEN` - Client authentication
- `CAUTHEN_AUTHEN` - Client authentication handler
- `CAUTHEN_AUTHEN_DEFAULT` - Default authentication component
- `CAUTHEN_AUTHEN_TYPED` - Typed authentication component
- `DISPATCHER` - Authentication dispatcher

## Usage Examples

### Basic Authentication Setup

```typescript
import { modules } from '@owlmeans/client-auth/manager'
import { makeClientContext } from '@owlmeans/client-context'

// Register authentication modules with context
const context = makeClientContext(config)
context.registerModules(modules)

await context.configure().init()
```

### Authentication HOC Usage

```typescript
import React from 'react'
import { AuthenticationHOC } from '@owlmeans/client-auth/manager'
import { AuthenticationType } from '@owlmeans/auth'

// Protected dashboard component
const Dashboard = () => (
  <div>
    <h1>Protected Dashboard</h1>
    <p>This content requires authentication</p>
  </div>
)

// Wrap with authentication
const ProtectedDashboard = AuthenticationHOC(Dashboard, AuthenticationType.PasswordLogin)

// Use in your app
function App() {
  return (
    <div>
      <ProtectedDashboard />
    </div>
  )
}
```

### Wallet Authentication Component

```typescript
import { AuthenticationHOC } from '@owlmeans/client-auth/manager'
import { AuthenticationType } from '@owlmeans/auth'

const WalletComponent = () => (
  <div>
    <h2>Wallet Connected</h2>
    <p>Decentralized identity verified</p>
  </div>
)

const WalletAuth = AuthenticationHOC(
  WalletComponent, 
  AuthenticationType.WalletDid
)

function WalletApp() {
  return (
    <div>
      <h1>DeFi Application</h1>
      <WalletAuth />
    </div>
  )
}
```

### Tunnel Consumer for Real-time Auth

```typescript
import { TunnelConsumer } from '@owlmeans/client-auth/manager'
import { useState } from 'react'

function RealtimeApp() {
  const [authStatus, setAuthStatus] = useState('pending')

  return (
    <div>
      <h1>Real-time Application</h1>
      <p>Auth Status: {authStatus}</p>
      
      <TunnelConsumer 
        onAuthenticated={(auth) => {
          setAuthStatus('authenticated')
          console.log('User authenticated via tunnel:', auth)
        }}
        onError={(error) => {
          setAuthStatus('error')
          console.error('Tunnel authentication failed:', error)
        }}
      />
    </div>
  )
}
```

### Custom Authentication Flow

```typescript
import { modules, AuthenCredError } from '@owlmeans/client-auth/manager'
import { useModule } from '@owlmeans/client'

function CustomAuthFlow() {
  const authModule = useModule('auth')
  
  const handleLogin = async (credentials) => {
    try {
      const initResponse = await authModule.init({
        type: AuthenticationType.PasswordLogin
      })
      
      const authResponse = await authModule.authenticate({
        ...credentials,
        challenge: initResponse.challenge
      })
      
      console.log('Authentication successful:', authResponse)
    } catch (error) {
      if (error instanceof AuthenCredError) {
        console.error('Invalid credentials:', error.message)
      } else {
        console.error('Authentication failed:', error)
      }
    }
  }

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      const formData = new FormData(e.target)
      handleLogin({
        username: formData.get('username'),
        password: formData.get('password')
      })
    }}>
      <input name="username" placeholder="Username" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Login</button>
    </form>
  )
}
```

### Error Handling

```typescript
import { AuthenCredError } from '@owlmeans/client-auth/manager'
import { ResilientError } from '@owlmeans/error'

function AuthErrorHandler({ children }) {
  const handleError = (error) => {
    if (error instanceof AuthenCredError) {
      // Handle credential-specific errors
      toast.error(`Credential error: ${error.message}`)
    } else if (error instanceof ResilientError) {
      // Handle other resilient errors
      toast.error(`Authentication error: ${error.message}`)
    } else {
      // Handle unexpected errors
      toast.error('An unexpected error occurred')
    }
  }

  return (
    <ErrorBoundary onError={handleError}>
      {children}
    </ErrorBoundary>
  )
}
```

## Integration Patterns

### State Management Integration

```typescript
import { AuthenticationHOC } from '@owlmeans/client-auth/manager'
import { useDispatch } from 'react-redux'

const AuthenticatedApp = AuthenticationHOC(() => {
  const dispatch = useDispatch()
  
  useEffect(() => {
    // Update Redux store with authentication state
    dispatch(setAuthenticationStatus('authenticated'))
  }, [dispatch])

  return <MainApp />
})
```

### Context Provider Pattern

```typescript
import { createContext, useContext } from 'react'
import { TunnelConsumer } from '@owlmeans/client-auth/manager'

const AuthContext = createContext(null)

function AuthProvider({ children }) {
  const [auth, setAuth] = useState(null)

  return (
    <AuthContext.Provider value={auth}>
      <TunnelConsumer onAuthenticated={setAuth} />
      {children}
    </AuthContext.Provider>
  )
}

// Custom hook for using auth context
function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used within AuthProvider')
  return auth
}
```

## Authentication Types Supported

The manager supports various authentication types:

### Password-based Authentication
```typescript
AuthenticationType.PasswordLogin
```
Traditional username/password authentication.

### Wallet-based Authentication
```typescript
AuthenticationType.WalletDid
AuthenticationType.WalletConsumer
```
Decentralized identity authentication using blockchain wallets.

### Token-based Authentication
```typescript
AuthenticationType.OneTimeToken
```
Single-use token authentication for enhanced security.

## Best Practices

1. **Component Wrapping**: Use AuthenticationHOC for protecting entire component trees
2. **Error Boundaries**: Implement proper error boundaries around authentication components
3. **State Management**: Integrate authentication state with your app's state management solution
4. **Type Safety**: Leverage TypeScript for type-safe authentication handling
5. **Graceful Fallbacks**: Provide fallback UI for authentication failures
6. **Security**: Never store sensitive credentials in local storage

## Module Elevation

The manager uses module elevation to enhance base authentication modules:

```typescript
// Base modules are elevated with client-specific handlers
elevate(list, AUTHEN_INIT, true)           // API call elevation
elevate(list, AUTHEN_AUTHEN, true)         // Authentication elevation
elevate(list, CAUTHEN_AUTHEN_DEFAULT, handler(AuthenticationHOC()))  // Component handler
```

This provides seamless integration between the module system and React components.

## Dependencies

This manager depends on:
- `@owlmeans/auth` - Core authentication functionality
- `@owlmeans/auth-common` - Shared authentication components
- `@owlmeans/client` - Client-side framework functionality
- `@owlmeans/client-module` - Client module system
- `@owlmeans/error` - Error management system
- `react` - React framework for UI components

## Related Packages

- [`@owlmeans/client-auth`](../../../README.md) - Parent client authentication package
- [`@owlmeans/server-auth/manager`](../../../server-auth/src/manager/README.md) - Server-side authentication manager
- [`@owlmeans/auth`](../../../auth/README.md) - Core authentication library
- [`@owlmeans/client`](../../../client/README.md) - Client-side framework