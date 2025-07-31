# @owlmeans/server-config

The **@owlmeans/server-config** package provides server-specific configuration utilities for OwlMeans Common Libraries, offering helper functions for reading configuration values from files and managing service configurations in server environments.

## Purpose

This package serves as a server configuration management layer, designed for:

- **File-based Configuration**: Read configuration values from files using path references
- **Service Registration**: Simplified service configuration with automatic type detection
- **Server-specific Config**: Configuration utilities tailored for server environments
- **Path Resolution**: Automatic resolution of file paths and URLs for configuration values

## Key Concepts

### File Path Resolution
Automatically detects and reads configuration values from files when paths are provided, enabling secure storage of secrets and configuration outside of code.

### Service Configuration
Provides utilities for registering and configuring backend services with proper routing and resolution information.

## Installation

```bash
npm install @owlmeans/server-config
```

## API Reference

### Core Functions

The package provides utility functions following OwlMeans Common patterns for server-side configuration management:

#### `readConfigValue<T extends string | null>(value: T | undefined, def: T): T`

Reads configuration values with support for file path resolution and fallback defaults.

```typescript
import { readConfigValue } from '@owlmeans/server-config'

// Environment variable with default
const apiKey = readConfigValue(process.env.API_KEY, 'default-key')

// File-based secret reading
const dbPassword = readConfigValue('/secrets/db-password', '')

// URL-style file path
const privateKey = readConfigValue('file:///etc/ssl/private.key', '')
```

**Purpose**: Provides flexible configuration value resolution supporting both direct values and file-based configuration for secure secret management.

**Behavior**:
- **Direct values**: Returns the value as-is if not a file path
- **File path resolution**: Automatically reads file content when value starts with `/` or `file://`
- **Fallback handling**: Returns default value when input is `undefined`
- **Trimming**: Automatically trims whitespace from file content

**Parameters**:
- `value: T | undefined`: Configuration value or file path to read
- `def: T`: Default value returned when `value` is `undefined` (defaults to `null`)

**Returns**: `T` - Resolved configuration value

**Generic Type Parameter**:
- `T extends string | null`: Type of the configuration value, typically string

**File Path Support**:
- Absolute paths starting with `/`: `/config/database-url`  
- URL-style paths: `file:///secrets/api-key`
- Relative paths are treated as direct values, not file paths

**Error Handling**: Throws filesystem errors if file cannot be read (e.g., permission denied, file not found)

#### `sservice<C extends BasicServerConfig>(service: Omit<ServiceRoute, "resolved" | "type">, cfg?: Partial<C>): C`

Creates or updates server configuration with service registration and routing information.

```typescript
import { sservice } from '@owlmeans/server-config'
import type { BasicServerConfig } from '@owlmeans/server-config'

// Register database service
const config = sservice({
  service: 'database',
  host: 'localhost',
  port: 5432,
  internalHost: 'postgres.internal'
})

// Chain multiple services
const fullConfig = sservice({
  service: 'redis',
  host: 'redis-cluster.example.com',
  port: 6379
}, sservice({
  service: 'auth',
  host: 'auth-service.example.com',
  port: 8080
}))

// With existing configuration
const existingConfig: BasicServerConfig = { /* ... */ }
const updatedConfig = sservice({
  service: 'monitoring',
  host: 'metrics.internal',
  port: 9090
}, existingConfig)
```

**Purpose**: Registers services with the server configuration, enabling service discovery and routing within OwlMeans applications.

**Behavior**:
- **Service registration**: Adds service configuration to `cfg.services` object
- **Type enforcement**: Automatically sets service type to `AppType.Backend`
- **Host resolution**: Uses `host` if available, falls back to `internalHost`
- **Resolution status**: Marks service as resolved if either host is provided
- **Configuration merging**: Safely merges with existing configuration

**Parameters**:
- `service: Omit<ServiceRoute, "resolved" | "type">`: Service configuration excluding auto-managed fields
  - `service: string`: Unique service identifier
  - `host?: string`: Public/external hostname
  - `internalHost?: string`: Internal network hostname  
  - `port?: number`: Service port
  - Additional ServiceRoute properties
- `cfg?: Partial<C>`: Existing configuration to extend (optional)

**Returns**: `C extends BasicServerConfig` - Updated configuration with service registered

**Generic Type Parameter**:
- `C extends BasicServerConfig`: Configuration type, typically extends BasicServerConfig

**Service Resolution Logic**:
- Service is marked as `resolved: true` if `host` or `internalHost` is provided
- Final `host` value is `service.host ?? service.internalHost`
- Allows services to have different internal vs external addresses

**Configuration Structure**:
The function ensures the configuration has a `services` object and adds/updates the service entry:
```typescript
config.services[serviceName] = {
  type: AppType.Backend,
  resolved: boolean,
  host: string,
  ...serviceProperties
}
```

### Type Definitions

#### `BasicServerConfig`
Base configuration interface for server applications.

```typescript
interface BasicServerConfig extends BasicConfig {
  services?: Record<string, ServiceRoute>
  // Additional server-specific configuration
}
```

**Properties**:
- `services`: Object mapping service names to their routing configuration
- Extends `BasicConfig` from `@owlmeans/config` for common configuration properties

### Constants and Utilities

The package integrates with OwlMeans configuration constants:

#### File Path Conventions
- **Secrets**: `/secrets/` directory for sensitive configuration
- **Config**: `/config/` directory for non-sensitive configuration  
- **SSL/TLS**: `/etc/ssl/` for certificate and key files
- **Logs**: `/var/log/` for log configuration files

## Advanced Usage Examples

### Environment-Aware Configuration
```typescript
import { readConfigValue, sservice } from '@owlmeans/server-config'

// Environment-specific configuration loading
const getEnvironmentConfig = () => {
  const env = process.env.NODE_ENV || 'development'
  
  return {
    database: {
      host: readConfigValue(process.env.DB_HOST, `${env}-postgres`),
      port: parseInt(readConfigValue(process.env.DB_PORT, '5432')),
      // File-based secrets in production
      password: readConfigValue(
        env === 'production' ? '/secrets/db-password' : process.env.DB_PASSWORD,
        ''
      )
    },
    api: {
      port: parseInt(readConfigValue(process.env.API_PORT, '3000')),
      // Different secret strategies per environment
      jwtSecret: readConfigValue(
        env === 'production' ? 'file:///secrets/jwt-secret' : process.env.JWT_SECRET,
        'dev-secret'
      )
    }
  }
}
```

### Microservice Configuration Pattern
```typescript
import { sservice } from '@owlmeans/server-config'
import type { BasicServerConfig } from '@owlmeans/server-config'

// Build configuration for microservice architecture
const buildMicroserviceConfig = (): BasicServerConfig => {
  // Start with base configuration
  let config = sservice({
    service: 'user-service',
    host: readConfigValue(process.env.USER_SERVICE_HOST, 'users.internal'),
    port: parseInt(readConfigValue(process.env.USER_SERVICE_PORT, '8001'))
  })

  // Add authentication service
  config = sservice({
    service: 'auth-service', 
    host: readConfigValue(process.env.AUTH_SERVICE_HOST, 'auth.internal'),
    port: parseInt(readConfigValue(process.env.AUTH_SERVICE_PORT, '8002'))
  }, config)

  // Add external services
  config = sservice({
    service: 'payment-gateway',
    host: readConfigValue(process.env.PAYMENT_HOST, 'api.stripe.com'),
    port: 443
  }, config)

  return config
}

// Use in application
const appConfig = buildMicroserviceConfig()
console.log('Registered services:', Object.keys(appConfig.services || {}))
```

### Kubernetes ConfigMap Integration
```typescript
import { readConfigValue } from '@owlmeans/server-config'

// Kubernetes-style configuration mounting
const kubernetesConfig = {
  // ConfigMap-mounted configuration
  database: {
    host: readConfigValue('/etc/config/database/host', 'localhost'),
    port: parseInt(readConfigValue('/etc/config/database/port', '5432')),
    name: readConfigValue('/etc/config/database/name', 'myapp')
  },
  
  // Secret-mounted sensitive data
  credentials: {
    dbPassword: readConfigValue('/etc/secrets/database/password', ''),
    apiKey: readConfigValue('/etc/secrets/api/key', ''),
    jwtSecret: readConfigValue('/etc/secrets/jwt/secret', '')
  },

  // Environment-specific overrides
  features: {
    debugMode: readConfigValue(process.env.DEBUG_MODE, 'false') === 'true',
    logLevel: readConfigValue(process.env.LOG_LEVEL, 'info')
  }
}
```

## Error Handling and Best Practices

### File Reading Errors
```typescript
import { readConfigValue } from '@owlmeans/server-config'

const safeConfigRead = (path: string, defaultValue: string) => {
  try {
    return readConfigValue(path, defaultValue)
  } catch (error) {
    console.error(`Failed to read config from ${path}:`, error.message)
    return defaultValue
  }
}

// Use with error handling
const dbPassword = safeConfigRead('/secrets/db-password', '')
if (!dbPassword) {
  throw new Error('Database password is required but not configured')
}
```

### Configuration Validation
```typescript
import { sservice } from '@owlmeans/server-config'

const validateAndBuildConfig = () => {
  const requiredServices = ['database', 'redis', 'auth']
  
  let config = {}
  
  for (const serviceName of requiredServices) {
    const host = readConfigValue(`/config/${serviceName}-host`, '')
    const port = readConfigValue(`/config/${serviceName}-port`, '')
    
    if (!host || !port) {
      throw new Error(`Missing configuration for ${serviceName} service`)
    }
    
    config = sservice({
      service: serviceName,
      host,
      port: parseInt(port)
    }, config)
  }
  
  return config
}
```

## Security Considerations

### File System Security
1. **File Permissions**: Ensure secret files have restricted permissions (600 or 400)
2. **Path Validation**: Validate file paths to prevent directory traversal attacks
3. **Secret Rotation**: Implement mechanism to reload configuration when files change
4. **Audit Logging**: Log configuration file access for security monitoring

### Configuration Security
1. **Secrets Management**: Never log or expose file-based secrets
2. **Environment Separation**: Use different secret files per environment
3. **Encryption at Rest**: Consider encrypting configuration files containing sensitive data
4. **Network Security**: Protect configuration files during container deployment

## Performance Considerations

### File I/O Optimization
- **Caching**: File reads happen on every call - consider caching for frequently accessed config
- **Startup Loading**: Load all file-based configuration at application startup
- **Error Handling**: File system errors can be slow - implement timeouts for production

### Memory Usage
- **String Duplication**: `readConfigValue` creates new strings - be mindful with large configuration files
- **Service Objects**: Each `sservice` call creates new configuration objects

## Integration Patterns

### Express.js Application Configuration
```typescript
import express from 'express'
import { readConfigValue, sservice } from '@owlmeans/server-config'

const app = express()

// Configure application from files and environment
const config = {
  server: {
    port: parseInt(readConfigValue(process.env.PORT, '3000')),
    host: readConfigValue(process.env.HOST, '0.0.0.0')
  },
  cors: {
    origin: readConfigValue('/config/cors-origins', 'http://localhost:3000')
      .split(',').map(s => s.trim())
  }
}

// Register external services
const serviceConfig = sservice({
  service: 'user-database',
  host: readConfigValue('/config/database-host', 'localhost'),
  port: parseInt(readConfigValue('/config/database-port', '5432'))
})

app.listen(config.server.port, config.server.host, () => {
  console.log(`Server running on ${config.server.host}:${config.server.port}`)
})
```

### OwlMeans Context Integration
```typescript
import { makeServerContext } from '@owlmeans/server-context'
import { sservice, readConfigValue } from '@owlmeans/server-config'

// Build configuration with services
let config = sservice({
  service: 'primary-db',
  host: readConfigValue('/config/database-primary', 'localhost'),
  port: 5432
})

config = sservice({
  service: 'cache',
  host: readConfigValue('/config/redis-host', 'localhost'), 
  port: 6379
}, config)

// Create context with enhanced configuration
const context = makeServerContext(config)

// Services are now available through context
// context.service('database-client') can now find primary-db service
```

```typescript
import { readConfigValue } from '@owlmeans/server-config'

// Configuration that can come from files or environment variables
const databaseUrl = readConfigValue(
  process.env.DATABASE_URL || '/config/database-url',
  'postgresql://localhost:5432/defaultdb'
)

const jwtSecret = readConfigValue(
  '/secrets/jwt-secret',
  'development-secret'
)

const config = {
  database: {
    url: databaseUrl
  },
  auth: {
    jwtSecret: jwtSecret
  }
}
```

### Service Configuration

```typescript
import { sservice } from '@owlmeans/server-config'

// Build configuration with multiple services
let config = {}

// Add database service
config = sservice({
  service: 'postgres',
  host: 'postgres.example.com',
  port: 5432,
  internalHost: 'postgres-internal'
}, config)

// Add cache service
config = sservice({
  service: 'redis',
  host: 'redis.example.com',
  port: 6379
## Best Practices

1. **Secure Secrets Management**: Always use file paths for sensitive configuration like passwords and API keys
2. **Environment Flexibility**: Support both environment variables and file-based configuration with appropriate fallbacks
3. **Sensible Defaults**: Provide development-friendly defaults while enforcing production security
4. **Service Registration**: Use `sservice` for consistent service configuration and discovery
5. **Type Safety**: Leverage TypeScript generics for compile-time configuration validation
6. **Error Handling**: Implement proper error handling for file system operations
7. **Configuration Validation**: Validate critical configuration values at startup
8. **Caching Strategy**: Cache file-based configuration for performance in production

## Error Types and Handling

The package may throw the following errors:

### File System Errors
- **ENOENT**: File not found - occurs when configuration file doesn't exist
- **EACCES**: Permission denied - occurs when process lacks read permissions
- **EISDIR**: Is a directory - occurs when path points to directory instead of file

### Configuration Errors
- **Missing Required Configuration**: Critical services without proper configuration
- **Invalid Port Numbers**: Non-numeric port configuration values
- **Service Registration Conflicts**: Duplicate service names in configuration

## Dependencies

This package depends on:
- **@owlmeans/config**: Core configuration utilities and types (`BasicConfig`, `AppType`)
- **@owlmeans/server-route**: Server route definitions and service routing types (`ServiceRoute`)
- **Node.js fs module**: File system operations for reading configuration files

## Related OwlMeans Packages

### Core Configuration Ecosystem
- **[@owlmeans/config](../config)**: Core configuration management and base types
- **[@owlmeans/client-config](../client-config)**: Client-side configuration utilities
- **[@owlmeans/api-config](../api-config)**: Shared configuration between client and server

### Server Framework Integration
- **[@owlmeans/server-context](../server-context)**: Server context management and dependency injection
- **[@owlmeans/server-route](../server-route)**: Server routing functionality and definitions
- **[@owlmeans/server-auth](../server-auth)**: Server authentication configuration

### Security and Secrets Management
- **[@owlmeans/basic-keys](../basic-keys)**: Cryptographic key management for secure configuration
- **[@owlmeans/auth-common](../auth-common)**: Authentication configuration patterns

## Package Structure

Following OwlMeans Common library structure:

- **types**: TypeScript interface definitions (`BasicServerConfig`)
- **config**: Core configuration utilities (`sservice`)  
- **helpers**: Configuration reading utilities (`readConfigValue`)
- **index**: Main export aggregation

The package maintains a minimal, focused API surface while providing comprehensive functionality for server configuration management in OwlMeans applications.
