# @owlmeans/server-wl

Server-side whitelabeling functionality for OwlMeans Common Libraries. This package provides backend whitelabeling capabilities enabling server applications to deliver customized branding, theming, and content personalization based on entity-specific configurations.

## Overview

The `@owlmeans/server-wl` package serves as the server-side implementation of the OwlMeans Whitelabeling Subsystem, designed for fullstack applications with focus on security and dynamic brand customization. It provides:

- **Server-side Whitelabeling**: Backend whitelabeling provider services and API endpoints
- **Entity-based Branding**: Dynamic brand customization based on entity identification
- **Multi-provider Architecture**: Support for multiple whitelabeling data providers (company info, styles, media, DNS)
- **API Integration**: RESTful endpoints for whitelabeling data retrieval
- **Identifier Resolution**: DNS and domain-based entity identification services
- **Security Integration**: Secure whitelabeling data access with OwlMeans authentication

This package follows the OwlMeans "quadra" pattern as the **server** implementation, complementing:
- **@owlmeans/wled**: Common whitelabeling declarations and base functionality *(base package)*
- **@owlmeans/client-wl**: Client-side whitelabeling implementation  
- **@owlmeans/web-wl**: Web-specific whitelabeling implementation
- **@owlmeans/server-wl**: Server-side whitelabeling implementation *(this package)*

## Installation

```bash
npm install @owlmeans/server-wl
```

## Dependencies

This package requires and integrates with:
- `@owlmeans/wled`: Core whitelabeling types and modules
- `@owlmeans/server-context`: Server context management
- `@owlmeans/server-module`: Server module system for whitelabeling APIs
- `@owlmeans/server-api`: Server API utilities for request handling
- `@owlmeans/context`: Context management and service registration

## Key Concepts

### Whitelabeling Providers
The package implements a provider pattern where different aspects of whitelabeling can be handled by separate services:

- **Company Information Provider**: Provides company details, branding information
- **Styles Provider**: Delivers custom colors, fonts, and visual styling
- **Media Provider**: Serves custom logos, images, and brand assets
- **DNS Provider**: Handles domain-based entity identification

### Entity Identification
Server-side entity identification enables:
- **Domain Resolution**: Map domains/hostnames to specific entities
- **Subdomain Routing**: Route based on subdomain patterns
- **Custom Identifiers**: Support for custom entity identification schemes
- **Fallback Handling**: Graceful handling of unrecognized entities

### API Integration
Provides RESTful endpoints for:
- **Whitelabeling Data Retrieval**: Get entity-specific branding data
- **Real-time Updates**: Dynamic branding updates without deployment
- **Caching Support**: Efficient caching of whitelabeling data
- **Validation**: Server-side validation of whitelabeling configurations

## API Reference

### Core Interfaces

#### `WlProvider`

Service interface for whitelabeling data providers.

```typescript
interface WlProvider extends InitializedService {
  provide: (entityId: string) => Promise<ProvidedWL>
}
```

**Methods:**

**`provide(entityId: string): Promise<ProvidedWL>`**
- **Purpose**: Provide whitelabeling data for a specific entity
- **Parameters**: `entityId` - Unique entity identifier
- **Returns**: Promise resolving to whitelabeling data object
- **Behavior**: Retrieves and returns entity-specific whitelabeling configuration

#### `WlEntityIdentifier`

Service interface for entity identification.

```typescript
interface WlEntityIdentifier extends InitializedService {
  identifyEntity: (identifier: string) => Promise<string | null>
}
```

**Methods:**

**`identifyEntity(identifier: string): Promise<string | null>`**
- **Purpose**: Identify entity from domain, hostname, or custom identifier
- **Parameters**: `identifier` - Domain, hostname, or custom identifier string
- **Returns**: Promise resolving to entity ID or null if not found
- **Behavior**: Maps identifier to entity ID using configured resolution strategy

#### `WlProviderAppend`

Configuration interface for whitelabeling provider setup.

```typescript
interface WlProviderAppend {
  wlProviders: string[]           // Array of whitelabeling provider service names
  wlIdentifierService?: string    // Optional entity identifier service name
}
```

#### `Config`

Server configuration interface extending base server config with whitelabeling settings.

```typescript
interface Config extends ServerConfig, WlProviderAppend {
  // Inherits all server configuration options
  // Plus whitelabeling-specific configuration
}
```

#### `Context<C extends Config = Config>`

Server context interface with whitelabeling support.

```typescript
interface Context<C extends Config = Config> extends ServerContext<C> {
  // Inherits all server context functionality
  // With typed configuration for whitelabeling
}
```

### Module Integration

The package automatically elevates base whitelabeling modules with server-specific handlers:

```typescript
import { elevate } from '@owlmeans/server-module'
import { WL_PROVIDE, modules as wlModules } from '@owlmeans/wled'
import * as actions from './actions/index.js'

// Elevate base modules with server handlers
elevate(wlModules, WL_PROVIDE, actions.provide)

export const modules = wlModules as ServerModule<unknown>[]
```

### Server Actions

#### `provide` Action Handler

Server-side handler for whitelabeling data provision requests.

```typescript
const provide: RefedModuleHandler = handleParams<ProvideParams>(
  async (params, ctx) => {
    const context = assertContext(ctx, 'provide') as Context
    
    // Optional DNS-based entity identification
    const dns = context.cfg.wlIdentifierService == null ? undefined
      : context.service<WlEntityIdentifier>(context.cfg.wlIdentifierService)
    
    // Resolve entity ID from identifier
    const entityId = dns != null
      ? await dns.identifyEntity(params.entity) ?? params.entity
      : params.entity
    
    // Collect data from all registered providers
    const wl = Object.fromEntries(await Promise.all(
      context.cfg.wlProviders.map(async provider => {
        const srv = context.service<WlProvider>(provider)
        return [provider, await srv.provide(entityId)]
      })
    ))
    
    return wl
  }
)
```

## Usage Examples

### Basic Server Whitelabeling Setup

```typescript
import { makeServerContext } from '@owlmeans/server-context'
import { modules } from '@owlmeans/server-wl'
import type { Config, Context, WlProvider } from '@owlmeans/server-wl'

// Configure server with whitelabeling support
const config: Config = {
  service: 'whitelabel-server',
  type: AppType.Backend,
  layer: Layer.Service,
  wlProviders: ['company-provider', 'styles-provider', 'media-provider'],
  wlIdentifierService: 'dns-identifier'
}

const context: Context = makeServerContext(config)

// Register whitelabeling modules
context.registerModules(modules)

// Initialize context
await context.configure().init()
```

### Company Information Provider

```typescript
import { createService } from '@owlmeans/context'
import type { WlProvider } from '@owlmeans/server-wl'
import type { CompanyInfo, ProvidedWL } from '@owlmeans/wled'

// Create company information provider
const companyProvider = createService<WlProvider>('company-provider', {
  async provide(entityId: string): Promise<ProvidedWL<CompanyInfo>> {
    try {
      // Load company information from database
      const company = await loadCompanyFromDatabase(entityId)
      
      if (!company) {
        return {
          type: 'company',
          exists: false
        }
      }
      
      return {
        type: 'company',
        exists: true,
        entityId: company.id,
        fullName: company.fullName,
        shortName: company.shortName,
        slug: company.slug,
        description: company.description,
        resource: 'company-info'
      }
    } catch (error) {
      console.error(`Failed to load company info for entity ${entityId}:`, error)
      return {
        type: 'company',
        exists: null  // null indicates error
      }
    }
  }
}, (service) => async () => {
  // Initialize database connection
  await initializeDatabase()
  service.initialized = true
})

context.registerService(companyProvider)

// Database loading function
const loadCompanyFromDatabase = async (entityId: string): Promise<CompanyInfo | null> => {
  const query = 'SELECT * FROM companies WHERE entity_id = ?'
  const result = await database.query(query, [entityId])
  return result.rows[0] || null
}
```

### Custom Styles Provider

```typescript
import type { WlProvider } from '@owlmeans/server-wl'
import type { CustomStyles, ProvidedWL } from '@owlmeans/wled'

const stylesProvider = createService<WlProvider>('styles-provider', {
  async provide(entityId: string): Promise<ProvidedWL<CustomStyles>> {
    try {
      const styles = await loadStylesFromDatabase(entityId)
      
      if (!styles) {
        // Return default styles for unknown entities
        return {
          type: 'styles',
          exists: false,
          entityId,
          font: {
            fontFamily: 'Roboto',
            basicSize: 14
          },
          colors: {
            primaryColor: '#1976d2',
            secondaryColor: '#dc004e',
            primaryBackground: '#ffffff',
            secondaryBackground: '#f5f5f5'
          }
        }
      }
      
      return {
        type: 'styles',
        exists: true,
        ...styles
      }
    } catch (error) {
      console.error(`Failed to load styles for entity ${entityId}:`, error)
      return {
        type: 'styles',
        exists: null
      }
    }
  }
})

context.registerService(stylesProvider)
```

### Media Assets Provider

```typescript
import type { WlProvider } from '@owlmeans/server-wl'
import type { CustomMedia, ProvidedWL } from '@owlmeans/wled'

const mediaProvider = createService<WlProvider>('media-provider', {
  async provide(entityId: string): Promise<ProvidedWL<CustomMedia>> {
    try {
      const media = await loadMediaFromStorage(entityId)
      
      return {
        type: 'media',
        exists: media !== null,
        entityId,
        brand: {
          squareLogo: media?.squareLogo ? `/assets/${entityId}/square-logo.png` : undefined,
          wideLogo: media?.wideLogo ? `/assets/${entityId}/wide-logo.png` : undefined
        }
      }
    } catch (error) {
      console.error(`Failed to load media for entity ${entityId}:`, error)
      return {
        type: 'media',
        exists: null,
        entityId,
        brand: {}
      }
    }
  }
})

context.registerService(mediaProvider)

const loadMediaFromStorage = async (entityId: string) => {
  // Check if media files exist in storage
  const squareLogoExists = await fileExists(`/storage/assets/${entityId}/square-logo.png`)
  const wideLogoExists = await fileExists(`/storage/assets/${entityId}/wide-logo.png`)
  
  if (!squareLogoExists && !wideLogoExists) {
    return null
  }
  
  return {
    squareLogo: squareLogoExists,
    wideLogo: wideLogoExists
  }
}
```

### DNS-based Entity Identifier

```typescript
import type { WlEntityIdentifier } from '@owlmeans/server-wl'

const dnsIdentifier = createService<WlEntityIdentifier>('dns-identifier', {
  async identifyEntity(identifier: string): Promise<string | null> {
    try {
      // Handle different identifier patterns
      
      // Subdomain pattern: entity.example.com
      const subdomainMatch = identifier.match(/^([a-zA-Z0-9-]+)\.example\.com$/)
      if (subdomainMatch) {
        const entitySlug = subdomainMatch[1]
        return await resolveEntityBySlug(entitySlug)
      }
      
      // Custom domain pattern
      const customDomain = await resolveCustomDomain(identifier)
      if (customDomain) {
        return customDomain.entityId
      }
      
      // Direct entity ID
      if (await isValidEntityId(identifier)) {
        return identifier
      }
      
      return null
    } catch (error) {
      console.error(`Failed to identify entity for ${identifier}:`, error)
      return null
    }
  }
})

context.registerService(dnsIdentifier)

const resolveEntityBySlug = async (slug: string): Promise<string | null> => {
  const query = 'SELECT entity_id FROM entities WHERE slug = ?'
  const result = await database.query(query, [slug])
  return result.rows[0]?.entity_id || null
}

const resolveCustomDomain = async (domain: string) => {
  const query = 'SELECT entity_id FROM custom_domains WHERE domain = ?'
  const result = await database.query(query, [domain])
  return result.rows[0] || null
}
```

### Express.js Integration

```typescript
import express from 'express'
import { handleApiRequest } from '@owlmeans/server-api'

const app = express()

// Whitelabeling endpoint
app.get('/api/whitelabel/:entity', async (req, res) => {
  try {
    const result = await handleApiRequest(context, 'wl-provide', {
      entity: req.params.entity
    })
    
    res.json(result)
  } catch (error) {
    console.error('Whitelabeling API error:', error)
    res.status(500).json({ error: 'Failed to load whitelabeling data' })
  }
})

// Middleware for entity identification from hostname
app.use(async (req, res, next) => {
  const hostname = req.hostname
  const dnsService = context.service<WlEntityIdentifier>('dns-identifier')
  
  const entityId = await dnsService.identifyEntity(hostname)
  if (entityId) {
    req.entityId = entityId
  }
  
  next()
})

// Dynamic branding endpoint
app.get('/api/branding', async (req, res) => {
  const entityId = req.entityId || req.query.entity as string
  
  if (!entityId) {
    return res.status(400).json({ error: 'Entity not specified' })
  }
  
  try {
    const brandingData = await getAllWhitelabelingData(entityId)
    res.json(brandingData)
  } catch (error) {
    res.status(500).json({ error: 'Failed to load branding data' })
  }
})

const getAllWhitelabelingData = async (entityId: string) => {
  const providers = ['company-provider', 'styles-provider', 'media-provider']
  const data = {}
  
  for (const providerName of providers) {
    const provider = context.service<WlProvider>(providerName)
    data[providerName] = await provider.provide(entityId)
  }
  
  return data
}
```

### Caching Implementation

```typescript
import NodeCache from 'node-cache'

// Cache whitelabeling data for performance
const wlCache = new NodeCache({ stdTTL: 300 }) // 5 minutes TTL

const cachedProvider = createService<WlProvider>('cached-company-provider', {
  async provide(entityId: string): Promise<ProvidedWL<CompanyInfo>> {
    const cacheKey = `company:${entityId}`
    
    // Check cache first
    const cached = wlCache.get<ProvidedWL<CompanyInfo>>(cacheKey)
    if (cached) {
      return cached
    }
    
    // Load from database
    const data = await originalProvider.provide(entityId)
    
    // Cache only successful results
    if (data.exists === true) {
      wlCache.set(cacheKey, data)
    }
    
    return data
  }
})

// Cache invalidation on updates
const invalidateWhitelabelingCache = (entityId: string) => {
  const keys = wlCache.keys().filter(key => key.includes(entityId))
  keys.forEach(key => wlCache.del(key))
}
```

### Multi-tenant Configuration

```typescript
// Multi-tenant server configuration
const multiTenantConfig: Config = {
  service: 'multi-tenant-server',
  type: AppType.Backend,
  layer: Layer.System,
  wlProviders: [
    'company-provider',
    'styles-provider', 
    'media-provider',
    'urls-provider'
  ],
  wlIdentifierService: 'multi-tenant-dns'
}

// Advanced DNS identifier for multi-tenancy
const multiTenantDns = createService<WlEntityIdentifier>('multi-tenant-dns', {
  async identifyEntity(identifier: string): Promise<string | null> {
    // Priority order for entity identification:
    
    // 1. Custom domain (highest priority)
    const customEntity = await resolveCustomDomain(identifier)
    if (customEntity) return customEntity.entityId
    
    // 2. Subdomain pattern
    const subdomainEntity = await resolveSubdomain(identifier)
    if (subdomainEntity) return subdomainEntity
    
    // 3. Path-based routing (from referrer or context)
    const pathEntity = await resolveFromPath(identifier)
    if (pathEntity) return pathEntity
    
    // 4. Default entity for main domain
    if (identifier === 'example.com') {
      return 'default-entity'
    }
    
    return null
  }
})
```

## Error Handling

### Provider Error Handling

```typescript
import { ResilientError } from '@owlmeans/error'

// Custom whitelabeling errors
export class WhitelabelingProviderError extends ResilientError {
  constructor(provider: string, entityId: string, originalError: Error) {
    super('WL_PROVIDER_ERROR', `Whitelabeling provider ${provider} failed for entity ${entityId}`, {
      provider, entityId, originalError: originalError.message
    })
  }
}

export class EntityNotFoundError extends ResilientError {
  constructor(identifier: string) {
    super('WL_ENTITY_NOT_FOUND', `Entity not found for identifier: ${identifier}`, {
      identifier
    })
  }
}

// Error-resilient provider wrapper
const resilientProvider = (baseProvider: WlProvider, providerName: string): WlProvider => ({
  ...baseProvider,
  async provide(entityId: string): Promise<ProvidedWL> {
    try {
      return await baseProvider.provide(entityId)
    } catch (error) {
      console.error(`Provider ${providerName} failed for entity ${entityId}:`, error)
      
      // Return error state instead of throwing
      return {
        type: providerName,
        exists: null,  // null indicates error
        error: error.message
      }
    }
  }
})
```

### Graceful Degradation

```typescript
// Graceful degradation for missing providers
const handleWhitelabelingRequest = async (entityId: string) => {
  const results = {}
  const errors = []
  
  for (const providerName of config.wlProviders) {
    try {
      const provider = context.service<WlProvider>(providerName)
      results[providerName] = await provider.provide(entityId)
    } catch (error) {
      errors.push({ provider: providerName, error: error.message })
      
      // Provide default/fallback data
      results[providerName] = getDefaultWhitelabelingData(providerName, entityId)
    }
  }
  
  return {
    data: results,
    errors: errors.length > 0 ? errors : undefined,
    success: errors.length === 0
  }
}
```

## Security Considerations

### Access Control

```typescript
// Secure whitelabeling data access
const secureProvider = (baseProvider: WlProvider): WlProvider => ({
  ...baseProvider,
  async provide(entityId: string): Promise<ProvidedWL> {
    // Validate entity ID format
    if (!isValidEntityId(entityId)) {
      throw new Error('Invalid entity ID format')
    }
    
    // Check access permissions
    if (!await hasWhitelabelingAccess(entityId)) {
      throw new Error('Insufficient permissions for whitelabeling data')
    }
    
    return baseProvider.provide(entityId)
  }
})

const isValidEntityId = (entityId: string): boolean => {
  return /^[a-zA-Z0-9-_]{1,50}$/.test(entityId)
}

const hasWhitelabelingAccess = async (entityId: string): Promise<boolean> => {
  // Implement access control logic
  return true  // Placeholder
}
```

### Data Validation

```typescript
import { validate } from 'ajv'
import { CompanyInfoSchema, CustomStylesSchema } from '@owlmeans/wled'

// Validate whitelabeling data before serving
const validateWhitelabelingData = (data: any, type: string): boolean => {
  switch (type) {
    case 'company':
      return validate(CompanyInfoSchema, data)
    case 'styles':
      return validate(CustomStylesSchema, data)
    default:
      return true
  }
}
```

## Performance Optimization

### Connection Pooling

```typescript
// Database connection pooling for providers
import { Pool } from 'pg'

const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
})

const optimizedProvider = createService<WlProvider>('optimized-provider', {
  async provide(entityId: string): Promise<ProvidedWL> {
    const client = await dbPool.connect()
    try {
      const result = await client.query('SELECT * FROM whitelabeling WHERE entity_id = $1', [entityId])
      return formatWhitelabelingData(result.rows[0])
    } finally {
      client.release()
    }
  }
})
```

### Batch Loading

```typescript
// Batch loading for multiple entities
const batchProvider = createService<WlProvider>('batch-provider', {
  private cache: Map<string, Promise<ProvidedWL>> = new Map()
  
  async provide(entityId: string): Promise<ProvidedWL> {
    // Return existing promise if already loading
    if (this.cache.has(entityId)) {
      return this.cache.get(entityId)!
    }
    
    // Create new loading promise
    const promise = this.loadWhitelabelingData(entityId)
    this.cache.set(entityId, promise)
    
    // Clean up cache after resolution
    promise.finally(() => {
      setTimeout(() => this.cache.delete(entityId), 60000) // 1 minute cleanup
    })
    
    return promise
  },
  
  private async loadWhitelabelingData(entityId: string): Promise<ProvidedWL> {
    // Implementation
  }
})
```

## Integration with OwlMeans Ecosystem

### Context Integration
```typescript
import { makeServerContext } from '@owlmeans/server-context'

const context = makeServerContext(config)
const wlProvider = context.service<WlProvider>('company-provider')
```

### Module System Integration
```typescript
import { modules } from '@owlmeans/server-wl'

// Register whitelabeling modules
context.registerModules(modules)
```

### API Integration
```typescript
import { handleApiRequest } from '@owlmeans/server-api'

// Handle whitelabeling API requests
const result = await handleApiRequest(context, 'wl-provide', { entity: entityId })
```

## Best Practices

1. **Provider Design**: Keep providers focused and single-responsibility
2. **Caching Strategy**: Implement appropriate caching with TTL for performance
3. **Error Handling**: Provide graceful degradation for missing data
4. **Security**: Validate entity IDs and implement access controls
5. **Performance**: Use connection pooling and batch loading where appropriate
6. **Monitoring**: Log provider performance and error rates
7. **Fallbacks**: Always provide sensible defaults for missing configurations

## Related Packages

- **@owlmeans/wled**: Core whitelabeling types and modules
- **@owlmeans/client-wl**: Client-side whitelabeling implementation
- **@owlmeans/web-wl**: Web-specific whitelabeling implementation
- **@owlmeans/server-context**: Server context management
- **@owlmeans/server-module**: Server module system
- **@owlmeans/server-api**: Server API utilities

## TypeScript Support

This package is written in TypeScript and provides full type safety:

```typescript
import type { 
  WlProvider, 
  WlEntityIdentifier, 
  Config, 
  Context 
} from '@owlmeans/server-wl'

const provider: WlProvider = createService('my-provider', { /* ... */ })
const context: Context = makeServerContext(config)
```