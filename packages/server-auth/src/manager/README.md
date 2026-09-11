# OwlMeans Auth Manager App

The **OwlMeans Auth Manager App** is a complete server application for managing authentication and authorization services within the OwlMeans Common Libraries ecosystem. This manager application serves as the core authentication service providing secure authentication, token management, and relay functionality for distributed microservices architectures.

## Purpose

This manager application provides a complete authentication service implementation designed for:

- **Authentication Management**: Secure user authentication with multiple credential types
- **Token Management**: JWT token generation, validation, and refresh mechanisms  
- **Relay Service**: Cross-service authentication relay for distributed architectures
- **API Security**: Comprehensive API endpoint protection with guards and gates
- **Socket Communication**: Real-time authentication over WebSocket connections
- **Microservice Integration**: Seamless integration with other OwlMeans services

## Key Concepts

### Authentication Model
The manager implements a comprehensive authentication model that handles:
- **Initialization**: Setup and configuration of authentication providers
- **Authentication**: User credential validation and token generation
- **Relay**: Cross-service token validation and relay functionality

### Rely Service
A specialized guard service that enables authentication token relay between microservices, allowing for:
- **One-Time Tokens**: Secure single-use authentication tokens
- **Wallet DID Authentication**: Decentralized identity authentication support
- **Challenge Validation**: Anti-replay protection using challenge-response mechanisms

### Module-Based Architecture
The manager is built on the OwlMeans module system, providing:
- **Route Management**: Standardized API endpoints for authentication operations
- **Handler Registration**: Modular request handlers for different authentication flows
- **Guard Integration**: Automatic security enforcement at the module level

## Installation

This manager app is part of the `@owlmeans/server-auth` package:

```bash
npm install @owlmeans/server-auth
```

## API Reference

### Types

#### `AppConfig`
Configuration interface for the Auth Manager App.

```typescript
interface AppConfig extends ServerConfig, KlusterConfig {
  services: Record<string, ServiceRoute>
}
```

Extends base server configuration with Kluster support and service routing definitions.

#### `AppContext<C extends AppConfig>`
Main application context interface extending server context with additional capabilities.

```typescript
interface AppContext<C extends AppConfig = AppConfig> extends ServerContext<C>,
  ApiServerAppend,
  StaticResourceAppend { }
```

Provides comprehensive context management with:
- **ServerContext**: Base server functionality
- **ApiServerAppend**: HTTP API server capabilities
- **StaticResourceAppend**: Static resource serving

#### `AuthModel`
Core authentication model interface defining authentication operations.

```typescript
interface AuthModel {
  init: (request: AllowanceRequest) => Promise<AllowanceResponse>
  authenticate: (credential: AuthCredentials) => Promise<AuthToken>
  rely: (conn: Connection, source?: Auth | null) => Promise<void>
}
```

**Methods:**
- **`init`**: Initialize authentication session and return allowance parameters
- **`authenticate`**: Validate credentials and return authentication token
- **`rely`**: Establish authentication relay over WebSocket connection

#### `RelyService`
Guard service interface for handling authentication relay.

```typescript
interface RelyService extends GuardService {
}
```

Extends the base GuardService to provide authentication relay capabilities.

#### `RelyAllowanceRequest`
Extended allowance request interface for relay operations.

```typescript
interface RelyAllowanceRequest extends AllowanceRequest {
  auth?: Auth
  provideRely?: RelyLinker
  conn?: Connection
}
```

**Properties:**
- **`auth`**: Optional authentication context
- **`provideRely`**: Function to link rely tokens
- **`conn`**: WebSocket connection for real-time relay

#### `RelyLinker`
Function interface for linking rely tokens between services.

```typescript
interface RelyLinker {
  (rely: RelyToken, source: RelyToken, notify?: boolean): Promise<void>
}
```

#### `RelyCarrier`
Container for relay token relationships.

```typescript
interface RelyCarrier {
  source: RelyToken
  rely: RelyToken
}
```

### Factory Functions

#### `makeContext<C extends AppConfig, T extends AppContext<C>>(cfg: C, customize?: boolean): T`

Creates a fully configured application context for the Auth Manager App.

```typescript
import { makeContext } from '@owlmeans/server-auth/manager'

const config = {
  service: 'auth-manager',
  port: 3000,
  services: {
    redis: { host: 'localhost', port: 6379 }
  }
}

const context = makeContext(config)
```

**Parameters:**
- `cfg`: Application configuration
- `customize`: Optional flag to skip default service registration

**Returns:** Configured application context with all necessary services

#### `createRelyService(alias?: string): RelyService`

Creates a rely service for authentication token relay.

```typescript
import { createRelyService } from '@owlmeans/server-auth/manager'

const relyService = createRelyService('custom-rely')
context.registerService(relyService)
```

**Parameters:**
- `alias`: Optional service alias (defaults to 'auth-rely')

**Returns:** Configured rely service

### Core Functions

#### `main<C extends AppConfig, T extends AppContext<C>>(ctx: T): Promise<void>`

Main application entry point that configures and starts the Auth Manager App.

```typescript
import { main, makeContext } from '@owlmeans/server-auth/manager'

const context = makeContext(config)
await main(context)
```

**Functionality:**
- Registers all authentication modules
- Configures and initializes the context
- Starts the API server and begins listening for requests

### Authentication Handlers

#### `authenticationInit`
Handler for authentication initialization requests.

```typescript
const authenticationInit: RefedModuleHandler<AllowanceRequest>
```

Processes initialization requests to set up authentication parameters and return allowance information.

#### `authenticate`
Handler for credential authentication requests.

```typescript
const authenticate: RefedModuleHandler<AuthCredentials>
```

Validates user credentials and returns authentication tokens.

#### `rely`
Handler for authentication relay over WebSocket connections.

```typescript
const rely: RefedModuleHandler<void>
```

Establishes authentication relay for real-time communication channels.

### Constants

#### `DEFAULT_RELY`
Default alias for the rely service.

```typescript
const DEFAULT_RELY = 'auth-rely'
```

#### `RELY_TUNNEL`
Identifier for rely tunnel connections.

```typescript
const RELY_TUNNEL = 'rely-tunnel'
```

## Usage Examples

### Basic Server Setup

```typescript
import { main, makeContext } from '@owlmeans/server-auth/manager'

// Create application configuration
const config = {
  service: 'auth-manager',
  port: 3000,
  layer: Layer.Service,
  type: AppType.Backend,
  services: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379')
    },
    postgres: {
      host: process.env.DB_HOST || 'localhost', 
      port: parseInt(process.env.DB_PORT || '5432')
    }
  }
}

// Create and start the application
const context = makeContext(config)
await main(context)

console.log('Auth Manager App is running on port 3000')
```

### Custom Context Configuration

```typescript
import { makeContext, createRelyService } from '@owlmeans/server-auth/manager'

// Create custom context without default services
const context = makeContext(config, true)

// Add custom rely service
const customRelyService = createRelyService('custom-auth-relay')
context.registerService(customRelyService)

// Add custom resources or services
context.registerResource(customCacheResource)

// Configure and initialize
await context.configure().init()
```

### Authentication Model Usage

```typescript
import { makeAuthModel } from '@owlmeans/server-auth'

const context = makeContext(config)
const authModel = makeAuthModel(context)

// Initialize authentication
const allowanceRequest = {
  type: AuthenticationType.PasswordLogin,
  challenge: 'unique-challenge-string'
}
const allowance = await authModel.init(allowanceRequest)

// Authenticate user
const credentials = {
  username: 'user@example.com',
  password: 'secure-password',
  challenge: allowance.challenge
}
const authToken = await authModel.authenticate(credentials)

// Handle WebSocket relay
const connection = getWebSocketConnection()
await authModel.rely(connection, authToken.auth)
```

### API Integration

```typescript
import { modules } from '@owlmeans/server-auth/manager'

// The manager automatically registers these API endpoints:

// POST /api/auth/init - Authentication initialization
// POST /api/auth/authenticate - User authentication  
// WebSocket /api/auth/rely - Authentication relay

// Access modules for custom routing
modules.forEach(module => {
  console.log(`Route: ${module.getPath()}`)
  console.log(`Method: ${module.route.method}`)
})
```

## API Endpoints

The Auth Manager App automatically exposes these authentication endpoints:

### POST `/api/auth/init`
Initialize authentication session.

**Request Body:**
```typescript
{
  type: AuthenticationType,
  challenge?: string
}
```

**Response:**
```typescript
{
  challenge: string,
  allowance: AllowanceParameters
}
```

### POST `/api/auth/authenticate`
Authenticate user credentials.

**Request Body:**
```typescript
{
  username: string,
  password: string,
  challenge: string
}
```

**Response:**
```typescript
{
  token: string,
  auth: Auth,
  refresh?: string
}
```

### WebSocket `/api/auth/rely`
Establish authentication relay connection.

**Query Parameters:**
- `auth`: Authentication token for relay validation

## Security Features

### Guard System
The manager implements comprehensive request guards:
- **Authentication Guards**: Validate user authentication status
- **Rely Guards**: Secure cross-service authentication relay
- **Challenge Validation**: Anti-replay protection mechanisms

### Token Management
- **JWT Tokens**: Secure JSON Web Token generation and validation
- **One-Time Tokens**: Single-use authentication tokens for enhanced security
- **Token Relay**: Secure token passing between microservices

### Wallet DID Support
- **Decentralized Identity**: Support for blockchain-based authentication
- **Cryptographic Validation**: Secure signature verification
- **Challenge-Response**: Anti-replay protection for DID authentication

## Error Handling

The manager handles various authentication errors:

### `AuthenFailed`
Thrown when authentication validation fails.

```typescript
try {
  await authModel.authenticate(credentials)
} catch (error) {
  if (error instanceof AuthenFailed) {
    console.error('Authentication failed:', error.message)
  }
}
```

### Common Error Scenarios
- **Invalid Credentials**: User provides incorrect username/password
- **Expired Challenge**: Authentication challenge has expired  
- **Invalid Token**: Malformed or expired authentication token
- **Rely Failure**: Cross-service authentication relay failed

## Integration Patterns

### Microservice Architecture

```typescript
// Auth Manager as central authentication service
const authManager = makeContext({
  service: 'auth-manager',
  port: 3001
})

// Other services rely on auth manager
const userService = makeContext({
  service: 'user-service', 
  port: 3002,
  services: {
    'auth-manager': {
      host: 'auth-manager',
      port: 3001
    }
  }
})
```

### Load Balancing and High Availability

```typescript
const config = {
  service: 'auth-manager',
  port: process.env.PORT || 3000,
  services: {
    redis: {
      host: process.env.REDIS_CLUSTER || 'redis-cluster',
      port: 6379
    },
    postgres: {
      host: process.env.DB_CLUSTER || 'postgres-cluster',
      port: 5432
    }
  }
}
```

### Container Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "dist/manager/main.js"]
```

## Best Practices

1. **Secure Configuration**: Store sensitive configuration in environment variables or secrets
2. **Service Discovery**: Use proper service discovery mechanisms in microservice deployments
3. **Token Rotation**: Implement regular token refresh and rotation
4. **Monitoring**: Add comprehensive logging and monitoring for authentication events
5. **Rate Limiting**: Implement rate limiting to prevent brute force attacks
6. **HTTPS Only**: Always use HTTPS in production environments

## Dependencies

This manager app depends on:
- `@owlmeans/auth` - Core authentication functionality
- `@owlmeans/auth-common` - Shared authentication components
- `@owlmeans/server-context` - Server context management
- `@owlmeans/server-api` - HTTP API server functionality
- `@owlmeans/server-socket` - WebSocket server support
- `@owlmeans/static-resource` - Static resource management
- `@owlmeans/api-config-server` - API configuration server

## Related Packages

- [`@owlmeans/server-auth`](../../../README.md) - Parent server authentication package
- [`@owlmeans/auth`](../../../auth/README.md) - Core authentication library
- [`@owlmeans/client-auth`](../../../client-auth/README.md) - Client-side authentication
- [`@owlmeans/context`](../../../context/README.md) - Context management system