# @owlmeans/api-config

Shared API configuration library for exposing safe configuration data to clients. This package provides a standardized way to advertise configuration information through REST APIs while filtering out sensitive server-side configuration details.

## Overview

The `@owlmeans/api-config` package enables safe sharing of configuration data between server and client applications. It provides:

- **Configuration Filtering**: Automatically filters out sensitive server-side configuration
- **API Endpoint**: Standard `/assets/config.json` endpoint for configuration delivery
- **Type Safety**: TypeScript interfaces for API-safe configuration
- **Selective Exposure**: Granular control over what configuration is exposed
- **Module Integration**: Ready-to-use modules for configuration endpoints
- **Cross-Environment Support**: Works with both server-side and client-side implementations

This package is part of the OwlMeans configuration ecosystem:
- **@owlmeans/config**: Core configuration management
- **@owlmeans/api-config**: Shared API configuration *(this package)*
- **@owlmeans/api-config-server**: Server-side API configuration
- **@owlmeans/api-config-client**: Client-side API configuration consumption

## Installation

```bash
npm install @owlmeans/api-config
```

## Dependencies

This package extends:
- `@owlmeans/config`: Core configuration system
- `@owlmeans/module`: Module system for API endpoints
- `@owlmeans/route`: Routing infrastructure

## Core Concepts

### API-Safe Configuration

API configuration removes sensitive server-side details like database connections, trusted entities, and internal service configurations while preserving client-relevant settings.

### Configuration Filtering

The package automatically filters out sensitive configuration keys and only exposes safe configuration data through the API.

### Standardized Endpoint

The `/assets/config.json` endpoint provides a standard location for clients to retrieve configuration data.

## API Reference

### Types

#### `ApiConfig`

Interface for API-safe configuration that extends CommonConfig while omitting sensitive fields.

```typescript
interface ApiConfig extends Omit<
  CommonConfig,
  'dbs' | 'trusted' | 'ready' | 'service' | 'layer' | 'type' | 'layerId'
> {}
```

**Excluded Fields:**
- `dbs`: Database configurations (sensitive)
- `trusted`: Trusted entity configurations (sensitive)  
- `ready`: Internal readiness state (internal)
- `service`: Service name (internal)
- `layer`: Service layer (internal)
- `type`: Application type (internal)
- `layerId`: Layer identifier (internal)

**Included Fields:**
- `debug`: Debug configuration settings
- `security`: Public security settings
- `brand`: Branding configuration
- `defaultEntityId`: Default entity identifier
- `plugins`: Public plugin configurations
- Configuration records marked as safe

### Constants

#### Configuration Filtering

```typescript
const API_CONFIG = 'api-config:advertise'  // Module alias for config endpoint

const notAdvertizedConfigKeys = [
  'dbs',                // Database configurations
  'trusted',            // Trusted entities
  'ready',              // Readiness state
  'service',            // Service name
  'layer',              // Service layer
  'type',               // Application type
  'layerId',            // Layer ID
  'records',            // Internal records
  'webService',         // Web service configs
  'oidc',               // OIDC configurations
  'storageBuckets'      // Storage bucket configs
]

const allowedConfigRecords = [
  'plan',               // Subscription/plan information
  'product',            // Product configuration
  'l10n'                // Localization settings
]
```

### Modules

#### Configuration Endpoint Module

The package provides a ready-to-use module for serving configuration through the standard endpoint.

```typescript
import { modules } from '@owlmeans/api-config'

// The modules array contains:
// - API config endpoint at /assets/config.json (sticky: true)

export const modules = [
  module(route(API_CONFIG, '/assets/config.json'), { sticky: true })
]
```

**Module Properties:**
- **Route**: `/assets/config.json` - Standard configuration endpoint
- **Sticky**: `true` - Applied to all requests regardless of other routing
- **Method**: `GET` (default) - Standard HTTP GET endpoint

## Usage Examples

### Basic Module Registration

```typescript
import { modules } from '@owlmeans/api-config'
import { makeServerContext } from '@owlmeans/server-context'

// Create server context
const context = makeServerContext(config)

// Register API config modules
context.registerModules(modules)

// Initialize context
await context.configure().init()

// The /assets/config.json endpoint is now available
```

### Custom Configuration Filtering

```typescript
import { ApiConfig, notAdvertizedConfigKeys, allowedConfigRecords } from '@owlmeans/api-config'
import { CommonConfig } from '@owlmeans/config'

// Function to create API-safe configuration
function createApiConfig(fullConfig: CommonConfig): ApiConfig {
  const apiConfig: Partial<ApiConfig> = {}
  
  // Copy all non-sensitive configuration
  Object.entries(fullConfig).forEach(([key, value]) => {
    if (!notAdvertizedConfigKeys.includes(key)) {
      (apiConfig as any)[key] = value
    }
  })
  
  // Filter configuration records to only allowed types
  if (fullConfig.records) {
    const safeRecords = Object.entries(fullConfig.records)
      .filter(([recordType]) => allowedConfigRecords.includes(recordType))
      .reduce((acc, [recordType, records]) => ({
        ...acc,
        [recordType]: records
      }), {})
    
    if (Object.keys(safeRecords).length > 0) {
      apiConfig.records = safeRecords
    }
  }
  
  return apiConfig as ApiConfig
}

// Usage
const fullConfig = makeConfig(AppType.Backend, 'my-service', {
  // Full server configuration with sensitive data
  dbs: [{ /* database config */ }],
  trusted: [{ /* trusted entities */ }],
  brand: { home: '/dashboard' },
  debug: { enabled: true }
})

const apiConfig = createApiConfig(fullConfig)
// apiConfig only contains safe configuration for API exposure
```

### Server-Side Implementation

```typescript
import { modules, ApiConfig } from '@owlmeans/api-config'
import { handleRequest } from '@owlmeans/server-api'

// Create custom handler for configuration endpoint
const configHandler = handleRequest(async (req, ctx) => {
  const fullConfig = ctx.cfg
  
  // Create API-safe configuration
  const apiConfig: ApiConfig = {
    debug: fullConfig.debug,
    security: fullConfig.security ? {
      // Only expose public security settings
      auth: fullConfig.security.auth
    } : undefined,
    brand: fullConfig.brand,
    defaultEntityId: fullConfig.defaultEntityId,
    plugins: fullConfig.plugins?.filter(plugin => !plugin.internal)
  }
  
  // Add allowed configuration records
  if (fullConfig.records) {
    const allowedRecords = ['plan', 'product', 'l10n']
    apiConfig.records = Object.entries(fullConfig.records)
      .filter(([type]) => allowedRecords.includes(type))
      .reduce((acc, [type, records]) => ({ ...acc, [type]: records }), {})
  }
  
  return apiConfig
})

// Register module with custom handler
const configModule = module(
  route('api-config', '/assets/config.json'),
  { handle: configHandler, sticky: true }
)

context.registerModule(configModule)
```

### Client-Side Usage Pattern

```typescript
// Example of how clients would consume the API config
// (Implementation would be in @owlmeans/api-config-client)

interface ClientConfigConsumer {
  loadConfig(): Promise<ApiConfig>
  getDebugSettings(): boolean
  getBrandSettings(): BrandSettings
  getSecuritySettings(): SecurityConfig
}

class ConfigService implements ClientConfigConsumer {
  private config?: ApiConfig

  async loadConfig(): Promise<ApiConfig> {
    const response = await fetch('/assets/config.json')
    this.config = await response.json()
    return this.config
  }

  getDebugSettings(): boolean {
    return this.config?.debug?.enabled ?? false
  }

  getBrandSettings(): BrandSettings {
    return this.config?.brand ?? {}
  }

  getSecuritySettings(): SecurityConfig {
    return this.config?.security ?? {}
  }
}
```

### Multi-Environment Configuration

```typescript
import { ApiConfig } from '@owlmeans/api-config'

// Different API configurations for different environments
const createEnvironmentApiConfig = (
  env: 'development' | 'staging' | 'production',
  baseConfig: CommonConfig
): ApiConfig => {
  const apiConfig: ApiConfig = {
    debug: env === 'development' ? { enabled: true, all: true } : { enabled: false },
    security: {
      auth: baseConfig.security?.auth
    },
    brand: baseConfig.brand
  }

  // Add environment-specific settings
  if (env === 'development') {
    apiConfig.debug = { ...apiConfig.debug, i18n: true }
  }

  return apiConfig
}

// Usage in different environments
const devApiConfig = createEnvironmentApiConfig('development', serverConfig)
const prodApiConfig = createEnvironmentApiConfig('production', serverConfig)
```

### Configuration Record Filtering

```typescript
import { allowedConfigRecords } from '@owlmeans/api-config'

// Example configuration with various record types
const serverConfig = {
  records: {
    // Allowed records (will be exposed)
    plan: [
      { id: 'basic', name: 'Basic Plan', features: ['feature1'] },
      { id: 'premium', name: 'Premium Plan', features: ['feature1', 'feature2'] }
    ],
    product: [
      { id: 'main', name: 'Main Product', version: '1.0.0' }
    ],
    l10n: [
      { locale: 'en', name: 'English' },
      { locale: 'es', name: 'Spanish' }
    ],
    
    // Not allowed records (will be filtered out)
    internal: [
      { secret: 'sensitive-data' }
    ],
    database: [
      { connection: 'mongodb://secret' }
    ]
  }
}

// Function to filter records
const filterConfigRecords = (records: any) => {
  return Object.entries(records)
    .filter(([recordType]) => allowedConfigRecords.includes(recordType))
    .reduce((acc, [type, data]) => ({ ...acc, [type]: data }), {})
}

const safeRecords = filterConfigRecords(serverConfig.records)
// Only contains: plan, product, l10n records
```

### Plugin Configuration Exposure

```typescript
import { ApiConfig } from '@owlmeans/api-config'

// Example of exposing safe plugin configurations
const createApiConfigWithPlugins = (serverConfig: CommonConfig): ApiConfig => {
  return {
    debug: serverConfig.debug,
    brand: serverConfig.brand,
    
    // Filter plugins to only expose public ones
    plugins: serverConfig.plugins?.filter(plugin => {
      // Only expose plugins explicitly marked as public
      return plugin.public === true && !plugin.internal
    }).map(plugin => ({
      // Remove sensitive plugin data
      id: plugin.id,
      type: plugin.type,
      value: plugin.publicValue || plugin.value,
      config: plugin.publicConfig
    }))
  }
}
```

### Security Considerations

```typescript
import { ApiConfig, notAdvertizedConfigKeys } from '@owlmeans/api-config'

// Ensure sensitive data is never exposed
const secureApiConfigFilter = (config: any): ApiConfig => {
  // Double-check sensitive keys are removed
  const filtered = { ...config }
  
  notAdvertizedConfigKeys.forEach(key => {
    delete filtered[key]
  })
  
  // Additional security checks
  if (filtered.security) {
    // Remove sensitive security settings
    delete filtered.security.keys
    delete filtered.security.secrets
    delete filtered.security.internalAuth
  }
  
  // Remove any remaining sensitive patterns
  const sanitized = JSON.parse(JSON.stringify(filtered, (key, value) => {
    // Filter out any keys containing sensitive terms
    if (key.toLowerCase().includes('secret') || 
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('key')) {
      return undefined
    }
    return value
  }))
  
  return sanitized
}
```

## Integration Patterns

### With Server API

```typescript
import { modules } from '@owlmeans/api-config'
import { createApiServer } from '@owlmeans/server-api'

const apiServer = createApiServer('main')
const context = makeServerContext(config)

// Register API server and config modules
context.registerService(apiServer)
context.registerModules(modules)

await context.configure().init()
await apiServer.listen()

// Config available at: GET /assets/config.json
```

### With Authentication

```typescript
import { module, guard } from '@owlmeans/module'
import { route } from '@owlmeans/route'

// Protected configuration endpoint
const protectedConfigModule = module(
  route('protected-config', '/admin/config.json'),
  {
    ...guard('admin'),
    handle: handleRequest(async (req, ctx) => {
      // Return full configuration for admin users
      return createFullApiConfig(ctx.cfg)
    })
  }
)

// Public configuration endpoint (using standard module)
const publicConfigModule = modules[0] // Standard config module
```

### With Caching

```typescript
import { module } from '@owlmeans/module'
import { handleRequest } from '@owlmeans/server-api'

// Cached configuration endpoint
const cachedConfigModule = module(
  route('cached-config', '/assets/config.json'),
  {
    sticky: true,
    handle: handleRequest(async (req, ctx) => {
      // Check cache first
      const cacheKey = 'api-config'
      const cached = await ctx.service('cache').get(cacheKey)
      
      if (cached) {
        return cached
      }
      
      // Generate fresh config
      const apiConfig = createApiConfig(ctx.cfg)
      
      // Cache for 5 minutes
      await ctx.service('cache').set(cacheKey, apiConfig, 300)
      
      return apiConfig
    })
  }
)
```

## Best Practices

1. **Security First**: Always verify sensitive data is filtered out
2. **Environment Awareness**: Adapt configuration exposure based on environment
3. **Minimal Exposure**: Only expose configuration data that clients actually need
4. **Validation**: Validate API configuration before exposure
5. **Caching**: Consider caching configuration for performance
6. **Versioning**: Consider versioning configuration APIs for compatibility
7. **Documentation**: Document what configuration is available to clients

## Error Handling

```typescript
import { handleRequest } from '@owlmeans/server-api'

const configHandler = handleRequest(async (req, ctx) => {
  try {
    const apiConfig = createApiConfig(ctx.cfg)
    
    // Validate the configuration before sending
    if (!apiConfig || typeof apiConfig !== 'object') {
      throw new Error('Invalid configuration generated')
    }
    
    return apiConfig
  } catch (error) {
    // Log error but don't expose details
    console.error('Config generation error:', error)
    
    // Return minimal safe config
    return {
      debug: { enabled: false },
      brand: {},
      error: 'Configuration temporarily unavailable'
    }
  }
})
```

## Performance Considerations

- **Caching**: Configuration changes infrequently, consider caching
- **Size**: Keep API configuration minimal to reduce transfer size
- **Compression**: Use gzip compression for the JSON endpoint
- **CDN**: Consider CDN caching for static configuration

## Related Packages

- [`@owlmeans/config`](../config) - Core configuration management
- [`@owlmeans/api-config-server`](../api-config-server) - Server-side implementation
- [`@owlmeans/api-config-client`](../api-config-client) - Client-side consumption
- [`@owlmeans/module`](../module) - Module system for endpoints
- [`@owlmeans/route`](../route) - Routing infrastructure