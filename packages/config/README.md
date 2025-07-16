# @owlmeans/config

Configuration management library for OwlMeans Common applications. This package provides utilities for creating, managing, and merging configuration objects, along with resource management, security helpers, and plugin integration.

## Installation

```bash
npm install @owlmeans/config
```

**Note**: This package depends on `@owlmeans/context` and extends its functionality. Make sure you have the proper OwlMeans Common ecosystem set up in your project.

## Overview

The `@owlmeans/config` package is part of the OwlMeans Common libraries ecosystem and provides a comprehensive configuration management solution. It follows the OwlMeans package structure with types, models, helpers, services, and resources.

**Important Note**: This package is not intended to be used separately from the OwlMeans Common ecosystem. It extends the functionality of `@owlmeans/context` and should be used in conjunction with it. The configuration objects created by this package build upon the basic configuration structure provided by `@owlmeans/context`.

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

This package extends the functionality of `@owlmeans/context` by providing additional configuration management capabilities. Configurations are built upon the basic configuration structure from `@owlmeans/context` and are typically used within a context (application instance). They can be extended with resources and services through the functions provided by this package.

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

### Client-Side Configuration

For client-side applications, use `@owlmeans/client-config`:

```typescript
import { BasicClientConfig, addWebService } from '@owlmeans/client-config'
import { makeConfig } from '@owlmeans/config'

// Create client configuration
let config: BasicClientConfig = makeConfig(AppType.Frontend, 'web-app', {
  primaryHost: 'app.example.com',
  shortAlias: 'webapp'
})

// Add web services
config = addWebService('https://api.example.com', 'api', config)
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

Creates a security helper for URL generation and security management. The security helper provides methods to generate URLs with proper protocol handling, host resolution, and security configuration.

**Parameters:**
- `ctx` - Context with configuration containing service definitions and security settings

**Returns:** Security helper instance with URL generation methods

**Security Helper Methods:**

#### `makeUrl(route: BasicRoute | CommonRoute, path?: string | SecurityHelperUrlParams, params?: SecurityHelperUrlParams): string`

Generates a complete URL from a route configuration with optional path and parameters. This method handles protocol selection, host resolution from service configuration, base path handling, and security settings.

**Parameters:**
- `route` - Route configuration object containing service, host, base, and other route properties
- `path` - Optional path to append to the URL, or SecurityHelperUrlParams object
- `params` - Optional parameters to override route settings

**SecurityHelperUrlParams Interface:**
- `path?: string` - Path to append to the URL
- `forceUnsecure?: boolean` - Force HTTP instead of HTTPS
- `protocol?: RouteProtocols` - Override protocol (WEB or SOCKET)
- `host?: string` - Override host from route
- `base?: string | boolean` - Override base path (false = use route base, true = no base, string = custom base)

**Behavior:**
- Determines protocol security based on route.secure, context security config, and params
- Resolves host from route or service configuration
- Handles base path resolution with override options
- Normalizes paths and constructs complete URLs
- Supports both web (http/https) and socket (ws/wss) protocols

**Example:**
```typescript
const security = makeSecurityHelper(context)

// Generate URL from route with path
const apiUrl = security.makeUrl(apiRoute, '/users')

// Generate URL with custom parameters
const secureUrl = security.makeUrl(apiRoute, '/admin', { 
  protocol: RouteProtocols.WEB,
  forceUnsecure: false,
  host: 'admin.example.com'
})

// Generate URL with path in params
const customUrl = security.makeUrl(apiRoute, { 
  path: '/data',
  base: '/api/v2'
})
```

#### `url(path?: string | SecurityHelperUrlParams, params?: SecurityHelperUrlParams): string`

Generates a URL using the current service context. This is a convenience method that uses the current service configuration from the context to generate URLs without requiring a route object.

**Parameters:**
- `path` - Optional path to append to the URL, or SecurityHelperUrlParams object
- `params` - Optional parameters to override service settings

**Behavior:**
- Uses the current service from context configuration (ctx.cfg.service)
- Resolves host and base from the current service configuration
- Applies the same security and protocol logic as makeUrl
- Throws error if current service is not configured

**Example:**
```typescript
const security = makeSecurityHelper(context)

// Generate URL from current service
const dashboardUrl = security.url('/dashboard')

// Generate URL with custom host
const customUrl = security.url('/api/data', { 
  host: 'api.example.com',
  protocol: RouteProtocols.WEB
})

// Generate URL with path in params
const settingsUrl = security.url({ 
  path: '/settings',
  forceUnsecure: true
})
```

**Security Configuration:**

The security helper respects the following configuration options:
- `ctx.cfg.security?.unsecure` - Global security setting (true = force HTTP, false = force HTTPS)
- `route.secure` - Per-route security setting
- `params.forceUnsecure` - Override to force HTTP for specific calls

**Protocol Handling:**
- Automatically adds 's' suffix for secure protocols (https, wss)
- Supports both web (http/https) and socket (ws/wss) protocols
- Handles fully qualified host URLs by extracting protocol and host parts

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
- **@owlmeans/client-config**: Extends config with client-side specific functionality

### Client-Side Configuration Extension

For client-side applications, consider using `@owlmeans/client-config` which extends this package with client-specific configuration capabilities:

```typescript
import { BasicClientConfig, addWebService } from '@owlmeans/client-config'
import { makeConfig } from '@owlmeans/config'

// Create client configuration with web service management
let config: BasicClientConfig = makeConfig(AppType.Frontend, 'web-app', {
  primaryHost: 'app.example.com',
  shortAlias: 'webapp'
})

// Add web services with aliases
config = addWebService('https://api.example.com', 'api', config)
config = addWebService('https://auth.example.com', 'auth', config)
```

The `@owlmeans/client-config` package provides:
- **Web Service Management**: Configure and manage web services with aliases
- **Primary Host/Port Settings**: Set primary host and port configurations for client applications
- **Service Aliases**: Create short, memorable names for services
- **Client-Side Extensions**: Additional properties relevant for client-side applications

See the `@owlmeans/client-config` package documentation for complete API reference and usage examples.

## Best Practices

1. **Configuration Structure**: Follow the OwlMeans package idioms (types, consts, models, helpers, services, resources)

2. **Security**: Always configure security settings appropriately for your environment

3. **Plugin Management**: Use type-specific plugins and proper configuration

4. **Resource Usage**: Utilize configuration resources for dynamic configuration management

5. **Error Handling**: Implement proper error handling using the provided error classes

6. **Context Integration**: Always use configurations within proper contexts

## License

This package is part of the OwlMeans Common libraries and follows the project's licensing terms.