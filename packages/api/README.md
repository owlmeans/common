# @owlmeans/api

A comprehensive HTTP API client library for OwlMeans Common applications. This package provides a sophisticated API service that integrates with the OwlMeans module system, handles authentication automatically, and provides robust error handling for fullstack applications.

## Overview

The `@owlmeans/api` package is a core networking library in the OwlMeans Common ecosystem that enables seamless communication between client and server components. It provides:

- **Module Integration**: Deep integration with OwlMeans Common Module system for type-safe API calls
- **Automatic Authentication**: Built-in authentication token management and refresh
- **Error Handling**: Comprehensive error handling with resilient error types
- **URL Management**: Automatic URL construction from route definitions
- **Request/Response Processing**: Advanced request transformation and response processing
- **Security Features**: Integrated security helpers and header management

## Installation

```bash
npm install @owlmeans/api
```

## Core Concepts

### API Client Service

The API client is implemented as an OwlMeans service that can be registered with the context system. It provides a `handler` function that processes module requests and returns appropriate responses.

### Module-Based Requests

Instead of making direct HTTP calls, the API client works with OwlMeans Common Modules, which define:
- Route structure and methods
- Request/response types
- Parameter validation
- URL patterns

### Automatic Authentication

The client automatically handles authentication tokens:
- Retrieves tokens from the authentication service
- Includes tokens in request headers
- Processes token updates from server responses
- Integrates with the OwlMeans authentication subsystem

## API Reference

### Types

#### `ApiClient`
The main API client service interface.

```typescript
interface ApiClient extends InitializedService {
  handler: ModuleHandler
}
```

### Factory Functions

#### `createApiService(alias?: string): ApiClient`
Creates a new API client service.

**Parameters:**
- `alias` (optional): Service alias for registration (defaults to `'web-client'`)

**Returns:** Configured ApiClient instance

**Example:**
```typescript
import { createApiService } from '@owlmeans/api'

const apiClient = createApiService('my-api-client')
```

#### `appendApiClient<C, T>(ctx: T, alias?: string): T`
Appends an API client service to an existing context.

**Parameters:**
- `ctx`: OwlMeans context instance
- `alias` (optional): Service alias (defaults to `'web-client'`)

**Returns:** The context with the API client registered

**Example:**
```typescript
import { appendApiClient } from '@owlmeans/api'
import { createBasicContext } from '@owlmeans/context'

const context = createBasicContext()
appendApiClient(context, 'api-service')
```

### Constants

#### HTTP Status Codes
```typescript
const OK = 200
const CREATED = 201
const ACCEPTED = 202
const FINISHED = 204
const UNAUTHORIZED_ERROR = 401
const FORBIDDEN_ERROR = 403
const SERVER_ERROR = 500
```

#### Default Configuration
```typescript
const DEFAULT_ALIAS = 'web-client'
const protocols = ['http', 'https', 'wss', 'ws']
```

### Error Types

The package provides a comprehensive error hierarchy for API-related failures:

#### `ApiError`
Base error class for all API-related errors.

#### `ApiClientError`
General client-side API errors.

#### `ServerCrashedError`
Error indicating server-side crashes (500 errors).

#### `ServerAuthError`
Error for authentication failures (401 errors).

## Usage Examples

### Basic Setup

```typescript
import { createBasicContext } from '@owlmeans/context'
import { appendApiClient } from '@owlmeans/api'

// Create context and add API client
const context = createBasicContext({
  webService: 'api-client'
})
appendApiClient(context, 'api-client')

// Initialize the context
await context.init()
```

### Making API Calls through Modules

```typescript
import { createApiService } from '@owlmeans/api'

// Get the API client from context
const apiClient = context.service('api-client')

// Use with a module - the handler processes the request
const request = {
  alias: 'user-profile',
  params: { userId: '123' },
  query: { include: 'permissions' },
  headers: { 'Accept': 'application/json' }
}

const [result, outcome] = await apiClient.handler(request, responseHandler)
```

### Error Handling

```typescript
import { ApiError, ServerCrashedError, ServerAuthError } from '@owlmeans/api'

try {
  const [result, outcome] = await apiClient.handler(request, response)
  console.log('API call successful:', result)
} catch (error) {
  if (error instanceof ServerCrashedError) {
    console.error('Server crashed:', error.message)
  } else if (error instanceof ServerAuthError) {
    console.error('Authentication failed:', error.message)
    // Redirect to login
  } else if (error instanceof ApiError) {
    console.error('API error:', error.message)
  }
}
```

### Custom Configuration

```typescript
import { createApiService } from '@owlmeans/api'
import { createBasicContext } from '@owlmeans/context'

const context = createBasicContext({
  webService: 'custom-api',
  // Configure base URLs, security settings, etc.
})

const apiClient = createApiService('custom-api')
context.registerService(apiClient)
```

## Advanced Features

### Automatic Token Refresh

The API client automatically handles authentication token updates:

```typescript
// When server responds with TOKEN_UPDATE header,
// the client automatically updates the auth service
const response = await apiClient.handler(request, reply)
// Token is updated in background if provided by server
```

### Request Transformation

The client handles various content types and request transformations:

```typescript
// Automatic form encoding for application/x-www-form-urlencoded
const request = {
  alias: 'form-submit',
  body: { name: 'John', email: 'john@example.com' },
  headers: { 'content-type': 'application/x-www-form-urlencoded' }
}

// Automatic JSON handling
const jsonRequest = {
  alias: 'api-call',
  body: JSON.stringify({ data: 'value' }),
  headers: { 'content-type': 'application/json' }
}
```

### URL Construction

URLs are automatically constructed from module route definitions:

```typescript
// Module defines: /users/:userId/profile
// Request provides: { userId: '123' }
// Result: /users/123/profile

const request = {
  alias: 'user-profile',
  params: { userId: '123' },
  host: 'api.example.com',
  base: '/v1'
}
// Final URL: https://api.example.com/v1/users/123/profile
```

### Response Processing

The client processes various response scenarios:

```typescript
// Success responses (200, 201, 202, 204)
// Error responses (401, 403, 500, etc.)
// Custom error marshaling from server
// Header-based responses for empty bodies
```

## Integration with OwlMeans Ecosystem

The `@owlmeans/api` package integrates with:

- **@owlmeans/context**: Service registration and dependency injection
- **@owlmeans/module**: Module-based request/response handling
- **@owlmeans/client-route**: URL parameter extraction and route processing
- **@owlmeans/auth-common**: Automatic authentication integration
- **@owlmeans/config**: Security helpers and URL construction
- **@owlmeans/error**: Resilient error handling and marshaling
- **@owlmeans/client-config**: Configuration management

## Security Considerations

- All API calls should use HTTPS in production
- Authentication tokens are automatically managed
- Request/response data should be validated
- Error responses may contain sensitive information and should be handled appropriately
- CORS and CSP headers should be configured properly on the server side

## Performance Features

- Automatic request cancellation support
- Efficient parameter extraction and URL construction
- Minimal overhead for authenticated requests
- Built-in retry logic through the OwlMeans module system

Fixes #32.