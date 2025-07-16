# @owlmeans/config

Configuration management library for OwlMeans Common applications. This package provides utilities for creating, managing, and merging configuration objects, along with resource management, security helpers, and plugin integration.

## Installation

```bash
npm install @owlmeans/config
```

## Overview

The `@owlmeans/config` package is part of the OwlMeans Common libraries ecosystem and provides a comprehensive configuration management solution. It follows the OwlMeans package structure with types, models, helpers, services, and resources.

### Key Features

- **Configuration Creation**: Create and merge configuration objects
- **Resource Management**: Handle configuration data as resources
- **Security Helpers**: Generate secure URLs and manage security settings
- **Plugin System**: Integrate and manage plugins
- **Error Handling**: Comprehensive error classes for configuration issues
- **Utility Functions**: Helper functions for configuration manipulation

## Core Concepts

### Configuration Objects

Configuration objects in OwlMeans are structured data that define application behavior, services, security settings, and plugins.

### Context Integration

Configurations are typically used within a context (application instance) and can be extended with resources and services.

### Resource Pattern

Configuration data can be accessed through a resource pattern, providing a consistent interface for CRUD operations.

## Quick Start

### Basic Configuration

```typescript
import { makeConfig, service } from '@owlmeans/config'
import { AppType } from '@owlmeans/config/exports'

// Create a basic configuration
const config = makeConfig(AppType.Backend, 'my-service', {
  debug: { enabled: true },
  brand: { home: '/dashboard' }
})

// Add a service configuration
const configWithService = service({
  service: 'api',
  host: 'api.example.com',
  base: '/v1'
}, config)
```

### Configuration with Resources

```typescript
import { appendConfigResource } from '@owlmeans/config'

// Append configuration resource to context
const contextWithConfig = appendConfigResource(context, 'main-config')

// Access configuration data
const configResource = context.getConfigResource('main-config')
const configItem = await configResource.get('item-id')
```

### Security Helper

```typescript
import { makeSecurityHelper } from '@owlmeans/config'

const securityHelper = makeSecurityHelper(context)

// Generate secure URLs
const url = securityHelper.url('/api/endpoint')
const routeUrl = securityHelper.makeUrl(route, '/path')
```

## API Reference

### Configuration Functions

#### `makeConfig<C extends CommonConfig>(type: AppType, service: string, cfg?: Partial<C>): C`

Creates a new configuration object with the specified type and service.

**Parameters:**
- `type` - Application type (Frontend, Backend, etc.)
- `service` - Service name
- `cfg` - Optional partial configuration to merge

**Returns:** Complete configuration object

**Example:**
```typescript
const config = makeConfig(AppType.Backend, 'user-service', {
  debug: { enabled: true },
  trusted: [{ id: 'admin', type: 'user' }]
})
```

#### `service<C extends CommonConfig>(service: Omit<CommonServiceRoute, "resolved">, cfg?: Partial<C>): C`

Adds a service configuration to the existing configuration.

**Parameters:**
- `service` - Service route configuration
- `cfg` - Optional configuration to extend

**Returns:** Configuration with added service

**Example:**
```typescript
const config = service({
  service: 'auth',
  host: 'auth.example.com',
  port: 443,
  base: '/api'
}, baseConfig)
```

### Helper Functions

#### `mergeConfig<T extends CommonConfig>(target: T, source: T): T`

Merges two configuration objects, combining arrays and merging nested objects.

**Parameters:**
- `target` - Target configuration object
- `source` - Source configuration to merge

**Returns:** Merged configuration object

**Example:**
```typescript
const merged = mergeConfig(baseConfig, {
  debug: { i18n: true },
  services: { newService: serviceConfig }
})
```

#### `toConfigRecord(object: Object): ConfigRecord`

Converts an object to a configuration record.

#### `fromConfigRecord<C extends ConfigRecord, T extends ResourceRecord>(object: C): T`

Converts a configuration record back to a typed object.

### Resource Management

#### `createConfigResource(alias?: string, key?: string): ConfigResource`

Creates a configuration resource for managing configuration data.

**Parameters:**
- `alias` - Resource alias (default: 'config')
- `key` - Configuration key (default: CONFIG_RECORD)

**Returns:** Configuration resource instance

**Example:**
```typescript
const configResource = createConfigResource('app-config', 'settings')
```

#### `appendConfigResource<C extends CommonConfig, T extends Context<C>>(ctx: T, alias?: string, key?: string): T & ConfigResourceAppend`

Appends a configuration resource to a context.

**Parameters:**
- `ctx` - Context to extend
- `alias` - Resource alias
- `key` - Configuration key

**Returns:** Context with configuration resource capabilities

### Security

#### `makeSecurityHelper<C extends CommonConfig, T extends Context<C>>(ctx: T): SecurityHelper`

Creates a security helper for URL generation and security management.

**Parameters:**
- `ctx` - Context with configuration

**Returns:** Security helper instance

**Methods:**
- `makeUrl(route, path?, params?)` - Generate URL from route
- `url(path?, params?)` - Generate URL from current service

**Example:**
```typescript
const security = makeSecurityHelper(context)
const apiUrl = security.makeUrl(apiRoute, '/users', { protocol: 'https' })
const currentUrl = security.url('/dashboard')
```

### Plugin Management

#### `plugin<C extends CommonConfig, R extends Partial<PluginConfig>>(config: C, record: R | string, id?: string): C`

Adds a plugin to the configuration.

**Parameters:**
- `config` - Configuration object
- `record` - Plugin configuration or plugin value string
- `id` - Plugin ID (required if record is string)

**Returns:** Configuration with added plugin

**Example:**
```typescript
const configWithPlugin = plugin(config, {
  id: 'auth-plugin',
  type: AppType.Backend,
  value: 'oauth2'
})
```

#### `clientPlugin<C extends CommonConfig, R extends Partial<PluginConfig>>(config: C, record: R | string, id?: string): C`

Adds a client-side plugin to the configuration.

**Parameters:**
- `config` - Configuration object
- `record` - Plugin configuration or plugin value string  
- `id` - Plugin ID (required if record is string)

**Returns:** Configuration with added client plugin

### Utility Functions

#### `visitConfigLeafs(tree: Tree, reader: (value: string) => Promise<TreeValue>): Promise<void>`

Visits all leaf nodes in a configuration tree and applies a reader function.

**Parameters:**
- `tree` - Configuration tree to traverse
- `reader` - Async function to process string values

**Example:**
```typescript
await visitConfigLeafs(config, async (value) => {
  return value.startsWith('$') ? await resolveEnvVar(value) : value
})
```

## Types

### Core Interfaces

#### `CommonConfig`

Main configuration interface extending BasicConfig.

```typescript
interface CommonConfig extends BasicConfig {
  dbs?: DbConfig[]
  trusted: Profile[]
  [CONFIG_RECORD]: ConfigRecord[]
  [PLUGIN_RECORD]?: PluginConfig[]
  debug: BasicConfig["debug"] & {
    i18n?: boolean
  }
  security?: SecurityConfig
  defaultEntityId?: string
  brand: BrandSettings
}
```

#### `ConfigResource<T extends ConfigRecord>`

Resource interface for configuration data management.

```typescript
interface ConfigResource<T extends ConfigRecord> extends Resource<T> {
  // Inherits standard resource methods: get, load, list, save, create, update, delete, pick
}
```

#### `SecurityConfig`

Security configuration interface.

```typescript
interface SecurityConfig {
  unsecure?: boolean
  auth?: {
    flow?: string
    enter?: string
  }
}
```

#### `PluginConfig`

Plugin configuration interface.

```typescript
interface PluginConfig extends ConfigRecord {
  type?: AppType
  value?: string
}
```

#### `BrandSettings`

Brand configuration interface.

```typescript
interface BrandSettings {
  home?: string
}
```

### Helper Types

#### `SecurityHelper`

Security helper interface for URL generation.

```typescript
interface SecurityHelper {
  makeUrl: (route: BasicRoute | CommonRoute, path?: string | SecurityHelperUrlParams, params?: SecurityHelperUrlParams) => string
  url: (path?: string, params?: SecurityHelperUrlParams) => string
}
```

#### `SecurityHelperUrlParams`

Parameters for URL generation.

```typescript
interface SecurityHelperUrlParams {
  path?: string
  forceUnsecure?: boolean
  protocol?: RouteProtocols
  host?: string
  base?: string | boolean
}
```

## Error Classes

### `ConfigError`

Base error class for configuration-related errors.

```typescript
class ConfigError extends ResilientError {
  constructor(message: string = 'error')
}
```

### `ConfigResourceError`

Error class for configuration resource operations.

```typescript
class ConfigResourceError extends ConfigError {
  constructor(message: string = 'error')
}
```

### `PluginMissconfigured`

Error class for plugin configuration issues.

```typescript
class PluginMissconfigured extends ConfigResourceError {
  constructor(message: string = 'error')
}
```

## Constants

- `DEFAULT_ALIAS` - Default resource alias ('config')
- `PLUGIN_RECORD` - Plugin record key ('plugins')
- `TRUSTED` - Trusted profiles key ('trusted')
- `PLUGINS` - Plugins key ('plugins')

## Usage Examples

### Complete Application Configuration

```typescript
import { 
  makeConfig, 
  service, 
  plugin, 
  appendConfigResource,
  makeSecurityHelper 
} from '@owlmeans/config'
import { AppType } from '@owlmeans/config/exports'

// Create base configuration
let config = makeConfig(AppType.Backend, 'main-service', {
  debug: { enabled: true, i18n: true },
  brand: { home: '/dashboard' },
  security: { 
    unsecure: false,
    auth: { flow: 'oauth2', enter: '/login' }
  }
})

// Add services
config = service({
  service: 'auth',
  host: 'auth.example.com',
  base: '/api/v1'
}, config)

config = service({
  service: 'database',
  host: 'db.example.com',
  port: 5432
}, config)

// Add plugins
config = plugin(config, {
  id: 'logger',
  type: AppType.Backend,
  value: 'winston'
})

// Create context with configuration
const context = createContext(config)
const contextWithConfig = appendConfigResource(context)

// Use security helper
const security = makeSecurityHelper(context)
const loginUrl = security.url('/login')
```

### Configuration Resource Operations

```typescript
// Get configuration resource
const configResource = context.getConfigResource()

// List all configuration records
const allConfigs = await configResource.list()

// Get specific configuration
const userConfig = await configResource.get('user-settings')

// Load configuration (returns null if not found)
const optionalConfig = await configResource.load('optional-settings')
```

### Dynamic Configuration Processing

```typescript
import { visitConfigLeafs } from '@owlmeans/config/utils'

// Process environment variables in configuration
await visitConfigLeafs(config, async (value) => {
  if (value.startsWith('${') && value.endsWith('}')) {
    const envVar = value.slice(2, -1)
    return process.env[envVar] || value
  }
  return value
})
```

## Integration with OwlMeans Ecosystem

The `@owlmeans/config` package integrates seamlessly with other OwlMeans packages:

- **@owlmeans/context**: Provides context management for configurations
- **@owlmeans/resource**: Offers resource patterns for configuration data
- **@owlmeans/route**: Supplies routing capabilities and URL generation
- **@owlmeans/auth**: Handles authentication and authorization
- **@owlmeans/error**: Provides error handling framework

## Best Practices

1. **Configuration Structure**: Follow the OwlMeans package idioms (types, consts, models, helpers, services, resources)

2. **Security**: Always configure security settings appropriately for your environment

3. **Plugin Management**: Use type-specific plugins and proper configuration

4. **Resource Usage**: Utilize configuration resources for dynamic configuration management

5. **Error Handling**: Implement proper error handling using the provided error classes

6. **Context Integration**: Always use configurations within proper contexts

## License

This package is part of the OwlMeans Common libraries and follows the project's licensing terms.