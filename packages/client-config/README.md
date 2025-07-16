# @owlmeans/client-config

Client-side configuration management library for OwlMeans Common applications. This package extends the base `@owlmeans/config` package with client-specific configuration capabilities including web service management, primary host/port settings, and service aliases.

## Installation

```bash
npm install @owlmeans/client-config
```

**Note**: This package depends on `@owlmeans/config` and extends its functionality. Make sure you have the proper OwlMeans Common ecosystem set up in your project.

## Overview

The `@owlmeans/client-config` package is part of the OwlMeans Common libraries ecosystem and provides client-side configuration extensions. It follows the OwlMeans package structure with types, constants, and helpers specifically designed for client-side applications.

**Important Note**: This package is not intended to be used separately from the OwlMeans Common ecosystem. It extends the functionality of `@owlmeans/config` and should be used in conjunction with it. The configuration objects created by this package build upon the configuration structure provided by `@owlmeans/config`.

### Key Features

- **Web Service Management**: Configure and manage web services with aliases
- **Primary Host/Port Settings**: Set primary host and port configurations
- **Service Aliases**: Create short aliases for services
- **Client-Side Extensions**: Extend base configuration with client-specific properties
- **Seamless Integration**: Works seamlessly with the base `@owlmeans/config` package

## Core Concepts

### Client Configuration

Client configurations extend the base `CommonConfig` from `@owlmeans/config` with client-specific properties that are relevant for client-side applications.

### Web Service Management

The package provides functionality to manage web services, supporting both single service configurations and multiple aliased services for complex client applications.

### Service Aliases

Service aliases allow you to create short, memorable names for services, making it easier to reference them in client-side code.

## Quick Start

### Basic Client Configuration

```typescript
import { BasicClientConfig, addWebService } from '@owlmeans/client-config'
import { makeConfig } from '@owlmeans/config'
import { AppType } from '@owlmeans/config/exports'

// Create a client configuration
const config: BasicClientConfig = makeConfig(AppType.Frontend, 'my-client', {
  webService: 'https://api.example.com',
  primaryHost: 'app.example.com',
  primaryPort: 443,
  shortAlias: 'myapp'
})
```

### Adding Web Services

```typescript
import { addWebService } from '@owlmeans/client-config'

// Add a single web service
const configWithService = addWebService('https://api.example.com', config)

// Add a web service with alias
const configWithAlias = addWebService('https://api.example.com', 'api', config)

// Add multiple services with aliases
let multiServiceConfig = addWebService('https://api.example.com', 'api', config)
multiServiceConfig = addWebService('https://auth.example.com', 'auth', multiServiceConfig)
```

## API Reference

### Types

#### `BasicClientConfig`

Extends `CommonConfig` from `@owlmeans/config` with client-specific properties.

```typescript
interface BasicClientConfig extends CommonConfig {
  webService?: string | Record<string, string>
  primaryHost?: string
  primaryPort?: number
  shortAlias?: string
}
```

**Properties:**

- `webService` - Web service configuration. Can be a single service URL (string) or a record of aliased services
- `primaryHost` - Primary host for the client application
- `primaryPort` - Primary port for the client application
- `shortAlias` - Short alias for the service, useful for client-side identification

**Example:**
```typescript
const clientConfig: BasicClientConfig = {
  // ... inherited from CommonConfig
  webService: {
    default: 'https://api.example.com',
    auth: 'https://auth.example.com',
    storage: 'https://storage.example.com'
  },
  primaryHost: 'app.example.com',
  primaryPort: 443,
  shortAlias: 'myapp'
}
```

### Helper Functions

#### `addWebService<C extends BasicClientConfig>(service: string, alias?: string | Partial<C>, cfg?: Partial<C>): C`

Adds a web service to the client configuration. This function handles both single services and multiple aliased services.

**Parameters:**
- `service` - The web service URL to add
- `alias` - Service alias (string) or partial configuration object
- `cfg` - Optional partial configuration to extend

**Returns:** Configuration with added web service

**Behavior:**
- If `alias` is not provided or is an object, sets the service as the default or single web service
- If `alias` is a string, adds the service with the specified alias
- Handles conversion between string and record-based web service configurations
- Maintains existing services when adding new ones

**Examples:**

**Adding a single web service:**
```typescript
const config = addWebService('https://api.example.com')
// Result: { webService: 'https://api.example.com' }
```

**Adding a web service with alias:**
```typescript
const config = addWebService('https://api.example.com', 'api')
// Result: { webService: { default: 'https://api.example.com', api: 'https://api.example.com' } }
```

**Adding multiple services:**
```typescript
let config = addWebService('https://api.example.com', 'api')
config = addWebService('https://auth.example.com', 'auth', config)
// Result: { 
//   webService: { 
//     default: 'https://api.example.com', 
//     api: 'https://api.example.com',
//     auth: 'https://auth.example.com'
//   } 
// }
```

**Adding service with existing string configuration:**
```typescript
const baseConfig = { webService: 'https://base.example.com' }
const config = addWebService('https://api.example.com', 'api', baseConfig)
// Result: { 
//   webService: { 
//     default: 'https://base.example.com', 
//     api: 'https://api.example.com'
//   } 
// }
```

**Using partial configuration object:**
```typescript
const config = addWebService('https://api.example.com', {
  primaryHost: 'app.example.com',
  shortAlias: 'myapp'
})
// Result: { 
//   webService: 'https://api.example.com',
//   primaryHost: 'app.example.com',
//   shortAlias: 'myapp'
// }
```

## Constants

### `DEFAULT_KEY`

Default key used for web service configurations when no alias is specified.

```typescript
const DEFAULT_KEY = 'default'
```

**Usage:**
```typescript
import { DEFAULT_KEY } from '@owlmeans/client-config'

// Access default web service
const defaultService = config.webService?.[DEFAULT_KEY]
```

## Usage Examples

### Complete Client Application Configuration

```typescript
import { 
  BasicClientConfig, 
  addWebService, 
  DEFAULT_KEY 
} from '@owlmeans/client-config'
import { makeConfig, service } from '@owlmeans/config'
import { AppType } from '@owlmeans/config/exports'

// Create base client configuration
let config: BasicClientConfig = makeConfig(AppType.Frontend, 'web-app', {
  debug: { enabled: true },
  brand: { home: '/dashboard' },
  primaryHost: 'app.example.com',
  primaryPort: 443,
  shortAlias: 'webapp'
})

// Add web services
config = addWebService('https://api.example.com', 'api', config)
config = addWebService('https://auth.example.com', 'auth', config)
config = addWebService('https://storage.example.com', 'storage', config)

// Add backend services (using base config functionality)
config = service({
  service: 'websocket',
  host: 'ws.example.com',
  port: 8080,
  base: '/ws'
}, config)

console.log('API Service:', config.webService?.api)
console.log('Auth Service:', config.webService?.auth)
console.log('Default Service:', config.webService?.[DEFAULT_KEY])
```

### Dynamic Service Configuration

```typescript
import { addWebService, BasicClientConfig } from '@owlmeans/client-config'

class ClientConfigManager {
  private config: BasicClientConfig

  constructor(baseConfig: BasicClientConfig) {
    this.config = baseConfig
  }

  addService(url: string, alias: string): void {
    this.config = addWebService(url, alias, this.config)
  }

  getService(alias: string = DEFAULT_KEY): string | undefined {
    if (typeof this.config.webService === 'string') {
      return alias === DEFAULT_KEY ? this.config.webService : undefined
    }
    return this.config.webService?.[alias]
  }

  getAllServices(): Record<string, string> {
    if (typeof this.config.webService === 'string') {
      return { [DEFAULT_KEY]: this.config.webService }
    }
    return this.config.webService || {}
  }
}

// Usage
const manager = new ClientConfigManager(baseConfig)
manager.addService('https://api.example.com', 'api')
manager.addService('https://auth.example.com', 'auth')

const apiUrl = manager.getService('api')
const allServices = manager.getAllServices()
```

### Environment-Specific Configuration

```typescript
import { addWebService, BasicClientConfig } from '@owlmeans/client-config'

function createEnvironmentConfig(env: 'development' | 'staging' | 'production'): BasicClientConfig {
  const hosts = {
    development: 'localhost:3000',
    staging: 'staging.example.com',
    production: 'app.example.com'
  }

  const apiUrls = {
    development: 'http://localhost:8000',
    staging: 'https://staging-api.example.com',
    production: 'https://api.example.com'
  }

  let config: BasicClientConfig = {
    primaryHost: hosts[env],
    primaryPort: env === 'development' ? 3000 : 443,
    shortAlias: `app-${env}`
  }

  // Add environment-specific services
  config = addWebService(apiUrls[env], 'api', config)
  
  if (env !== 'development') {
    config = addWebService(`https://${env}-auth.example.com`, 'auth', config)
  }

  return config
}

// Usage
const devConfig = createEnvironmentConfig('development')
const prodConfig = createEnvironmentConfig('production')
```

## Integration with OwlMeans Ecosystem

The `@owlmeans/client-config` package integrates seamlessly with other OwlMeans packages:

- **@owlmeans/config**: Provides base configuration functionality that this package extends
- **@owlmeans/context**: Supports context management for client configurations
- **@owlmeans/client**: Works with other client-side packages in the ecosystem
- **@owlmeans/route**: Complements routing capabilities with client configuration
- **@owlmeans/web-client**: Provides web-specific implementations

## Best Practices

1. **Service Organization**: Use aliases for different types of services (api, auth, storage, etc.)

2. **Environment Configuration**: Create environment-specific configurations for different deployment stages

3. **Type Safety**: Always use the `BasicClientConfig` type for type-safe configuration management

4. **Service Discovery**: Use meaningful aliases that reflect the service purpose

5. **Configuration Validation**: Validate service URLs and configuration before use

6. **Fallback Handling**: Always handle cases where services might not be configured

## Migration from Base Config

If you're migrating from using only `@owlmeans/config`, here's how to adopt client-config:

```typescript
// Before (base config only)
import { makeConfig } from '@owlmeans/config'

const config = makeConfig(AppType.Frontend, 'my-app', {
  // ... base configuration
})

// After (with client-config)
import { makeConfig } from '@owlmeans/config'
import { addWebService, BasicClientConfig } from '@owlmeans/client-config'

let config: BasicClientConfig = makeConfig(AppType.Frontend, 'my-app', {
  // ... base configuration
  primaryHost: 'app.example.com',
  shortAlias: 'myapp'
})

config = addWebService('https://api.example.com', 'api', config)
```

## License

This package is part of the OwlMeans Common libraries and follows the project's licensing terms.