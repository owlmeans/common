# @owlmeans/client-wl

Client-side whitelabeling functionality for OwlMeans Common Libraries. This package provides the foundational client-side infrastructure for implementing whitelabeling capabilities, enabling applications to manage and apply entity-specific branding, theming, and content customization.

## Overview

The `@owlmeans/client-wl` package serves as the base client-side implementation of the OwlMeans Whitelabeling Subsystem, designed for fullstack applications with focus on dynamic brand customization and user experience personalization. It provides:

- **Client Whitelabeling Foundation**: Base infrastructure for client-side whitelabeling
- **Entity-based Customization**: Support for entity-specific branding and configuration
- **Cross-platform Compatibility**: Works across web, mobile, and desktop client applications
- **Cache Management**: Client-side caching of whitelabeling configurations
- **API Integration**: Standardized interface for communicating with whitelabeling providers
- **Type Safety**: Comprehensive TypeScript interfaces for whitelabeling data

This package follows the OwlMeans "quadra" pattern as the **client** implementation, complementing:
- **@owlmeans/wled**: Common whitelabeling declarations and base functionality *(base package)*
- **@owlmeans/client-wl**: Base client whitelabeling functionality *(this package)*
- **@owlmeans/web-wl**: Web browser whitelabeling implementation
- **@owlmeans/server-wl**: Server-side whitelabeling implementation

## Installation

```bash
npm install @owlmeans/client-wl
```

## Dependencies

This package requires and integrates with:
- `@owlmeans/wled`: Core whitelabeling types and modules
- `@owlmeans/context`: Context management and service registration
- `@owlmeans/client`: Base client functionality and services

## Key Concepts

### Client-side Whitelabeling
Provides the foundational infrastructure for implementing whitelabeling on the client side:
- **Data Loading**: Standardized interface for loading whitelabeling data
- **Caching Strategy**: Efficient caching of whitelabeling configurations
- **Error Handling**: Robust error handling for failed whitelabeling requests
- **Cross-platform**: Works consistently across different client platforms

### Entity-based Customization
Enables dynamic customization based on entity identification:
- **Entity Resolution**: Map domains, subdomains, or custom identifiers to entities
- **Configuration Loading**: Load entity-specific branding and configuration data
- **Dynamic Application**: Apply configurations at runtime without deployment
- **Fallback Handling**: Graceful degradation when entity data is unavailable

### Whitelabeling Data Types
Supports various types of whitelabeling data:
- **Company Information**: Business details, names, descriptions
- **Visual Styles**: Colors, fonts, themes, and visual branding
- **Media Assets**: Logos, images, and brand assets
- **Custom URLs**: Entity-specific URL configurations
- **Extended Data**: Custom whitelabeling data types as needed

## API Reference

*Note: This package provides foundational types and interfaces. Specific implementations are available in platform-specific packages like `@owlmeans/web-wl`.*

### Core Interfaces

#### `ClientWhitelabelService`

Base interface for client-side whitelabeling services.

```typescript
interface ClientWhitelabelService extends InitializedService {
  loadWhitelabeling: (entityId: string) => Promise<ProvidedWLSet>
  getEntityBranding: (entityId: string) => Promise<EntityBranding | null>
  getCachedData: (entityId: string) => ProvidedWLSet | null
  clearCache: (entityId?: string) => void
}
```

**Methods:**

**`loadWhitelabeling(entityId: string): Promise<ProvidedWLSet>`**
- **Purpose**: Load complete whitelabeling data set for an entity
- **Parameters**: `entityId` - Unique entity identifier
- **Returns**: Promise resolving to whitelabeling data from all providers
- **Behavior**: Fetches data from server, applies caching strategy

**`getEntityBranding(entityId: string): Promise<EntityBranding | null>`**
- **Purpose**: Get consolidated branding information for an entity
- **Parameters**: `entityId` - Entity identifier
- **Returns**: Promise resolving to entity branding data or null
- **Behavior**: Combines data from multiple providers into unified branding object

**`getCachedData(entityId: string): ProvidedWLSet | null`**
- **Purpose**: Retrieve cached whitelabeling data if available
- **Parameters**: `entityId` - Entity identifier
- **Returns**: Cached data or null if not cached/expired
- **Behavior**: Checks cache without making network requests

**`clearCache(entityId?: string): void`**
- **Purpose**: Clear cached whitelabeling data
- **Parameters**: `entityId` - Optional specific entity to clear (clears all if omitted)
- **Behavior**: Removes cached data, forcing fresh loads on next request

#### `EntityBranding`

Consolidated branding information for an entity.

```typescript
interface EntityBranding {
  entityId: string
  companyInfo?: CompanyInfo
  styles?: CustomStyles
  media?: CustomMedia
  urls?: CustomUrls
  metadata?: Record<string, any>
  lastUpdated: Date
}
```

#### `WhitelabelConfig`

Configuration interface for whitelabeling services.

```typescript
interface WhitelabelConfig {
  apiEndpoint?: string              // Whitelabeling API endpoint
  cacheTimeout?: number             // Cache timeout in milliseconds
  retryAttempts?: number            // Number of retry attempts for failed requests
  fallbackEntityId?: string         // Fallback entity ID for missing configurations
  enableCaching?: boolean           // Enable/disable client-side caching
}
```

### Utility Functions

#### Entity Resolution

```typescript
// Utility functions for entity identification
export const resolveEntityFromDomain = (domain: string): string | null => {
  // Extract entity from domain/subdomain patterns
  const subdomainMatch = domain.match(/^([a-zA-Z0-9-]+)\./)
  return subdomainMatch ? subdomainMatch[1] : null
}

export const resolveEntityFromPath = (path: string): string | null => {
  // Extract entity from URL path patterns
  const pathMatch = path.match(/^\/([a-zA-Z0-9-]+)\//)
  return pathMatch ? pathMatch[1] : null
}

export const resolveEntityFromQuery = (queryParams: URLSearchParams): string | null => {
  // Extract entity from query parameters
  return queryParams.get('entity') || queryParams.get('tenant')
}
```

#### Data Transformation

```typescript
// Utility functions for data transformation
export const transformWhitelabelData = (
  rawData: ProvidedWLSet
): EntityBranding => {
  return {
    entityId: rawData.entityId,
    companyInfo: extractCompanyInfo(rawData),
    styles: extractCustomStyles(rawData),
    media: extractCustomMedia(rawData),
    urls: extractCustomUrls(rawData),
    metadata: extractMetadata(rawData),
    lastUpdated: new Date()
  }
}

export const mergeWhitelabelData = (
  ...dataSets: Partial<EntityBranding>[]
): EntityBranding => {
  // Merge multiple whitelabeling data sets with priority
  return dataSets.reduce((merged, data) => ({
    ...merged,
    ...data,
    metadata: { ...merged.metadata, ...data.metadata }
  }), {} as EntityBranding)
}
```

### Error Types

#### Whitelabeling-specific Errors

```typescript
export class WhitelabelingError extends Error {
  constructor(
    message: string,
    public entityId: string,
    public code: string,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'WhitelabelingError'
  }
}

export class EntityNotFoundError extends WhitelabelingError {
  constructor(entityId: string) {
    super(`Entity not found: ${entityId}`, entityId, 'ENTITY_NOT_FOUND')
  }
}

export class WhitelabelingDataError extends WhitelabelingError {
  constructor(entityId: string, dataType: string, originalError?: Error) {
    super(
      `Failed to load ${dataType} data for entity: ${entityId}`,
      entityId,
      'DATA_LOAD_ERROR',
      originalError
    )
  }
}
```

## Usage Examples

### Basic Service Implementation

```typescript
import { createService } from '@owlmeans/context'
import type { ClientWhitelabelService, EntityBranding, ProvidedWLSet } from '@owlmeans/client-wl'

// Basic implementation example (platform-specific packages provide concrete implementations)
const createWhitelabelService = (alias: string = 'whitelabel-service'): ClientWhitelabelService => {
  const cache = new Map<string, { data: ProvidedWLSet; timestamp: number }>()
  const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  return createService<ClientWhitelabelService>(alias, {
    async loadWhitelabeling(entityId: string): Promise<ProvidedWLSet> {
      // Check cache first
      const cached = this.getCachedData(entityId)
      if (cached) {
        return cached
      }

      try {
        // Make API request (implementation would vary by platform)
        const response = await fetch(`/api/whitelabel/${entityId}`)
        if (!response.ok) {
          throw new EntityNotFoundError(entityId)
        }

        const data: ProvidedWLSet = await response.json()
        
        // Cache the result
        cache.set(entityId, {
          data,
          timestamp: Date.now()
        })

        return data
      } catch (error) {
        throw new WhitelabelingDataError(entityId, 'complete', error as Error)
      }
    },

    async getEntityBranding(entityId: string): Promise<EntityBranding | null> {
      try {
        const whitelabelData = await this.loadWhitelabeling(entityId)
        return transformWhitelabelData(whitelabelData)
      } catch (error) {
        console.error('Failed to get entity branding:', error)
        return null
      }
    },

    getCachedData(entityId: string): ProvidedWLSet | null {
      const cached = cache.get(entityId)
      if (!cached) return null

      // Check if cache is still valid
      if (Date.now() - cached.timestamp > CACHE_TTL) {
        cache.delete(entityId)
        return null
      }

      return cached.data
    },

    clearCache(entityId?: string): void {
      if (entityId) {
        cache.delete(entityId)
      } else {
        cache.clear()
      }
    }
  }, (service) => async () => {
    // Service initialization
    service.initialized = true
  })
}

// Register with context
const context = makeClientContext(config)
const whitelabelService = createWhitelabelService()
context.registerService(whitelabelService)
```

### Entity Resolution Strategies

```typescript
// Multiple strategies for entity resolution
class EntityResolver {
  private strategies: Array<(context: any) => string | null> = []

  constructor() {
    // Add resolution strategies in priority order
    this.addStrategy(this.resolveFromUrl)
    this.addStrategy(this.resolveFromStorage)
    this.addStrategy(this.resolveFromConfig)
  }

  addStrategy(strategy: (context: any) => string | null): void {
    this.strategies.push(strategy)
  }

  resolve(context: any): string | null {
    for (const strategy of this.strategies) {
      const entityId = strategy(context)
      if (entityId) {
        return entityId
      }
    }
    return null
  }

  private resolveFromUrl(context: any): string | null {
    if (typeof window === 'undefined') return null
    
    const url = new URL(window.location.href)
    
    // Try subdomain
    const subdomain = resolveEntityFromDomain(url.hostname)
    if (subdomain && subdomain !== 'www') {
      return subdomain
    }
    
    // Try path
    const pathEntity = resolveEntityFromPath(url.pathname)
    if (pathEntity) {
      return pathEntity
    }
    
    // Try query parameters
    return resolveEntityFromQuery(url.searchParams)
  }

  private resolveFromStorage(context: any): string | null {
    if (typeof localStorage === 'undefined') return null
    
    return localStorage.getItem('selectedEntity')
  }

  private resolveFromConfig(context: any): string | null {
    return context.cfg?.defaultEntityId || null
  }
}

// Usage
const resolver = new EntityResolver()
const entityId = resolver.resolve(context)

if (entityId) {
  const whitelabelService = context.service<ClientWhitelabelService>('whitelabel-service')
  const branding = await whitelabelService.getEntityBranding(entityId)
}
```

### Multi-entity Management

```typescript
// Service for managing multiple entities
class MultiEntityWhitelabelManager {
  private whitelabelService: ClientWhitelabelService
  private activeEntityId: string | null = null
  private listeners: Array<(entityId: string, branding: EntityBranding | null) => void> = []

  constructor(whitelabelService: ClientWhitelabelService) {
    this.whitelabelService = whitelabelService
  }

  async setActiveEntity(entityId: string): Promise<void> {
    if (this.activeEntityId === entityId) return

    this.activeEntityId = entityId
    
    try {
      const branding = await this.whitelabelService.getEntityBranding(entityId)
      this.notifyListeners(entityId, branding)
    } catch (error) {
      console.error('Failed to load branding for entity:', entityId, error)
      this.notifyListeners(entityId, null)
    }
  }

  getActiveEntity(): string | null {
    return this.activeEntityId
  }

  async getActiveBranding(): Promise<EntityBranding | null> {
    if (!this.activeEntityId) return null
    
    return this.whitelabelService.getEntityBranding(this.activeEntityId)
  }

  addListener(callback: (entityId: string, branding: EntityBranding | null) => void): void {
    this.listeners.push(callback)
  }

  removeListener(callback: (entityId: string, branding: EntityBranding | null) => void): void {
    const index = this.listeners.indexOf(callback)
    if (index >= 0) {
      this.listeners.splice(index, 1)
    }
  }

  private notifyListeners(entityId: string, branding: EntityBranding | null): void {
    this.listeners.forEach(listener => {
      try {
        listener(entityId, branding)
      } catch (error) {
        console.error('Error in whitelabel listener:', error)
      }
    })
  }

  async preloadEntities(entityIds: string[]): Promise<void> {
    await Promise.all(
      entityIds.map(async (entityId) => {
        try {
          await this.whitelabelService.loadWhitelabeling(entityId)
        } catch (error) {
          console.warn(`Failed to preload entity ${entityId}:`, error)
        }
      })
    )
  }

  clearCache(entityId?: string): void {
    this.whitelabelService.clearCache(entityId)
  }
}

// Usage
const manager = new MultiEntityWhitelabelManager(whitelabelService)

// Listen for entity changes
manager.addListener((entityId, branding) => {
  console.log('Entity changed:', entityId, branding)
  // Update UI with new branding
  if (branding) {
    applyBrandingToApp(branding)
  }
})

// Set active entity
await manager.setActiveEntity('company-123')

// Preload multiple entities for better performance
await manager.preloadEntities(['company-123', 'company-456', 'company-789'])
```

### Configuration and Setup

```typescript
// Configuration for whitelabeling
interface AppConfigWithWhitelabel extends ClientConfig {
  whitelabel: WhitelabelConfig
}

const appConfig: AppConfigWithWhitelabel = {
  service: 'my-app',
  type: AppType.Frontend,
  layer: Layer.Service,
  whitelabel: {
    apiEndpoint: '/api/whitelabel',
    cacheTimeout: 5 * 60 * 1000, // 5 minutes
    retryAttempts: 3,
    fallbackEntityId: 'default',
    enableCaching: true
  }
}

// Initialize with whitelabeling support
const context = makeClientContext(appConfig)

// Register whitelabeling service
const whitelabelService = createWhitelabelService('main-whitelabel')
context.registerService(whitelabelService)

// Create entity manager
const entityManager = new MultiEntityWhitelabelManager(whitelabelService)

// Auto-resolve entity on startup
const entityResolver = new EntityResolver()
const initialEntity = entityResolver.resolve(context)

if (initialEntity) {
  await entityManager.setActiveEntity(initialEntity)
}
```

### Data Validation and Sanitization

```typescript
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { CompanyInfoSchema, CustomStylesSchema, CustomMediaSchema } from '@owlmeans/wled'

// Validation service for whitelabeling data
class WhitelabelDataValidator {
  private ajv: Ajv

  constructor() {
    this.ajv = new Ajv({ allErrors: true })
    addFormats(this.ajv)
    
    // Add schemas
    this.ajv.addSchema(CompanyInfoSchema, 'CompanyInfo')
    this.ajv.addSchema(CustomStylesSchema, 'CustomStyles')
    this.ajv.addSchema(CustomMediaSchema, 'CustomMedia')
  }

  validateCompanyInfo(data: any): { valid: boolean; errors?: string[] } {
    const validate = this.ajv.getSchema('CompanyInfo')
    const valid = validate!(data)
    
    return {
      valid,
      errors: valid ? undefined : validate!.errors?.map(err => err.message) || []
    }
  }

  validateCustomStyles(data: any): { valid: boolean; errors?: string[] } {
    const validate = this.ajv.getSchema('CustomStyles')
    const valid = validate!(data)
    
    return {
      valid,
      errors: valid ? undefined : validate!.errors?.map(err => err.message) || []
    }
  }

  sanitizeWhitelabelData(data: ProvidedWLSet): ProvidedWLSet {
    const sanitized: ProvidedWLSet = {}
    
    Object.keys(data).forEach(key => {
      const providerData = data[key]
      
      try {
        // Validate based on data type
        switch (providerData.type) {
          case 'company':
            const companyValidation = this.validateCompanyInfo(providerData)
            if (companyValidation.valid) {
              sanitized[key] = providerData
            } else {
              console.warn(`Invalid company data for ${key}:`, companyValidation.errors)
            }
            break
            
          case 'styles':
            const stylesValidation = this.validateCustomStyles(providerData)
            if (stylesValidation.valid) {
              sanitized[key] = providerData
            } else {
              console.warn(`Invalid styles data for ${key}:`, stylesValidation.errors)
            }
            break
            
          default:
            // Include other data types without validation
            sanitized[key] = providerData
        }
      } catch (error) {
        console.error(`Error validating data for ${key}:`, error)
      }
    })
    
    return sanitized
  }
}

// Usage with service
const validator = new WhitelabelDataValidator()

const validatedService = createService<ClientWhitelabelService>('validated-whitelabel', {
  async loadWhitelabeling(entityId: string): Promise<ProvidedWLSet> {
    const rawData = await baseService.loadWhitelabeling(entityId)
    return validator.sanitizeWhitelabelData(rawData)
  }
  // ... other methods
})
```

## Integration Patterns

### Context Integration
```typescript
import { makeClientContext } from '@owlmeans/client-context'

const context = makeClientContext(config)
const whitelabelService = context.service<ClientWhitelabelService>('whitelabel-service')
```

### Module System Integration
```typescript
// Whitelabeling typically integrates at the service level
// Modules are handled by platform-specific implementations
```

### Error Handling Integration
```typescript
import { ResilientError } from '@owlmeans/error'

// Integrate with OwlMeans error handling
try {
  const branding = await whitelabelService.getEntityBranding(entityId)
} catch (error) {
  if (error instanceof EntityNotFoundError) {
    // Handle entity not found
    console.warn('Entity not found, using defaults')
  } else {
    throw new ResilientError('WHITELABEL_ERROR', 'Failed to load whitelabeling', {
      originalError: error.message,
      entityId
    })
  }
}
```

## Best Practices

1. **Caching Strategy**: Implement efficient caching with appropriate TTL values
2. **Error Handling**: Provide graceful fallbacks for missing or invalid data
3. **Validation**: Always validate whitelabeling data before application
4. **Performance**: Use lazy loading and preloading strategies appropriately
5. **Entity Resolution**: Implement multiple entity resolution strategies with fallbacks
6. **Type Safety**: Leverage TypeScript for compile-time validation
7. **Testing**: Test with various entity configurations and error scenarios

## Related Packages

- **@owlmeans/wled**: Core whitelabeling types and modules
- **@owlmeans/web-wl**: Web browser whitelabeling implementation
- **@owlmeans/server-wl**: Server-side whitelabeling implementation
- **@owlmeans/context**: Context management and service registration
- **@owlmeans/client**: Base client functionality and services

## TypeScript Support

This package is written in TypeScript and provides full type safety:

```typescript
import type { 
  ClientWhitelabelService,
  EntityBranding,
  ProvidedWLSet,
  WhitelabelConfig
} from '@owlmeans/client-wl'

const service: ClientWhitelabelService = createWhitelabelService()
const branding: EntityBranding = await service.getEntityBranding(entityId)
```