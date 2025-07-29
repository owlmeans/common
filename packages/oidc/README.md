# @owlmeans/oidc

OpenID Connect (OIDC) integration library for OwlMeans Common applications. This package provides shared OIDC functionality, including provider configuration, authentication flows, and standardized modules for implementing OIDC relying party and provider services.

## Overview

The `@owlmeans/oidc` package serves as the foundation for OIDC authentication in the OwlMeans ecosystem, providing:

- **OIDC Provider Configuration**: Standardized configuration for OIDC identity providers
- **Authentication Modules**: Pre-built modules for OIDC authentication flows
- **Guard Services**: OIDC-based authentication guards for API protection
- **Client Integration**: Support for OIDC relying party implementations
- **Provider Support**: Foundation for OIDC identity provider services
- **Flow Management**: Integration with OwlMeans flow system for authentication workflows
- **Multi-Provider Support**: Configuration and management of multiple OIDC providers

## Installation

```bash
npm install @owlmeans/oidc
```

## Core Concepts

### OIDC Provider Configuration

The package defines standardized configuration structures for OIDC identity providers, supporting both public and private providers with flexible client configurations.

### Authentication Modules

Pre-built modules handle OIDC authentication flows, including initialization, callback processing, and token management.

### Guard Services

OIDC guards provide authentication and authorization for API endpoints using OIDC tokens.

### Multi-Tenant Support

Support for multiple OIDC providers with entity-specific bindings and restriction capabilities.

## API Reference

### Types

#### `OidcSharedConfig`
Main configuration interface for OIDC functionality.

```typescript
interface OidcSharedConfig {
  clientCookie?: {
    interaction?: {
      name?: string     // Cookie name for interactions
      ttl?: number      // Time-to-live for interaction cookies
    }
  }
  providers?: OidcProviderConfig[]              // OIDC provider configurations
  restrictedProviders?: boolean | string[]      // Provider access restrictions
}
```

#### `OidcProviderConfig`
Configuration for individual OIDC providers.

```typescript
interface OidcProviderConfig extends OidcProviderDescriptor {
  internal?: boolean        // Internal use only flag
  apiClientId?: string     // Administrative client ID
}
```

#### `OidcProviderDescriptor`
Core provider configuration.

```typescript
interface OidcProviderDescriptor {
  entityId?: string         // Entity binding
  service?: string          // Service identifier
  discoveryUrl?: string     // OIDC discovery endpoint
  basePath?: string         // Base path for OIDC endpoints
  clientId: string          // OAuth2 client ID
  secret?: string           // Client secret
  extraScopes?: string      // Additional OAuth2 scopes
  idOverride?: string       // Provider ID override
  def?: boolean            // Default provider flag (client-side)
}
```

#### `WithSharedConfig`
Interface for configurations that include OIDC settings.

```typescript
interface WithSharedConfig {
  oidc: OidcSharedConfig
}
```

### Constants

#### Module Identifiers
```typescript
const OIDC_AUTHEN_MODULE = 'iam-oidc-authen'        // OIDC authentication module
const PROVIDER_INTERACTION = 'oidc-server:interaction'  // Provider interaction module
const OIDC_CLIENT_AUTH = 'oidc-client'               // Client authentication module
```

#### Flow and Guard Constants
```typescript
const OIDC_FLOW = 'oidc'                  // OIDC authentication flow
const OIDC_GUARD = 'guard:oidc'           // OIDC guard service
const OIDC_GUARD_CACHE = 'resource:oidc-guard:cache'  // Guard cache resource
const OIDC_GATE = 'oidc-gate'             // OIDC gate service
```

#### Dispatcher Constants
```typescript
const DISPATCHER_OIDC_INIT = 'dispatcher:oidc:init'         // OIDC initialization
const DISPATCHER_OIDC = 'dispatcher:oidc:authenticate'      // OIDC authentication
```

#### Path and Parameter Constants
```typescript
const DEFAULT_PATH = 'oidc'                    // Default OIDC base path
const DEFAULT_FRONT = 'oidc-client'            // Default frontend identifier
const INTERACTION_PATH = '/interaction/:uid'   // Interaction endpoint path
const OIDC_CODE_QUERY = 'code'                // Authorization code query parameter
```

### Pre-built Modules

The package exports pre-configured modules for OIDC authentication:

#### OIDC Initialization Module
Handles OIDC authentication initialization requests.

```typescript
// Route: POST /authenticate/oidc/init
// Validates: OIDCAuthInitParamsSchema
```

#### OIDC Processing Module  
Handles OIDC authentication callback processing.

```typescript
// Route: POST /authenticate/oidc/process
// Validates: OIDCClientAuthPayloadSchema
```

## Usage Examples

### Basic OIDC Configuration

```typescript
import { OidcSharedConfig } from '@owlmeans/oidc'

const oidcConfig: OidcSharedConfig = {
  clientCookie: {
    interaction: {
      name: 'oidc_interaction',
      ttl: 3600  // 1 hour
    }
  },
  providers: [
    {
      clientId: 'my-app-client',
      secret: 'client-secret',
      discoveryUrl: 'https://auth.example.com/.well-known/openid_configuration',
      extraScopes: 'profile email',
      def: true  // Default provider
    }
  ]
}
```

### Multi-Provider Configuration

```typescript
const multiProviderConfig: OidcSharedConfig = {
  providers: [
    {
      clientId: 'google-client-id',
      discoveryUrl: 'https://accounts.google.com/.well-known/openid_configuration',
      service: 'google',
      extraScopes: 'profile email'
    },
    {
      clientId: 'microsoft-client-id', 
      discoveryUrl: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid_configuration',
      service: 'microsoft',
      extraScopes: 'profile email'
    },
    {
      clientId: 'internal-client-id',
      secret: 'internal-secret',
      discoveryUrl: 'https://internal-auth.company.com/.well-known/openid_configuration',
      service: 'internal',
      internal: true,  // Internal use only
      entityId: 'company-employees'
    }
  ],
  restrictedProviders: ['internal']  // Restrict access to internal provider
}
```

### Entity-Specific Provider Configuration

```typescript
const entitySpecificConfig: OidcSharedConfig = {
  providers: [
    {
      clientId: 'org-a-client',
      secret: 'org-a-secret',
      discoveryUrl: 'https://auth-org-a.example.com/.well-known/openid_configuration',
      entityId: 'organization-a',
      service: 'org-a'
    },
    {
      clientId: 'org-b-client',
      secret: 'org-b-secret', 
      discoveryUrl: 'https://auth-org-b.example.com/.well-known/openid_configuration',
      entityId: 'organization-b',
      service: 'org-b'
    }
  ]
}
```

### OIDC Module Integration

```typescript
import { modules } from '@owlmeans/oidc'
import { createBasicContext } from '@owlmeans/context'

// Create context with OIDC modules
const context = createBasicContext({
  oidc: oidcConfig
})

// Register OIDC modules
modules.forEach(module => {
  context.registerModule(module)
})

// Initialize context
await context.init()
```

### Custom OIDC Module

```typescript
import { module, body, filter } from '@owlmeans/module'
import { route, RouteMethod, backend } from '@owlmeans/route'

const customOidcModule = module(
  route('custom-oidc-login', '/auth/custom/login', backend(null, RouteMethod.POST)),
  filter(body(CustomOIDCSchema)),
  // Custom handler implementation
  async (request, reply) => {
    const { provider, redirectUri } = request.body
    
    // Custom OIDC initialization logic
    const authUrl = await generateOIDCAuthUrl(provider, redirectUri)
    
    reply.resolve({ authUrl }, ModuleOutcome.Ok)
  }
)
```

### OIDC Guard Usage

```typescript
import { OIDC_GUARD } from '@owlmeans/oidc'

// Protect API endpoint with OIDC guard
const protectedModule = module(
  route('protected-api', '/api/protected', backend()),
  // Guard will validate OIDC tokens
  { guards: [OIDC_GUARD] },
  async (request, reply) => {
    // Access authenticated user from OIDC token
    const user = request.auth?.user
    
    const data = await getProtectedData(user.id)
    reply.resolve(data)
  }
)
```

### Provider Restriction Implementation

```typescript
// Configuration with provider restrictions
const restrictedConfig: OidcSharedConfig = {
  providers: [
    { clientId: 'public-provider', service: 'public' },
    { clientId: 'internal-provider', service: 'internal', internal: true },
    { clientId: 'partner-provider', service: 'partner' }
  ],
  // Only allow internal and partner providers
  restrictedProviders: ['internal', 'partner']
}

// Check if provider is allowed
const isProviderAllowed = (providerId: string, config: OidcSharedConfig) => {
  const { restrictedProviders } = config
  
  if (restrictedProviders === false) {
    return false  // No providers allowed
  }
  
  if (restrictedProviders === true) {
    // Only default provider allowed
    const defaultProvider = config.providers?.find(p => p.def)
    return defaultProvider?.service === providerId
  }
  
  if (Array.isArray(restrictedProviders)) {
    return restrictedProviders.includes(providerId)
  }
  
  return true  // All providers allowed
}
```

### OIDC Flow Integration

```typescript
import { OIDC_FLOW } from '@owlmeans/oidc'
import { makeFlowModel } from '@owlmeans/flow'

// Create OIDC authentication flow
const oidcFlow = await makeFlowModel(OIDC_FLOW, flowProvider)

// Start authentication flow
oidcFlow.target('auth-service')
oidcFlow.entity('user-123')

// Navigate through flow steps
const initState = oidcFlow.transit('init', true, 'Starting OIDC auth')
const authState = oidcFlow.transit('authenticate', true, 'Provider selected')
const completeState = oidcFlow.transit('complete', true, 'Authentication successful')
```

### Token Validation

```typescript
import { OIDC_WRAPPED_TOKEN, WRAPPED_OIDC } from '@owlmeans/oidc'

// Validate OIDC token
const validateOIDCToken = async (token: string, providerId: string) => {
  // Extract provider configuration
  const provider = oidcConfig.providers?.find(p => p.service === providerId)
  if (!provider) {
    throw new Error('Provider not found')
  }
  
  // Validate token with provider
  const tokenInfo = await validateWithProvider(token, provider)
  
  // Wrap token for internal use
  return {
    type: OIDC_WRAPPED_TOKEN,
    token: tokenInfo.access_token,
    user: tokenInfo.userInfo,
    provider: providerId
  }
}
```

### Custom Provider Discovery

```typescript
// Dynamic provider discovery
const discoverOIDCProvider = async (discoveryUrl: string) => {
  const response = await fetch(discoveryUrl)
  const discovery = await response.json()
  
  return {
    authorizationEndpoint: discovery.authorization_endpoint,
    tokenEndpoint: discovery.token_endpoint,
    userinfoEndpoint: discovery.userinfo_endpoint,
    jwksUri: discovery.jwks_uri,
    issuer: discovery.issuer
  }
}

// Use discovered endpoints
const provider: OidcProviderConfig = {
  clientId: 'dynamic-client',
  discoveryUrl: 'https://example.com/.well-known/openid_configuration',
  service: 'dynamic-provider'
}

const endpoints = await discoverOIDCProvider(provider.discoveryUrl!)
```

## Advanced Features

### Administrative API Integration

```typescript
// Provider with administrative capabilities
const adminProviderConfig: OidcProviderConfig = {
  clientId: 'public-client-id',
  secret: 'public-client-secret',
  discoveryUrl: 'https://auth.example.com/.well-known/openid_configuration',
  apiClientId: 'admin-client-id',  // For administrative operations
  service: 'managed-provider'
}

// Use administrative client for user management
const manageUsers = async (provider: OidcProviderConfig) => {
  const adminToken = await getAdminToken(provider.apiClientId!)
  
  // Perform administrative operations
  const users = await listUsers(adminToken)
  return users
}
```

### Cookie Configuration

```typescript
// Custom cookie configuration for interactions
const cookieConfig: OidcSharedConfig = {
  clientCookie: {
    interaction: {
      name: 'app_oidc_session',
      ttl: 7200  // 2 hours
    }
  }
}

// Use in OIDC interaction handling
const handleInteraction = (req: Request, res: Response) => {
  const cookieName = cookieConfig.clientCookie?.interaction?.name || 'oidc_interaction'
  const ttl = cookieConfig.clientCookie?.interaction?.ttl || 3600
  
  res.cookie(cookieName, interactionData, {
    maxAge: ttl * 1000,
    httpOnly: true,
    secure: true
  })
}
```

### Error Handling

```typescript
import { OIDCError } from '@owlmeans/oidc'

try {
  const result = await authenticateWithOIDC(provider, token)
  return result
} catch (error) {
  if (error instanceof OIDCError) {
    console.error('OIDC authentication failed:', error.message)
    
    // Handle specific OIDC errors
    switch (error.code) {
      case 'invalid_token':
        // Handle invalid token
        break
      case 'provider_unavailable':
        // Handle provider unavailability
        break
      default:
        // Handle generic OIDC error
    }
  }
  
  throw error
}
```

## Integration with OwlMeans Ecosystem

The `@owlmeans/oidc` package integrates with:

- **@owlmeans/auth**: Core authentication types and interfaces
- **@owlmeans/auth-common**: Common authentication utilities and guards
- **@owlmeans/module**: Module system for OIDC endpoints
- **@owlmeans/route**: Routing system for OIDC flows
- **@owlmeans/flow**: Flow management for authentication workflows
- **@owlmeans/context**: Configuration and service management
- **@owlmeans/server-oidc-provider**: Server-side OIDC provider implementation
- **@owlmeans/server-oidc-rp**: Server-side relying party implementation
- **@owlmeans/web-oidc-rp**: Web-based relying party implementation

## Security Considerations

- Always use HTTPS for OIDC endpoints and redirects
- Validate all tokens received from OIDC providers
- Implement proper CSRF protection for authentication flows
- Use secure cookies for session management
- Validate provider discovery documents
- Implement proper token storage and cleanup
- Use appropriate scopes and minimize requested permissions

## Best Practices

### Configuration Management
- Store client secrets securely using environment variables
- Use discovery URLs when possible for dynamic configuration
- Implement proper provider validation and filtering
- Regular review and rotation of client credentials

### Multi-Provider Setup
- Use meaningful service identifiers for providers
- Implement proper provider selection UI/UX
- Handle provider-specific error scenarios
- Implement fallback authentication methods

### Security
- Validate all OIDC tokens before trusting claims
- Implement proper session timeout and cleanup
- Use appropriate redirect URI validation
- Monitor for suspicious authentication patterns

### Performance
- Cache provider discovery documents appropriately
- Implement efficient token validation
- Use connection pooling for provider communication
- Monitor and optimize authentication flow performance

Fixes #32.