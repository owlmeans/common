# @owlmeans/server-oidc-provider

Server-side OpenID Connect Provider implementation for OwlMeans applications. This package provides a complete OIDC identity provider service built on the industry-standard `oidc-provider` library, with seamless integration into the OwlMeans server ecosystem.

## Overview

The `@owlmeans/server-oidc-provider` package delivers a full-featured OIDC identity provider with:

- **Complete OIDC Provider**: Full OpenID Connect 1.0 and OAuth 2.0 implementation
- **Fastify Integration**: Seamless integration with OwlMeans server API framework
- **Account Management**: Pluggable account service for user authentication
- **Adapter Support**: Configurable storage adapters for sessions and tokens
- **Client Management**: Dynamic client registration and configuration
- **Interaction Flows**: Customizable authentication and consent flows
- **Security Features**: JWT signing, HTTPS support, and secure cookie handling
- **Proxy Support**: Works behind reverse proxies and load balancers

This package is part of the OwlMeans OIDC ecosystem:
- **@owlmeans/oidc**: Core OIDC types and utilities
- **@owlmeans/server-oidc-provider**: Server-side OIDC provider *(this package)*
- **@owlmeans/server-oidc-rp**: Server-side relying party
- **@owlmeans/web-oidc-provider**: Web UI for OIDC provider
- **@owlmeans/web-oidc-rp**: Web-based relying party

## Installation

```bash
npm install @owlmeans/server-oidc-provider oidc-provider fastify
```

## Dependencies

This package requires:
- `oidc-provider`: Industry-standard OIDC provider implementation
- `@owlmeans/server-api`: Server API framework with Fastify
- `@owlmeans/server-context`: Server context management
- `@owlmeans/oidc`: Core OIDC functionality
- `@owlmeans/config`: Configuration management
- `jose`: JWT operations
- `fastify`: HTTP server framework (peer dependency)

## Core Concepts

### OIDC Provider Service

The OIDC provider service manages the complete lifecycle of an OpenID Connect identity provider, including client management, user authentication, token issuance, and session management.

### Account Service

Pluggable account service interface that handles user authentication and account loading for the OIDC provider.

### Adapter Service

Configurable storage adapter service for persisting OIDC sessions, authorization codes, access tokens, and other provider data.

### Interaction Flows

Customizable authentication and consent flows that work with the OwlMeans client module system.

## API Reference

### Types

#### `OidcProviderService`

Main OIDC provider service interface.

```typescript
interface OidcProviderService extends InitializedService {
  oidc: Provider                                    // oidc-provider instance
  update(api: ApiServer): Promise<void>            // Update provider with API server
  instance(): Provider                             // Get provider instance
  getInteraction(id: string): Promise<Interaction | null>  // Get interaction by ID
}
```

#### `OidcConfig`

Configuration interface for OIDC provider.

```typescript
interface OidcConfig extends OidcSharedConfig {
  authService?: string                             // Authentication service name
  basePath?: string                               // Base path for OIDC endpoints
  frontBase?: string                              // Frontend base URL
  clients: ClientMetadata[]                       // OIDC client configurations
  customConfiguration?: Configuration             // Custom oidc-provider config
  behindProxy?: boolean                           // Behind reverse proxy flag
  defaultKeys: {                                  // Default signing keys
    RS256: {
      pk: string                                  // Private key (PEM format)
      pub?: string                                // Public key (PEM format)
    }
  }
  accountService?: string                         // Account service name
  adapterService?: string                         // Adapter service name
}
```

#### `OidcAccountService`

Interface for user account management.

```typescript
interface OidcAccountService extends InitializedService {
  loadById<C extends Config, T extends Context<C>>(
    ctx: T, 
    id: string
  ): Promise<Account | undefined>
}
```

#### `OidcAdapterService`

Interface for storage adapter management.

```typescript
interface OidcAdapterService extends InitializedService {
  instance(name: string): Adapter
}
```

#### `Config`

Extended server configuration with OIDC settings.

```typescript
interface Config extends ServerConfig, OidcConfigAppend {
  debug: ServerConfig["debug"] & {
    oidc?: boolean                                // General OIDC debugging
    oidcServer?: boolean                          // Server-specific debugging
    oidcData?: boolean                           // Data operation debugging
  }
}
```

### Factory Functions

#### `createOidcProviderService(alias?: string): OidcProviderService`

Creates an OIDC provider service instance.

**Parameters:**
- `alias`: Service alias (default: 'oidc-provider')

**Returns:** OidcProviderService instance

**Features:**
- Automatic provider configuration based on context settings
- Integration with account and adapter services
- Fastify middleware integration
- JWT key management
- Client configuration management

**Example:**
```typescript
import { createOidcProviderService } from '@owlmeans/server-oidc-provider'

const oidcProvider = createOidcProviderService('main-oidc')
```

#### `createOidcProviderMiddleware(web?: string, oidc?: string): Middleware`

Creates middleware to integrate OIDC provider with API server.

**Parameters:**
- `web`: API server service alias (default: 'api-server')
- `oidc`: OIDC provider service alias (default: 'oidc-provider')

**Returns:** Context middleware

**Example:**
```typescript
import { createOidcProviderMiddleware } from '@owlmeans/server-oidc-provider'

const oidcMiddleware = createOidcProviderMiddleware('api', 'oidc')
context.registerMiddleware(oidcMiddleware)
```

### Service Methods

#### `update(api: ApiServer): Promise<void>`

Updates the OIDC provider with the API server, registering all OIDC endpoints.

**Parameters:**
- `api`: API server instance to integrate with

**Process:**
1. Configures oidc-provider instance with context settings
2. Sets up account and adapter services
3. Configures interaction flows
4. Registers OIDC endpoints with Fastify server

**Example:**
```typescript
const oidcService = context.service<OidcProviderService>('oidc-provider')
const apiServer = context.service<ApiServer>('api')

await oidcService.update(apiServer)
```

#### `instance(): Provider`

Gets the underlying oidc-provider instance for direct access.

**Returns:** oidc-provider Provider instance

**Example:**
```typescript
const provider = oidcService.instance()

// Access oidc-provider methods directly
const client = await provider.Client.find('client-id')
const interaction = await provider.interactionDetails(req, res)
```

#### `getInteraction(id: string): Promise<Interaction | null>`

Retrieves an interaction by its unique identifier.

**Parameters:**
- `id`: Interaction identifier

**Returns:** Promise resolving to Interaction object or null

**Example:**
```typescript
const interaction = await oidcService.getInteraction('interaction-uuid')
if (interaction) {
  console.log('Interaction details:', interaction.params)
}
```

### Constants

```typescript
const DEFAULT_ALIAS = 'oidc-provider'              // Default service alias
const OIDC_ACCOUNT_SERVICE = 'oidc-account-service' // Default account service name
```

## Usage Examples

### Basic OIDC Provider Setup

```typescript
import { createOidcProviderService, createOidcProviderMiddleware } from '@owlmeans/server-oidc-provider'
import { makeServerContext } from '@owlmeans/server-context'
import { createApiServer } from '@owlmeans/server-api'

// Create server configuration with OIDC settings
const config = {
  service: 'auth-server',
  oidc: {
    basePath: 'oidc',
    clients: [
      {
        client_id: 'my-web-app',
        client_secret: 'secure-client-secret',
        redirect_uris: ['https://myapp.com/callback'],
        response_types: ['code'],
        grant_types: ['authorization_code', 'refresh_token'],
        scope: 'openid profile email'
      }
    ],
    defaultKeys: {
      RS256: {
        pk: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----`,
        pub: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtfGqPGwp...
-----END PUBLIC KEY-----`
      }
    }
  }
}

// Create context and services
const context = makeServerContext(config)
const apiServer = createApiServer('api')
const oidcProvider = createOidcProviderService('oidc')

// Register services and middleware
context.registerService(apiServer)
context.registerService(oidcProvider)
context.registerMiddleware(createOidcProviderMiddleware('api', 'oidc'))

// Initialize and start
await context.configure().init()
await apiServer.listen()

// OIDC endpoints now available at /oidc/*
```

### Custom Account Service Implementation

```typescript
import { createService } from '@owlmeans/context'
import type { OidcAccountService } from '@owlmeans/server-oidc-provider'

// Implement account service
const accountService: OidcAccountService = createService('oidc-account-service', {
  loadById: async (ctx, id) => {
    // Load user account from your database
    const user = await getUserById(id)
    
    if (!user) {
      return undefined
    }
    
    // Return oidc-provider Account object
    return {
      accountId: user.id,
      
      // Standard claims
      claims: async (use, scope, claims, rejected) => {
        const standardClaims = {
          sub: user.id,
          email: user.email,
          email_verified: user.emailVerified,
          name: user.fullName,
          given_name: user.firstName,
          family_name: user.lastName,
          picture: user.avatar
        }
        
        // Filter claims based on scope and requested claims
        const result = {}
        if (scope.includes('email')) {
          result.email = standardClaims.email
          result.email_verified = standardClaims.email_verified
        }
        if (scope.includes('profile')) {
          result.name = standardClaims.name
          result.given_name = standardClaims.given_name
          result.family_name = standardClaims.family_name
          result.picture = standardClaims.picture
        }
        
        return result
      }
    }
  }
})

// Register account service
context.registerService(accountService)
```

### Custom Storage Adapter

```typescript
import { createService } from '@owlmeans/context'
import type { OidcAdapterService } from '@owlmeans/server-oidc-provider'

// Implement Redis-based adapter service
const adapterService: OidcAdapterService = createService('oidc-adapter-service', {
  instance: (name) => {
    // Return adapter for specific model (Session, AccessToken, etc.)
    return {
      async upsert(id, payload, expiresIn) {
        const key = `oidc:${name}:${id}`
        await redis.setex(key, expiresIn, JSON.stringify(payload))
      },
      
      async find(id) {
        const key = `oidc:${name}:${id}`
        const data = await redis.get(key)
        return data ? JSON.parse(data) : undefined
      },
      
      async findByUserCode(userCode) {
        // Implement user code lookup for device flow
        const keys = await redis.keys(`oidc:${name}:*`)
        for (const key of keys) {
          const data = await redis.get(key)
          const payload = JSON.parse(data)
          if (payload.userCode === userCode) {
            return payload
          }
        }
        return undefined
      },
      
      async findByUid(uid) {
        // Implement UID-based lookup
        const keys = await redis.keys(`oidc:${name}:*`)
        for (const key of keys) {
          const data = await redis.get(key)
          const payload = JSON.parse(data)
          if (payload.uid === uid) {
            return payload
          }
        }
        return undefined
      },
      
      async destroy(id) {
        const key = `oidc:${name}:${id}`
        await redis.del(key)
      },
      
      async revokeByGrantId(grantId) {
        const keys = await redis.keys(`oidc:${name}:*`)
        for (const key of keys) {
          const data = await redis.get(key)
          const payload = JSON.parse(data)
          if (payload.grantId === grantId) {
            await redis.del(key)
          }
        }
      },
      
      async consume(id) {
        const key = `oidc:${name}:${id}`
        const data = await redis.get(key)
        if (data) {
          const payload = JSON.parse(data)
          payload.consumed = Math.floor(Date.now() / 1000)
          await redis.setex(key, payload.exp - Math.floor(Date.now() / 1000), JSON.stringify(payload))
        }
      }
    }
  }
})

// Register adapter service
context.registerService(adapterService)
```

### Advanced OIDC Configuration

```typescript
const advancedConfig = {
  oidc: {
    basePath: 'auth',
    behindProxy: true,
    accountService: 'custom-account-service',
    adapterService: 'redis-adapter-service',
    
    clients: [
      // Web application
      {
        client_id: 'web-app',
        client_secret: 'web-app-secret',
        redirect_uris: [
          'https://app.example.com/callback',
          'https://staging.app.example.com/callback'
        ],
        post_logout_redirect_uris: [
          'https://app.example.com/logout'
        ],
        response_types: ['code'],
        grant_types: ['authorization_code', 'refresh_token'],
        scope: 'openid profile email offline_access',
        token_endpoint_auth_method: 'client_secret_basic'
      },
      
      // Mobile application (public client)
      {
        client_id: 'mobile-app',
        redirect_uris: ['com.example.app://callback'],
        response_types: ['code'],
        grant_types: ['authorization_code', 'refresh_token'],
        scope: 'openid profile email offline_access',
        token_endpoint_auth_method: 'none', // Public client
        require_auth_time: true
      },
      
      // SPA (Single Page Application)
      {
        client_id: 'spa-app',
        redirect_uris: ['https://spa.example.com/callback'],
        response_types: ['code'],
        grant_types: ['authorization_code'],
        scope: 'openid profile email',
        token_endpoint_auth_method: 'none',
        require_auth_time: false
      }
    ],
    
    // Custom oidc-provider configuration
    customConfiguration: {
      features: {
        devInteractions: { enabled: false },
        deviceFlow: { enabled: true },
        revocation: { enabled: true },
        introspection: { enabled: true },
        userinfo: { enabled: true }
      },
      
      ttl: {
        AccessToken: 60 * 60,           // 1 hour
        AuthorizationCode: 10 * 60,     // 10 minutes
        IdToken: 60 * 60,               // 1 hour
        DeviceCode: 10 * 60,            // 10 minutes
        RefreshToken: 14 * 24 * 60 * 60 // 14 days
      },
      
      claims: {
        openid: ['sub'],
        email: ['email', 'email_verified'],
        profile: ['name', 'family_name', 'given_name', 'picture']
      },
      
      scopes: ['openid', 'email', 'profile', 'offline_access']
    }
  }
}
```

### Interaction Flow Integration

```typescript
import { modules } from '@owlmeans/oidc'
import { module, handleRequest } from '@owlmeans/module'
import { route, frontend } from '@owlmeans/route'

// Register OIDC interaction modules
context.registerModules(modules)

// Custom login interaction handler
const loginModule = module(
  route('oidc-login', '/oidc/interaction/:uid/login', frontend()),
  {
    handle: handleRequest(async (req, ctx) => {
      const { uid } = req.params
      const oidcService = ctx.service<OidcProviderService>('oidc-provider')
      
      // Get interaction details
      const interaction = await oidcService.getInteraction(uid)
      
      if (!interaction) {
        throw new Error('Interaction not found')
      }
      
      // Return login form data
      return {
        interaction: {
          uid: interaction.uid,
          params: interaction.params,
          prompt: interaction.prompt
        },
        client: interaction.params.client_id
      }
    })
  }
)

context.registerModule(loginModule)
```

### Multi-Tenant OIDC Setup

```typescript
// Multi-tenant configuration with entity-specific clients
const multiTenantConfig = {
  oidc: {
    clients: [
      // Tenant A
      {
        client_id: 'tenant-a-web',
        client_secret: 'tenant-a-secret',
        redirect_uris: ['https://tenant-a.example.com/callback'],
        response_types: ['code'],
        grant_types: ['authorization_code', 'refresh_token'],
        scope: 'openid profile email'
      },
      
      // Tenant B
      {
        client_id: 'tenant-b-web',
        client_secret: 'tenant-b-secret',
        redirect_uris: ['https://tenant-b.example.com/callback'],
        response_types: ['code'],
        grant_types: ['authorization_code', 'refresh_token'],
        scope: 'openid profile email'
      }
    ],
    
    // Tenant-aware account service
    accountService: 'multi-tenant-account-service'
  }
}

// Multi-tenant account service
const multiTenantAccountService = createService('multi-tenant-account-service', {
  loadById: async (ctx, id) => {
    // Extract tenant from ID or use other tenant identification
    const [tenantId, userId] = id.split(':')
    
    const user = await getUserByIdAndTenant(userId, tenantId)
    
    if (!user) {
      return undefined
    }
    
    return {
      accountId: id,
      claims: async (use, scope) => {
        return {
          sub: id,
          email: user.email,
          name: user.name,
          tenant: tenantId  // Custom claim
        }
      }
    }
  }
})
```

### Development and Testing Configuration

```typescript
// Development configuration with debugging
const devConfig = {
  debug: {
    oidc: true,
    oidcServer: true,
    oidcData: true
  },
  
  oidc: {
    customConfiguration: {
      features: {
        devInteractions: { enabled: true }, // Enable dev interactions
      },
      
      // More permissive settings for development
      conformIdTokenClaims: false,
      
      // Custom cookies for development
      cookies: {
        keys: ['dev-cookie-secret'],
        secure: false, // Allow non-HTTPS in development
        sameSite: 'lax'
      }
    }
  }
}
```

## Advanced Features

### Custom Claims and Scopes

```typescript
const customConfig = {
  oidc: {
    customConfiguration: {
      // Define custom scopes
      scopes: ['openid', 'email', 'profile', 'admin', 'api:read', 'api:write'],
      
      // Map scopes to claims
      claims: {
        openid: ['sub'],
        email: ['email', 'email_verified'],
        profile: ['name', 'family_name', 'given_name', 'picture', 'locale'],
        admin: ['role', 'permissions'],
        'api:read': ['api_access'],
        'api:write': ['api_access', 'write_permissions']
      },
      
      // Custom claim mapping
      extraParams: ['tenant_id', 'organization'],
      
      // Custom token format
      formats: {
        AccessToken: 'jwt',
        ClientCredentials: 'jwt'
      }
    }
  }
}
```

### Dynamic Client Registration

```typescript
const dynamicClientConfig = {
  oidc: {
    customConfiguration: {
      features: {
        registration: { enabled: true },
        registrationManagement: { enabled: true }
      },
      
      // Client validation
      clientDefaults: {
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_basic'
      }
    }
  }
}

// Handle dynamic client registration
const clientRegistrationModule = module(
  route('client-registration', '/oidc/reg', backend('POST')),
  {
    handle: handleRequest(async (req, ctx) => {
      const oidcService = ctx.service<OidcProviderService>('oidc-provider')
      const provider = oidcService.instance()
      
      // Custom client validation logic
      const clientMetadata = req.body
      
      // Register client with oidc-provider
      const client = await provider.Client.create(clientMetadata)
      
      return {
        client_id: client.clientId,
        client_secret: client.clientSecret,
        registration_access_token: client.registrationAccessToken
      }
    })
  }
)
```

### Integration with External Identity Providers

```typescript
// Federation with external IdPs
const federatedConfig = {
  oidc: {
    customConfiguration: {
      // Custom interaction handling for federation
      interactions: {
        url: async (ctx, interaction) => {
          // Custom logic to determine if user should be redirected to external IdP
          if (interaction.params.federated_idp) {
            return `/oidc/federate/${interaction.params.federated_idp}/${interaction.uid}`
          }
          
          return `/oidc/interaction/${interaction.uid}`
        }
      }
    }
  }
}
```

## Security Considerations

### Key Management
- Use strong RSA keys (2048-bit minimum) for JWT signing
- Rotate signing keys periodically
- Store private keys securely using environment variables or secret management
- Use different keys for different environments

### HTTPS and Proxy Configuration
- Always use HTTPS in production
- Configure `behindProxy` correctly when behind reverse proxies
- Use secure cookie settings in production
- Implement proper CORS policies

### Client Security
- Use strong client secrets for confidential clients
- Validate redirect URIs strictly
- Implement proper logout handling
- Use appropriate token lifetimes

### Session Management
- Use secure session storage
- Implement proper session cleanup
- Monitor for session hijacking attempts
- Use appropriate session timeouts

## Best Practices

1. **Configuration**: Use environment-specific configurations
2. **Account Service**: Implement robust user authentication
3. **Adapter Service**: Use persistent storage for production
4. **Client Management**: Validate client configurations thoroughly
5. **Security**: Follow OIDC security best practices
6. **Monitoring**: Implement logging and monitoring
7. **Testing**: Test all authentication flows thoroughly

## Error Handling

```typescript
try {
  const oidcService = createOidcProviderService()
  await oidcService.update(apiServer)
} catch (error) {
  console.error('OIDC Provider setup failed:', error)
  
  // Handle specific configuration errors
  if (error.message.includes('missing key')) {
    console.error('JWT signing key not configured')
  }
  
  if (error.message.includes('client')) {
    console.error('Client configuration invalid')
  }
}
```

## Integration with OwlMeans Ecosystem

### Server API Integration
```typescript
import { createApiServer } from '@owlmeans/server-api'

// OIDC provider integrates seamlessly with server API
const apiServer = createApiServer('api')
const oidcProvider = createOidcProviderService('oidc')

context.registerService(apiServer)
context.registerService(oidcProvider)
```

### Authentication Integration
```typescript
import { makeAuthService } from '@owlmeans/server-auth'

// Use OIDC tokens for API authentication
const authService = makeAuthService('auth')
// Configure auth service to validate OIDC tokens
```

### Context Integration
```typescript
import { makeServerContext } from '@owlmeans/server-context'

// Full integration with server context management
const context = makeServerContext(configWithOidc)
```

## Performance Considerations

- **Adapter Choice**: Use Redis or other fast storage for sessions
- **Token Formats**: Consider JWT vs opaque tokens based on use case
- **Caching**: Implement appropriate caching for user accounts
- **Database Optimization**: Optimize account and client lookups
- **Connection Pooling**: Use connection pooling for database operations

## Related Packages

- [`@owlmeans/oidc`](../oidc) - Core OIDC types and utilities
- [`@owlmeans/server-api`](../server-api) - Server API framework
- [`@owlmeans/server-context`](../server-context) - Server context management
- [`@owlmeans/server-oidc-rp`](../server-oidc-rp) - Server-side relying party
- [`@owlmeans/web-oidc-provider`](../web-oidc-provider) - Web UI for OIDC provider