# @owlmeans/server-oidc-rp

The **@owlmeans/server-oidc-rp** package provides server-side OpenID Connect Relying Party (RP) functionality for OwlMeans Common Libraries, enabling secure authentication and authorization through OIDC protocols in fullstack applications.

## Purpose

This package serves as a comprehensive OIDC client implementation for server-side applications, specifically designed for:

- **OIDC Client Management**: Create and manage OpenID Connect clients with automatic discovery
- **Token Operations**: Handle authorization code grants, client credentials, token refresh, and introspection
- **Provider Integration**: Connect to multiple OIDC providers with flexible configuration
- **Account Linking**: Link external OIDC accounts with internal user profiles
- **Security Integration**: Integrate with OwlMeans authentication and authorization system
- **Module-based Authentication**: Provide OIDC guards and gates for route protection

## Key Concepts

### OpenID Connect Relying Party
A Relying Party (RP) is an OAuth 2.0 client application that uses OpenID Connect to verify the identity of end-users. This package implements server-side RP functionality.

### Provider Configuration
The package supports multiple OIDC providers with configuration including discovery URLs, client credentials, and service mappings.

### Account Linking
Enables linking external OIDC provider accounts with internal user accounts, supporting both automatic linking and manual credential mapping.

### Token Management
Comprehensive token lifecycle management including acquisition, refresh, introspection, and validation.

## Installation

```bash
npm install @owlmeans/server-oidc-rp
```

## API Reference

### Types

#### `OidcClientService`
Main service interface for OIDC client operations.

```typescript
interface OidcClientService extends InitializedService {
  getConfiguration(clientId: string | Partial<OidcProviderConfig>): Promise<OidcClientDescriptor>
  getClient(clientId: string | OidcClientDescriptor | Partial<OidcProviderConfig>): Promise<OidcClientAdapter>
  getConfig(clientId: string | Partial<OidcProviderConfig>): Promise<OidcProviderConfig | undefined>
  getDefault(): string | undefined
  
  registerTemporaryProvider(config: OidcProviderConfig): OidcProviderConfig
  unregisterTemporaryProvider(params: Partial<OidcProviderConfig>): void
  hasProvider(params: Partial<OidcProviderConfig>): boolean
  entityToClientId(params: Partial<OidcProviderConfig>): string
  
  providerApi(): ProviderApiService | null
  accountLinking(): AccountLinkingService | null
}
```

#### `OidcClientAdapter`
Interface for individual OIDC client instances.

```typescript
interface OidcClientAdapter {
  getMetadata(): ServerMetadata
  getClientId(): string
  getConfig(): OidcProviderConfig
  makeAuthUrl(params: Record<string, string>): string
  grantWithCredentials(): Promise<TokenSet>
  grantWithCode(currentUrl: string, checks: AuthorizationCodeGrantChecks, params: Record<string, string>): Promise<TokenSet>
  refresh(tokenSet: TokenSetParameters | string): Promise<TokenSetParameters>
  introspect(tokenSet: TokenSetParameters, type?: string): Promise<IntrospectionResponse>
}
```

#### `AccountLinkingService`
Service interface for linking OIDC accounts with internal profiles.

```typescript
interface AccountLinkingService extends InitializedService {
  getLinkedProfile(details: ProviderProfileDetails): Promise<AuthPayload | null>
  linkProfile(details: ProviderProfileDetails, meta: AccountMeta): Promise<AuthPayload>
  linkCredentials(details: ProviderProfileDetails): Promise<AuthPayload>
  getOwnerProfiles(entityId: string): Promise<Profile[]>
  getOwnerCredentials(userId: string, entityId?: string, type?: string): Promise<AuthCredentials | undefined>
}
```

#### `ProviderApiService`
Service interface for interacting with OIDC provider APIs.

```typescript
interface ProviderApiService extends InitializedService {
  getUserDetails(token: string, userId: string): Promise<OidcUserDetails>
  getSettings(token: string, realm: string): Promise<OidcProviderSettings>
}
```

#### `Config`
Configuration interface extending ServerConfig.

```typescript
interface Config extends ServerConfig, WithSharedConfig {
  oidc: OidcRpConfig
}

interface OidcRpConfig extends OidcSharedConfig {
  accountLinkingService?: string
  providerApiService?: string
}
```

### Factory Functions

#### `makeOidcClientService(alias?: string): OidcClientService`

Creates an OIDC client service instance.

**Parameters:**
- `alias`: Service alias (defaults to 'oidc-client')

**Returns:** OidcClientService instance

```typescript
import { makeOidcClientService } from '@owlmeans/server-oidc-rp'

const oidcService = makeOidcClientService('my-oidc-client')
```

### Guard Functions

#### `appendOidcGuard<C extends Config, T extends Context<C>>(context: T, opts?: OidcGuardOptions): T`

Appends OIDC guard functionality to a context.

**Parameters:**
- `context`: Server context instance
- `opts`: Optional OIDC guard configuration

**Returns:** Enhanced context with OIDC guard capabilities

```typescript
import { appendOidcGuard } from '@owlmeans/server-oidc-rp'

const enhancedContext = appendOidcGuard(context, {
  defaultProvider: 'keycloak'
})
```

#### `setupOidcGuard(modules: CommonModule[], coguards?: string | string[]): void`

Sets up OIDC guard functionality for modules.

**Parameters:**
- `modules`: Array of modules to enhance
- `coguards`: Optional co-guard configurations

```typescript
import { setupOidcGuard } from '@owlmeans/server-oidc-rp'

setupOidcGuard(modules, ['authenticated', 'oidc-verified'])
```

### Module Setup

#### `setupAuthServiceModules(modules: CommonModule[], serviceAlias: string, prefix?: string): void`

Sets up authentication service modules with OIDC routes.

**Parameters:**
- `modules`: Array of modules to add OIDC routes to
- `serviceAlias`: Service alias for the routes
- `prefix`: URL prefix for OIDC routes (defaults to 'oidc-api')

```typescript
import { setupAuthServiceModules } from '@owlmeans/server-oidc-rp'

setupAuthServiceModules(modules, 'auth-service', 'oidc-api')
```

### Constants

#### Service Aliases
```typescript
const DEFAULT_ALIAS = 'oidc-client'
const DEF_OIDC_ACCOUNT_LINKING = 'oidc-consumer-account-linking'
const DEF_OIDC_PROVIDER_API = 'oidc-consumer-provider-api'
```

#### Route Definitions
```typescript
const authService = {
  provider: {
    list: 'external-auth:provider:list'
  },
  auth: {
    update: 'external-auth:auth:update'
  }
}
```

#### Cache and Timing Constants
```typescript
const OIDC_TOKEN_STORE = 'oidc-token-store'
const PROVIDER_CACHE_TTL = (5 * 60 - 1) * 1000    // ~5 minutes
const OIDC_AUTH_LIFTETIME = 24 * 3600 * 1000      // 24 hours
const OIDC_WRAP_FRESHNESS = (5 * 60 - 1) * 1000   // ~5 minutes
```

## Usage Examples

### Basic OIDC Client Setup

```typescript
import { makeOidcClientService, setupOidcGuard } from '@owlmeans/server-oidc-rp'
import { makeServerContext, makeServerConfig } from '@owlmeans/server-context'

// Create server context with OIDC configuration
const config = makeServerConfig('auth-server', {
  oidc: {
    providers: [{
      clientId: 'my-app',
      secret: 'client-secret',
      service: 'keycloak',
      basePath: '/realms/my-realm',
      def: true
    }]
  }
})

const context = makeServerContext(config)

// Create and register OIDC client service
const oidcService = makeOidcClientService()
context.registerService(oidcService)

// Initialize context
await context.configure().init()
```

### Using OIDC Client

```typescript
// Get the OIDC service
const oidcService = context.service<OidcClientService>('oidc-client')

// Get OIDC client for default provider
const defaultClientId = oidcService.getDefault()
const client = await oidcService.getClient(defaultClientId!)

// Create authorization URL
const authUrl = client.makeAuthUrl({
  redirect_uri: 'https://myapp.com/callback',
  scope: 'openid profile email',
  state: 'random-state'
})

console.log('Redirect user to:', authUrl)
```

### Authorization Code Flow

```typescript
// Handle callback from OIDC provider
app.get('/callback', async (req, res) => {
  const client = await oidcService.getClient('my-app')
  
  try {
    const tokenSet = await client.grantWithCode(
      req.url,
      { 
        state: req.query.state,
        code_verifier: 'stored-code-verifier' // if using PKCE
      },
      { flow: 'authorization_code' }
    )
    
    console.log('Access token:', tokenSet.access_token)
    console.log('ID token:', tokenSet.id_token)
    
    // Store tokens securely
    res.redirect('/dashboard')
  } catch (error) {
    console.error('OIDC authentication failed:', error)
    res.redirect('/login?error=auth_failed')
  }
})
```

### Client Credentials Flow

```typescript
// Get access token using client credentials
const client = await oidcService.getClient('service-account')
const tokenSet = await client.grantWithCredentials()

console.log('Service access token:', tokenSet.access_token)

// Use token for API calls
const response = await fetch('https://api.service.com/data', {
  headers: {
    'Authorization': `Bearer ${tokenSet.access_token}`
  }
})
```

### Token Refresh

```typescript
// Refresh an expired token
try {
  const newTokenSet = await client.refresh(oldTokenSet)
  console.log('New access token:', newTokenSet.access_token)
} catch (error) {
  console.error('Token refresh failed:', error)
  // Redirect to login
}
```

### Token Introspection

```typescript
// Validate and introspect a token
const introspection = await client.introspect(tokenSet, 'access_token')

if (introspection.active) {
  console.log('Token is valid')
  console.log('Token expires at:', new Date(introspection.exp! * 1000))
  console.log('Token subject:', introspection.sub)
} else {
  console.log('Token is invalid or expired')
}
```

### Multiple Provider Configuration

```typescript
const config = makeServerConfig('multi-provider-app', {
  oidc: {
    providers: [
      {
        clientId: 'keycloak-client',
        secret: 'secret1',
        service: 'keycloak',
        basePath: '/realms/main',
        def: true
      },
      {
        clientId: 'google-client',
        secret: 'secret2',
        discoveryUrl: 'https://accounts.google.com/.well-known/openid_configuration'
      }
    ]
  }
})

// Get specific provider clients
const keycloakClient = await oidcService.getClient('keycloak-client')
const googleClient = await oidcService.getClient('google-client')
```

### Account Linking

```typescript
// Setup account linking service
const accountLinkingService: AccountLinkingService = createService('account-linking', {
  getLinkedProfile: async (details) => {
    // Check if external profile is already linked
    const existing = await database.findLinkedAccount(details.sub, details.iss)
    return existing ? existing.authPayload : null
  },
  
  linkProfile: async (details, meta) => {
    // Link external account to existing user
    const user = await database.findUserByUsername(meta.username)
    await database.linkExternalAccount(user.id, details)
    return createAuthPayload(user)
  },
  
  linkCredentials: async (details) => {
    // Auto-link based on email or other criteria
    const user = await database.findUserByEmail(details.email)
    if (user) {
      await database.linkExternalAccount(user.id, details)
      return createAuthPayload(user)
    }
    throw new Error('No matching user found')
  }
})

context.registerService(accountLinkingService)
```

### Module Protection with OIDC Guards

```typescript
import { module, guard } from '@owlmeans/module'
import { route } from '@owlmeans/route'

// Create protected modules
const protectedModules = [
  module(route('profile', '/profile'), guard('oidc-authenticated')),
  module(route('admin', '/admin'), guard(['oidc-authenticated', 'admin-role']))
]

// Setup OIDC guards
setupOidcGuard(protectedModules, 'oidc-authenticated')
```

## Error Handling

The package throws `AuthManagerError` for various OIDC-related issues:

```typescript
import { AuthManagerError } from '@owlmeans/auth'

try {
  const client = await oidcService.getClient('invalid-client')
} catch (error) {
  if (error instanceof AuthManagerError) {
    switch (error.message) {
      case 'oidc.client.basepath':
        console.error('OIDC provider base path not configured')
        break
      case 'oidc.client.service':
        console.error('OIDC provider service not specified')
        break
      case 'oidc.client.client-id':
        console.error('OIDC client ID missing')
        break
      case 'oidc.client.secert':
        console.error('OIDC client secret missing')
        break
      default:
        console.error('OIDC error:', error.message)
    }
  }
}
```

## Integration Patterns

### Express.js Integration

```typescript
import express from 'express'
import { makeOidcClientService } from '@owlmeans/server-oidc-rp'

const app = express()

// OIDC login route
app.get('/login/:provider?', async (req, res) => {
  const providerId = req.params.provider || oidcService.getDefault()
  const client = await oidcService.getClient(providerId!)
  
  const authUrl = client.makeAuthUrl({
    redirect_uri: `${req.protocol}://${req.get('host')}/callback`,
    scope: 'openid profile email',
    state: generateState()
  })
  
  res.redirect(authUrl)
})

// OIDC callback route
app.get('/callback', async (req, res) => {
  // Handle authorization code flow as shown above
})
```

### API Gateway Integration

```typescript
// Create API gateway with OIDC token validation
const validateToken = async (req: Request) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header')
  }
  
  const token = authHeader.substring(7)
  const client = await oidcService.getClient(oidcService.getDefault()!)
  
  const introspection = await client.introspect({ access_token: token })
  if (!introspection.active) {
    throw new Error('Invalid or expired token')
  }
  
  return introspection
}
```

## Best Practices

1. **Secure Configuration**: Store client secrets securely and never expose them in client-side code
2. **Token Storage**: Store tokens securely with appropriate encryption and expiration handling
3. **Error Handling**: Implement comprehensive error handling for all OIDC operations
4. **Provider Discovery**: Use OIDC discovery when possible for automatic configuration
5. **Token Validation**: Always validate tokens before using them for authorization decisions
6. **Account Linking**: Implement secure account linking with proper user consent flows
7. **Monitoring**: Monitor OIDC operations for security and performance issues

## Dependencies

This package depends on:
- `@owlmeans/auth` - Authentication framework
- `@owlmeans/auth-common` - Common authentication utilities
- `@owlmeans/context` - Context management
- `@owlmeans/oidc` - Core OIDC functionality
- `@owlmeans/server-context` - Server context management
- `@owlmeans/server-module` - Server module system
- `openid-client` - OpenID Connect client library
- `jose` - JSON Web Token utilities

## Related Packages

- [`@owlmeans/web-oidc-rp`](../web-oidc-rp) - Web client OIDC Relying Party
- [`@owlmeans/oidc`](../oidc) - Core OIDC functionality
- [`@owlmeans/server-auth`](../server-auth) - Server authentication framework
- [`@owlmeans/auth`](../auth) - Authentication foundation