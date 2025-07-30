# @owlmeans/web-oidc-rp

The **@owlmeans/web-oidc-rp** package provides web client-side OpenID Connect Relying Party (RP) functionality for OwlMeans Common Libraries, enabling secure authentication and authorization through OIDC protocols in React-based frontend applications.

## Purpose

This package serves as a comprehensive OIDC client implementation for web applications, specifically designed for:

- **Frontend OIDC Authentication**: Handle OIDC authentication flows in React applications
- **Flow Integration**: Integrate with OwlMeans flow system for complex authentication workflows
- **Automatic Token Management**: Handle OIDC authentication callbacks and token processing
- **React Components**: Provide ready-to-use React components for OIDC integration
- **Server Communication**: Coordinate with server-side OIDC relying party implementation
- **Authentication State Management**: Manage authentication state across the application

## Key Concepts

### Web-based OIDC Relying Party
This package implements the client-side portion of OIDC authentication, handling redirects, callbacks, and token management in web browsers.

### Flow-based Authentication
Integrates with the OwlMeans flow system to support complex authentication workflows that may involve multiple steps and decision points.

### Server-Client Coordination
Works in tandem with `@owlmeans/server-oidc-rp` to provide a complete OIDC solution where the server handles sensitive operations and the client manages user interactions.

### Authentication Dispatcher
Provides a dispatcher component that automatically handles OIDC callbacks and coordinates authentication state.

## Installation

```bash
npm install @owlmeans/web-oidc-rp
```

## API Reference

### Types

#### `OidcAuthService`
Main service interface for web-based OIDC operations.

```typescript
interface OidcAuthService extends InitializedService {
  dispatch(params: Record<string, string>): Promise<boolean>
  authenticate(flow: FlowModel, params: OIDCAuthInitParams): Promise<string | null>
  proceedToRedirectUrl(extras: OidcAuthRedirectExtras): Promise<string>
  dispatchClientOnly(): Promise<void>
}
```

#### `OidcAuthRedirectExtras`
Configuration for OIDC redirect operations.

```typescript
interface OidcAuthRedirectExtras extends FlowPayload {
  purpose: OidcAuthPurposes
  uid?: string
  alias?: string
}
```

#### `OidcInteraction`
Resource record for storing OIDC interaction data.

```typescript
interface OidcInteraction extends ResourceRecord {
  authUrl: string
}
```

#### `Config`
Configuration interface extending AppConfig.

```typescript
interface Config extends AppConfig, WithSharedConfig { }
```

#### `Context`
Context interface for web applications.

```typescript
interface Context<C extends Config = Config> extends AppContext<C> { }
```

### Enums

#### `OidcAuthPurposes`
Enumeration of OIDC authentication purposes.

```typescript
enum OidcAuthPurposes {
  Unknown = 'unknown',
  Subscribe = 'subscribe',
  Login = 'login'
}
```

### Factory Functions

#### `makeOidcAuthService(alias?: string): OidcAuthService`

Creates an OIDC authentication service instance for web applications.

**Parameters:**
- `alias`: Service alias (defaults to 'oidc-rp')

**Returns:** OidcAuthService instance

```typescript
import { makeOidcAuthService } from '@owlmeans/web-oidc-rp'

const oidcService = makeOidcAuthService('web-oidc-auth')
```

### React Components

#### `Dispatcher`
Higher-order component that handles OIDC authentication callbacks and token processing.

```typescript
const Dispatcher = DispatcherHOC(({ provideToken, navigate }) => {
  // Component implementation handles OIDC callback processing
})
```

**Props:**
- `provideToken`: Function to provide authentication tokens
- `navigate`: Function to handle navigation after authentication

### Constants

#### Service Configuration
```typescript
const DEFAULT_ALIAS = 'oidc-rp'
```

## Usage Examples

### Basic Setup

```typescript
import { makeOidcAuthService } from '@owlmeans/web-oidc-rp'
import { makeAppContext, makeAppConfig } from '@owlmeans/web-client'

// Create app context with OIDC configuration
const config = makeAppConfig('web-app', {
  oidc: {
    // OIDC configuration shared with server
  }
})

const context = makeAppContext(config)

// Create and register OIDC service
const oidcService = makeOidcAuthService()
context.registerService(oidcService)

// Initialize context
await context.configure().init()
```

### React Application Integration

```typescript
import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Dispatcher } from '@owlmeans/web-oidc-rp'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/callback" element={<Dispatcher />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

function LoginPage() {
  const context = useContext()
  const oidcService = context.service<OidcAuthService>('oidc-rp')
  
  const handleOidcLogin = async () => {
    const flow = await context.service<FlowService>('flow').createFlow('oidc-auth')
    const redirectUrl = await oidcService.authenticate(flow, {
      entity: 'my-organization',
      profile: 'user-profile'
    })
    
    if (redirectUrl) {
      window.location.href = redirectUrl
    }
  }
  
  return (
    <div>
      <button onClick={handleOidcLogin}>
        Login with OIDC
      </button>
    </div>
  )
}
```

### OIDC Authentication Flow

```typescript
import { useFlow } from '@owlmeans/web-flow'
import { useContext } from '@owlmeans/web-client'
import { OidcAuthService } from '@owlmeans/web-oidc-rp'

function useOidcAuth() {
  const context = useContext()
  const flowClient = useFlow()
  const oidcService = context.service<OidcAuthService>('oidc-rp')
  
  const initiateAuth = async (entityId: string, profileId?: string) => {
    if (!flowClient) return null
    
    const flow = flowClient.flow()
    const redirectUrl = await oidcService.authenticate(flow, {
      entity: entityId,
      profile: profileId
    })
    
    return redirectUrl
  }
  
  const handleCallback = async (urlParams: URLSearchParams) => {
    const params: Record<string, string> = {}
    urlParams.forEach((value, key) => {
      params[key] = value
    })
    
    return await oidcService.dispatch(params)
  }
  
  return { initiateAuth, handleCallback }
}
```

### Custom Dispatcher Implementation

```typescript
import { useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useContext } from '@owlmeans/web-client'
import { OidcAuthService } from '@owlmeans/web-oidc-rp'

function CustomOidcDispatcher() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const context = useContext()
  
  useEffect(() => {
    const processCallback = async () => {
      try {
        const oidcService = context.service<OidcAuthService>('oidc-rp')
        
        const params: Record<string, string> = {}
        searchParams.forEach((value, key) => {
          params[key] = value
        })
        
        const success = await oidcService.dispatch(params)
        
        if (success) {
          setStatus('success')
          // Redirect to intended destination
          window.location.href = '/dashboard'
        } else {
          setStatus('error')
        }
      } catch (error) {
        console.error('OIDC callback processing failed:', error)
        setStatus('error')
      }
    }
    
    processCallback()
  }, [searchParams])
  
  return (
    <div>
      {status === 'loading' && <div>Processing authentication...</div>}
      {status === 'success' && <div>Authentication successful, redirecting...</div>}
      {status === 'error' && <div>Authentication failed. Please try again.</div>}
    </div>
  )
}
```

### Flow-based Authentication

```typescript
import { FlowModel } from '@owlmeans/flow'
import { OIDCAuthInitParams } from '@owlmeans/oidc'

function FlowBasedAuth() {
  const context = useContext()
  const oidcService = context.service<OidcAuthService>('oidc-rp')
  
  const startAuthFlow = async () => {
    // Create or get current flow
    const flowService = context.service<FlowService>('flow')
    const flow = await flowService.createFlow('oidc-authentication')
    
    // Configure OIDC parameters
    const params: OIDCAuthInitParams = {
      entity: 'my-organization',
      profile: 'default',
      purpose: 'login'
    }
    
    // Start authentication
    const redirectUrl = await oidcService.authenticate(flow, params)
    
    if (redirectUrl) {
      // Store flow state before redirect
      await flowService.persistFlow()
      
      // Redirect to OIDC provider
      window.location.href = redirectUrl
    }
  }
  
  return (
    <button onClick={startAuthFlow}>
      Start Secure Login Flow
    </button>
  )
}
```

### Advanced Redirect Handling

```typescript
import { OidcAuthRedirectExtras, OidcAuthPurposes } from '@owlmeans/web-oidc-rp'

async function handleComplexRedirect(
  oidcService: OidcAuthService,
  purpose: OidcAuthPurposes,
  userId?: string
) {
  const extras: OidcAuthRedirectExtras = {
    purpose,
    uid: userId,
    alias: 'dashboard'
  }
  
  try {
    const finalUrl = await oidcService.proceedToRedirectUrl(extras)
    window.location.href = finalUrl
  } catch (error) {
    console.error('Redirect processing failed:', error)
    // Handle error appropriately
  }
}
```

### Integration with Authentication Guards

```typescript
import { useAuth } from '@owlmeans/client-auth'
import { Navigate } from 'react-router-dom'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const context = useContext()
  const oidcService = context.service<OidcAuthService>('oidc-rp')
  
  useEffect(() => {
    const checkAuth = async () => {
      const token = await auth.authenticated()
      if (!token) {
        // Initiate OIDC authentication
        const flow = await context.service<FlowService>('flow').createFlow('auth')
        const redirectUrl = await oidcService.authenticate(flow, {
          entity: 'default'
        })
        
        if (redirectUrl) {
          window.location.href = redirectUrl
        }
      }
    }
    
    checkAuth()
  }, [])
  
  const isAuthenticated = auth.isAuthenticated()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}
```

## Error Handling

```typescript
import { useEffect, useState } from 'react'
import { OidcAuthService } from '@owlmeans/web-oidc-rp'

function useOidcErrorHandling() {
  const [error, setError] = useState<string | null>(null)
  const context = useContext()
  
  const handleOidcOperation = async (operation: () => Promise<any>) => {
    try {
      setError(null)
      return await operation()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'OIDC operation failed'
      setError(errorMessage)
      
      // Log error for debugging
      console.error('OIDC Error:', err)
      
      // Could also send to error reporting service
      return null
    }
  }
  
  return { error, handleOidcOperation }
}
```

## Integration Patterns

### Routing Integration

```typescript
import { Routes, Route } from 'react-router-dom'
import { Dispatcher } from '@owlmeans/web-oidc-rp'

function AppRoutes() {
  return (
    <Routes>
      {/* OIDC callback route */}
      <Route path="/auth/oidc/callback" element={<Dispatcher />} />
      
      {/* Other application routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/dashboard" element={<ProtectedDashboard />} />
    </Routes>
  )
}
```

### State Management Integration

```typescript
import { createContext, useContext as useReactContext } from 'react'
import { OidcAuthService } from '@owlmeans/web-oidc-rp'

const OidcContext = createContext<OidcAuthService | null>(null)

export function OidcProvider({ children }: { children: React.ReactNode }) {
  const context = useContext()
  const oidcService = context.service<OidcAuthService>('oidc-rp')
  
  return (
    <OidcContext.Provider value={oidcService}>
      {children}
    </OidcContext.Provider>
  )
}

export function useOidc() {
  const oidcService = useReactContext(OidcContext)
  if (!oidcService) {
    throw new Error('useOidc must be used within OidcProvider')
  }
  return oidcService
}
```

## Best Practices

1. **Secure Redirects**: Always validate redirect URLs and use HTTPS in production
2. **State Management**: Properly manage authentication state across page reloads
3. **Error Handling**: Implement comprehensive error handling for network and authentication failures
4. **Flow Integration**: Use flows for complex authentication scenarios
5. **Token Security**: Never expose sensitive tokens in client-side storage
6. **PKCE Support**: Use PKCE (Proof Key for Code Exchange) for enhanced security
7. **Callback Validation**: Always validate OIDC callback parameters before processing

## Dependencies

This package depends on:
- `@owlmeans/auth` - Authentication framework
- `@owlmeans/client` - Client framework
- `@owlmeans/client-auth` - Client authentication
- `@owlmeans/client-flow` - Client flow management
- `@owlmeans/flow` - Flow system
- `@owlmeans/oidc` - Core OIDC functionality
- `@owlmeans/web-client` - Web client framework
- `@owlmeans/web-flow` - Web flow integration
- `oidc-client-ts` - TypeScript OIDC client library
- `react` - React framework
- `react-router-dom` - React routing

## Related Packages

- [`@owlmeans/server-oidc-rp`](../server-oidc-rp) - Server-side OIDC Relying Party
- [`@owlmeans/oidc`](../oidc) - Core OIDC functionality
- [`@owlmeans/client-auth`](../client-auth) - Client authentication framework
- [`@owlmeans/web-client`](../web-client) - Web client framework
- [`@owlmeans/web-flow`](../web-flow) - Web flow management