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

### Types

#### `BasicServerConfig`
Base configuration interface for server applications.

```typescript
interface BasicServerConfig {
  services?: Record<string, ServiceRoute>
  // Other server-specific configuration properties
}
```

### Helper Functions

#### `readConfigValue<T extends string | null>(value: T | undefined, def: T): T`

Reads configuration values, automatically loading from files if a file path is provided.

**Parameters:**
- `value`: Configuration value or file path
- `def`: Default value if undefined

**Returns:** Resolved configuration value

```typescript
import { readConfigValue } from '@owlmeans/server-config'

// Read from environment or default
const apiKey = readConfigValue(process.env.API_KEY, 'default-key')

// Read from file if path provided
const secret = readConfigValue('/secrets/api-secret', 'fallback-secret')
// or
const secret = readConfigValue('file:///secrets/api-secret', 'fallback-secret')
```

#### `sservice<C extends BasicServerConfig>(service: Omit<ServiceRoute, "resolved" | "type">, cfg?: Partial<C>): C`

Creates or updates server configuration with service information.

**Parameters:**
- `service`: Service route configuration
- `cfg`: Optional existing configuration to extend

**Returns:** Updated configuration with service added

```typescript
import { sservice } from '@owlmeans/server-config'

// Add database service
const config = sservice({
  service: 'database',
  host: 'localhost',
  port: 5432
})

// Add multiple services
const fullConfig = sservice({
  service: 'redis',
  host: 'redis-server',
  port: 6379
}, sservice({
  service: 'database',
  host: 'postgres-server',
  port: 5432
}))
```

## Usage Examples

### File-based Configuration

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
}, config)

// Add API gateway
config = sservice({
  service: 'api-gateway',
  host: 'api.example.com',
  port: 80
}, config)

console.log(config.services)
// {
//   postgres: { service: 'postgres', host: 'postgres.example.com', port: 5432, type: 'backend', resolved: true },
//   redis: { service: 'redis', host: 'redis.example.com', port: 6379, type: 'backend', resolved: true },
//   'api-gateway': { service: 'api-gateway', host: 'api.example.com', port: 80, type: 'backend', resolved: true }
// }
```

### Environment-based Configuration

```typescript
import { readConfigValue, sservice } from '@owlmeans/server-config'

// Read configuration from various sources
const dbHost = readConfigValue(process.env.DB_HOST, 'localhost')
const dbPort = parseInt(readConfigValue(process.env.DB_PORT, '5432'))
const dbPassword = readConfigValue('/secrets/db-password', 'development')

// Build service configuration
const config = sservice({
  service: 'database',
  host: dbHost,
  port: dbPort,
  credentials: {
    password: dbPassword
  }
})
```

### Docker Secrets Integration

```typescript
import { readConfigValue } from '@owlmeans/server-config'

// Docker secrets are mounted as files
const dbPassword = readConfigValue('/run/secrets/db_password', '')
const apiKey = readConfigValue('/run/secrets/api_key', '')
const jwtSecret = readConfigValue('/run/secrets/jwt_secret', 'dev-secret')

const config = {
  database: {
    host: 'postgres',
    port: 5432,
    password: dbPassword
  },
  external: {
    apiKey: apiKey
  },
  auth: {
    jwtSecret: jwtSecret
  }
}
```

## Integration Patterns

### Server Application Setup

```typescript
import { sservice, readConfigValue } from '@owlmeans/server-config'
import { makeServerConfig } from '@owlmeans/server-context'

// Build comprehensive server configuration
let serviceConfig = {}

// Add required services
serviceConfig = sservice({
  service: 'postgres',
  host: readConfigValue(process.env.POSTGRES_HOST, 'localhost'),
  port: parseInt(readConfigValue(process.env.POSTGRES_PORT, '5432'))
}, serviceConfig)

serviceConfig = sservice({
  service: 'redis',
  host: readConfigValue(process.env.REDIS_HOST, 'localhost'),
  port: parseInt(readConfigValue(process.env.REDIS_PORT, '6379'))
}, serviceConfig)

// Create final server configuration
const config = makeServerConfig('my-server', {
  ...serviceConfig,
  port: parseInt(readConfigValue(process.env.PORT, '3000')),
  jwtSecret: readConfigValue('/secrets/jwt-secret', 'dev-secret')
})
```

### Kubernetes ConfigMaps and Secrets

```typescript
import { readConfigValue } from '@owlmeans/server-config'

// Kubernetes mounts ConfigMaps and Secrets as files
const config = {
  database: {
    host: readConfigValue('/config/db-host', 'localhost'),
    port: parseInt(readConfigValue('/config/db-port', '5432')),
    password: readConfigValue('/secrets/db-password', '')
  },
  features: {
    enableLogging: readConfigValue('/config/enable-logging', 'false') === 'true',
    logLevel: readConfigValue('/config/log-level', 'info')
  }
}
```

## Best Practices

1. **Secure Secrets**: Use file paths for sensitive configuration like passwords and API keys
2. **Environment Flexibility**: Support both environment variables and file-based configuration
3. **Defaults**: Always provide sensible defaults for development environments
4. **Service Registration**: Use `sservice` for consistent service configuration
5. **Type Safety**: Leverage TypeScript for configuration type checking

## Dependencies

This package depends on:
- `@owlmeans/config` - Core configuration utilities
- `@owlmeans/server-route` - Server route definitions
- Node.js `fs` module - File system operations

## Related Packages

- [`@owlmeans/config`](../config) - Core configuration management
- [`@owlmeans/server-context`](../server-context) - Server context management
- [`@owlmeans/server-route`](../server-route) - Server routing functionality
