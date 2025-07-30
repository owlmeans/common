# @owlmeans/web-wl

Web-specific whitelabeling functionality for OwlMeans Common Libraries. This package provides React components and browser-optimized services for implementing client-side whitelabeling, enabling web applications to dynamically customize branding, theming, and content based on entity-specific configurations.

## Overview

The `@owlmeans/web-wl` package serves as the web-specific implementation of the OwlMeans Whitelabeling Subsystem, designed for React-based frontend applications with focus on dynamic branding and user experience customization. It provides:

- **Web Whitelabeling Service**: Browser-optimized service for loading and caching whitelabeling data
- **React Components**: React components for whitelabel-aware UI elements
- **Caching Strategy**: Efficient client-side caching of whitelabeling configurations
- **API Integration**: Seamless integration with server-side whitelabeling providers
- **Performance Optimization**: Optimized loading and rendering of dynamic branding content

This package follows the OwlMeans "quadra" pattern as the **web** implementation, complementing:
- **@owlmeans/wled**: Common whitelabeling declarations and base functionality *(base package)*
- **@owlmeans/client-wl**: Base client whitelabeling functionality
- **@owlmeans/server-wl**: Server-side whitelabeling implementation
- **@owlmeans/web-wl**: Web browser whitelabeling implementation *(this package)*

## Installation

```bash
npm install @owlmeans/web-wl
```

## Dependencies

This package requires and integrates with:
- `@owlmeans/wled`: Core whitelabeling types and modules
- `@owlmeans/client`: Base client functionality
- `@owlmeans/client-module`: Client module system for API calls
- `@owlmeans/context`: Context management and service registration
- React: Peer dependency for web components

## Key Concepts

### Web Whitelabeling Service
Browser-optimized service that:
- **Loads Whitelabeling Data**: Fetches entity-specific branding from server APIs
- **Caches Configurations**: Implements client-side caching for performance
- **Extracts Data**: Provides convenient access to specific whitelabeling data types
- **Handles Errors**: Graceful error handling for failed whitelabeling requests

### React Component Integration
React components that automatically adapt to whitelabeling configurations:
- **Dynamic Branding**: Components that change appearance based on entity branding
- **Conditional Rendering**: Show/hide content based on whitelabeling rules
- **Theme Integration**: Automatic theme switching based on entity configurations
- **Performance**: Optimized rendering with minimal re-renders

### Client-side Caching
Efficient caching strategy:
- **Memory Caching**: In-memory cache for frequently accessed configurations
- **Cache Invalidation**: Smart cache invalidation strategies
- **Performance**: Reduced API calls and improved user experience

## API Reference

### Factory Functions

#### `makeWlService(alias?: string): WlWebService`

Creates a web whitelabeling service instance with caching capabilities.

```typescript
import { makeWlService } from '@owlmeans/web-wl'

const wlService = makeWlService('main-wl')
context.registerService(wlService)
```

**Parameters:**
- `alias`: Optional service alias (defaults to `DEFAULT_ALIAS`)

**Returns:** `WlWebService` - Web whitelabeling service instance

### Core Interfaces

#### `WlWebService`

Web-specific whitelabeling service interface.

```typescript
interface WlWebService extends InitializedService {
  load: (entityId: string) => Promise<ProvidedWLSet>
  extract: <T>(key: string, set: ProvidedWLSet) => T | undefined
}
```

**Methods:**

**`load(entityId: string): Promise<ProvidedWLSet>`**
- **Purpose**: Load complete whitelabeling data set for an entity
- **Parameters**: `entityId` - Entity identifier
- **Returns**: Promise resolving to whitelabeling data set
- **Behavior**: 
  - Checks cache first for existing data
  - Makes API call to server if not cached
  - Caches successful responses
  - Returns comprehensive whitelabeling data

**`extract<T>(key: string, set: ProvidedWLSet): T | undefined`**
- **Purpose**: Extract specific whitelabeling data type from a data set
- **Parameters**: 
  - `key` - Provider key (e.g., 'company-provider', 'styles-provider')
  - `set` - Whitelabeling data set
- **Returns**: Extracted data of type T or undefined if not found
- **Usage**: Convenient access to specific provider data

#### `ProvidedWLSet`

Collection of whitelabeling data from multiple providers.

```typescript
interface ProvidedWLSet<T extends Record<string, any> = Record<string, any>> {
  [providerKey: string]: ProvidedWL<T>
}
```

#### `Config`

Configuration interface for web whitelabeling.

```typescript
interface Config extends ClientConfig {
  // Inherits client configuration
  // Plus whitelabeling-specific web settings
}
```

#### `Context<C extends Config = Config>`

Web context interface with whitelabeling support.

```typescript
interface Context<C extends Config = Config> extends ClientContext<C> {
  // Inherits client context functionality
  // With typed configuration for whitelabeling
}
```

### React Components

#### Whitelabeling Provider Component

```typescript
interface WlProviderProps {
  entityId: string                    // Entity to load whitelabeling for
  children: React.ReactNode          // Child components
  fallback?: React.ReactNode         // Fallback content while loading
  onError?: (error: Error) => void   // Error handler
}

const WlProvider: FC<WlProviderProps> = (props) => { /* ... */ }
```

#### Whitelabel-aware Components

```typescript
interface WlBrandProps {
  entityId: string
  type: 'square' | 'wide'           // Logo type
  alt?: string                      // Alt text
  fallback?: React.ReactNode        // Fallback if no logo
}

const WlBrand: FC<WlBrandProps> = (props) => { /* ... */ }

interface WlThemeProps {
  entityId: string
  children: React.ReactNode
}

const WlTheme: FC<WlThemeProps> = (props) => { /* ... */ }
```

### Constants

#### `DEFAULT_ALIAS`

Default service alias for whitelabeling service.

```typescript
const DEFAULT_ALIAS = 'wl-web-service'
```

## Usage Examples

### Basic Web Whitelabeling Setup

```typescript
import { makeWlService } from '@owlmeans/web-wl'
import { makeWebContext } from '@owlmeans/web-client'

// Create web context
const context = makeWebContext(config)

// Create and register whitelabeling service
const wlService = makeWlService()
context.registerService(wlService)

// Initialize context
await context.configure().init()

// Load whitelabeling data for an entity
const entityId = 'company-123'
const whitelabelData = await wlService.load(entityId)

console.log('Whitelabeling data:', whitelabelData)
```

### React Component Integration

```typescript
import React, { useEffect, useState } from 'react'
import { useContext } from '@owlmeans/client'
import type { WlWebService, ProvidedWLSet } from '@owlmeans/web-wl'
import type { CompanyInfo, CustomStyles, CustomMedia } from '@owlmeans/wled'

interface WhitelabeledAppProps {
  entityId: string
  children: React.ReactNode
}

const WhitelabeledApp: React.FC<WhitelabeledAppProps> = ({ entityId, children }) => {
  const context = useContext()
  const [whitelabelData, setWhitelabelData] = useState<ProvidedWLSet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadWhitelabeling = async () => {
      try {
        setLoading(true)
        const wlService = context.service<WlWebService>('wl-web-service')
        const data = await wlService.load(entityId)
        setWhitelabelData(data)
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    loadWhitelabeling()
  }, [entityId, context])

  if (loading) {
    return <div>Loading branding...</div>
  }

  if (error) {
    return <div>Error loading branding: {error.message}</div>
  }

  if (!whitelabelData) {
    return <div>No branding data available</div>
  }

  // Extract specific whitelabeling data
  const wlService = context.service<WlWebService>('wl-web-service')
  const companyInfo = wlService.extract<CompanyInfo>('company-provider', whitelabelData)
  const customStyles = wlService.extract<CustomStyles>('styles-provider', whitelabelData)
  const customMedia = wlService.extract<CustomMedia>('media-provider', whitelabelData)

  return (
    <WhitelabelThemeProvider styles={customStyles}>
      <div className="whitelabeled-app">
        <header>
          {customMedia?.brand?.wideLogo && (
            <img 
              src={customMedia.brand.wideLogo} 
              alt={companyInfo?.fullName || 'Logo'} 
              className="company-logo"
            />
          )}
          <h1>{companyInfo?.fullName || 'Application'}</h1>
        </header>
        
        <main>
          {children}
        </main>
        
        <footer>
          <p>{companyInfo?.description}</p>
        </footer>
      </div>
    </WhitelabelThemeProvider>
  )
}
```

### Dynamic Theme Application

```typescript
import React, { useMemo } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import type { CustomStyles } from '@owlmeans/wled'

interface WhitelabelThemeProviderProps {
  styles?: CustomStyles
  children: React.ReactNode
}

const WhitelabelThemeProvider: React.FC<WhitelabelThemeProviderProps> = ({ 
  styles, 
  children 
}) => {
  const theme = useMemo(() => {
    const baseTheme = createTheme()

    if (!styles) {
      return baseTheme
    }

    return createTheme({
      ...baseTheme,
      palette: {
        ...baseTheme.palette,
        primary: {
          main: styles.colors.primaryColor,
          contrastText: '#ffffff'
        },
        secondary: {
          main: styles.colors.secondaryColor || baseTheme.palette.secondary.main
        },
        background: {
          default: styles.colors.primaryBackground || baseTheme.palette.background.default,
          paper: styles.colors.secondaryBackground || baseTheme.palette.background.paper
        }
      },
      typography: {
        ...baseTheme.typography,
        fontFamily: styles.font.fontFamily || baseTheme.typography.fontFamily,
        fontSize: styles.font.basicSize || baseTheme.typography.fontSize
      }
    })
  }, [styles])

  return (
    <ThemeProvider theme={theme}>
      {children}
    </ThemeProvider>
  )
}
```

### Whitelabel-aware Components

```typescript
import React from 'react'
import { useContext } from '@owlmeans/client'
import type { WlWebService } from '@owlmeans/web-wl'
import type { CustomMedia } from '@owlmeans/wled'

interface CompanyLogoProps {
  entityId: string
  type?: 'square' | 'wide'
  className?: string
  alt?: string
}

const CompanyLogo: React.FC<CompanyLogoProps> = ({ 
  entityId, 
  type = 'wide', 
  className,
  alt = 'Company Logo'
}) => {
  const context = useContext()
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    const loadLogo = async () => {
      try {
        const wlService = context.service<WlWebService>('wl-web-service')
        const whitelabelData = await wlService.load(entityId)
        const mediaData = wlService.extract<CustomMedia>('media-provider', whitelabelData)
        
        const logo = type === 'square' 
          ? mediaData?.brand?.squareLogo 
          : mediaData?.brand?.wideLogo
          
        setLogoUrl(logo || null)
      } catch (error) {
        console.error('Failed to load company logo:', error)
        setLogoUrl(null)
      }
    }

    loadLogo()
  }, [entityId, type, context])

  if (!logoUrl) {
    return (
      <div className={`company-logo-placeholder ${className || ''}`}>
        {alt}
      </div>
    )
  }

  return (
    <img 
      src={logoUrl} 
      alt={alt} 
      className={`company-logo ${className || ''}`}
    />
  )
}

// Usage
<CompanyLogo 
  entityId="company-123" 
  type="wide" 
  className="header-logo"
  alt="Acme Corporation"
/>
```

### Custom Hook for Whitelabeling

```typescript
import { useState, useEffect } from 'react'
import { useContext } from '@owlmeans/client'
import type { WlWebService, ProvidedWLSet } from '@owlmeans/web-wl'

interface UseWhitelabelResult<T = any> {
  data: T | null
  loading: boolean
  error: Error | null
  reload: () => void
}

export const useWhitelabel = <T = any>(
  entityId: string, 
  providerKey?: string
): UseWhitelabelResult<T> => {
  const context = useContext()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const wlService = context.service<WlWebService>('wl-web-service')
      const whitelabelData = await wlService.load(entityId)
      
      if (providerKey) {
        const extracted = wlService.extract<T>(providerKey, whitelabelData)
        setData(extracted || null)
      } else {
        setData(whitelabelData as T)
      }
    } catch (err) {
      setError(err as Error)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [entityId, providerKey])

  return {
    data,
    loading,
    error,
    reload: loadData
  }
}

// Usage examples
const CompanyInfoDisplay: React.FC<{ entityId: string }> = ({ entityId }) => {
  const { data: companyInfo, loading, error } = useWhitelabel<CompanyInfo>(
    entityId, 
    'company-provider'
  )

  if (loading) return <div>Loading company info...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!companyInfo) return <div>No company information available</div>

  return (
    <div>
      <h2>{companyInfo.fullName}</h2>
      <p>{companyInfo.description}</p>
    </div>
  )
}

const StylesDisplay: React.FC<{ entityId: string }> = ({ entityId }) => {
  const { data: styles, loading, error } = useWhitelabel<CustomStyles>(
    entityId, 
    'styles-provider'
  )

  if (loading || error || !styles) return null

  return (
    <div style={{
      backgroundColor: styles.colors.primaryBackground,
      color: styles.colors.primaryColor,
      fontFamily: styles.font.fontFamily
    }}>
      Custom styled content
    </div>
  )
}
```

### Multi-entity Whitelabeling

```typescript
import React, { useState } from 'react'
import { useWhitelabel } from './useWhitelabel'

const MultiEntityDemo: React.FC = () => {
  const [selectedEntity, setSelectedEntity] = useState('entity-1')
  
  const entities = [
    { id: 'entity-1', name: 'Company A' },
    { id: 'entity-2', name: 'Company B' },
    { id: 'entity-3', name: 'Company C' }
  ]

  const { data: whitelabelData, loading } = useWhitelabel(selectedEntity)

  return (
    <div>
      <select 
        value={selectedEntity} 
        onChange={(e) => setSelectedEntity(e.target.value)}
      >
        {entities.map(entity => (
          <option key={entity.id} value={entity.id}>
            {entity.name}
          </option>
        ))}
      </select>

      {loading ? (
        <div>Loading whitelabel data...</div>
      ) : (
        <WhitelabeledApp entityId={selectedEntity}>
          <div>Content for {selectedEntity}</div>
        </WhitelabeledApp>
      )}
    </div>
  )
}
```

## Caching Strategy

### Memory Cache Implementation

```typescript
// Internal caching implementation (simplified)
class WhitelabelCache {
  private cache = new Map<string, ProvidedWLSet>()
  private ttl = 5 * 60 * 1000 // 5 minutes
  private timestamps = new Map<string, number>()

  set(entityId: string, data: ProvidedWLSet): void {
    this.cache.set(entityId, data)
    this.timestamps.set(entityId, Date.now())
  }

  get(entityId: string): ProvidedWLSet | undefined {
    const timestamp = this.timestamps.get(entityId)
    if (timestamp && Date.now() - timestamp > this.ttl) {
      this.cache.delete(entityId)
      this.timestamps.delete(entityId)
      return undefined
    }
    return this.cache.get(entityId)
  }

  clear(): void {
    this.cache.clear()
    this.timestamps.clear()
  }

  invalidate(entityId: string): void {
    this.cache.delete(entityId)
    this.timestamps.delete(entityId)
  }
}
```

### Cache Management

```typescript
// Utility functions for cache management
export const clearWhitelabelCache = (context: Context) => {
  const wlService = context.service<WlWebService>('wl-web-service')
  // Cache clearing would be implemented in the service
}

export const preloadWhitelabeling = async (
  context: Context, 
  entityIds: string[]
) => {
  const wlService = context.service<WlWebService>('wl-web-service')
  
  // Preload whitelabeling data for multiple entities
  await Promise.all(
    entityIds.map(entityId => wlService.load(entityId))
  )
}
```

## Error Handling

### Graceful Error Handling

```typescript
const ErrorBoundaryWhitelabel: React.FC<{ 
  children: React.ReactNode
  fallback?: React.ReactNode 
}> = ({ children, fallback }) => {
  return (
    <ErrorBoundary
      fallback={fallback || <div>Failed to load branding</div>}
      onError={(error) => {
        console.error('Whitelabeling error:', error)
        // Report to error tracking service
      }}
    >
      {children}
    </ErrorBoundary>
  )
}

// Usage
<ErrorBoundaryWhitelabel fallback={<DefaultBranding />}>
  <WhitelabeledApp entityId={entityId}>
    <AppContent />
  </WhitelabeledApp>
</ErrorBoundaryWhitelabel>
```

## Performance Optimization

### Lazy Loading and Code Splitting

```typescript
import React, { lazy, Suspense } from 'react'

// Lazy load whitelabel components
const WhitelabeledDashboard = lazy(() => import('./WhitelabeledDashboard'))

const App: React.FC = () => (
  <Suspense fallback={<div>Loading...</div>}>
    <WhitelabeledDashboard entityId="company-123" />
  </Suspense>
)
```

### Memoization

```typescript
import React, { memo, useMemo } from 'react'

const MemoizedWhitelabelComponent = memo<{ entityId: string }>(({ entityId }) => {
  const { data } = useWhitelabel(entityId, 'company-provider')
  
  const memoizedContent = useMemo(() => {
    if (!data) return null
    
    return (
      <div>
        <h1>{data.fullName}</h1>
        <p>{data.description}</p>
      </div>
    )
  }, [data])

  return memoizedContent
})
```

## Integration with OwlMeans Ecosystem

### Context Integration
```typescript
import { makeWebContext } from '@owlmeans/web-client'

const context = makeWebContext(config)
const wlService = context.service<WlWebService>('wl-web-service')
```

### Module System Integration
```typescript
import { modules } from '@owlmeans/web-wl'

// Modules are automatically integrated via service
context.registerService(wlService)
```

### Client Integration
```typescript
import { useContext } from '@owlmeans/client'

const wlService = useContext().service<WlWebService>('wl-web-service')
```

## Best Practices

1. **Caching**: Implement appropriate caching strategies for performance
2. **Error Handling**: Provide graceful fallbacks for failed whitelabeling requests
3. **Performance**: Use memoization and lazy loading for large applications
4. **User Experience**: Show loading states during whitelabeling data fetch
5. **Accessibility**: Ensure dynamic content maintains accessibility standards
6. **Testing**: Test with different entity configurations and error scenarios

## Related Packages

- **@owlmeans/wled**: Core whitelabeling types and modules
- **@owlmeans/client-wl**: Base client whitelabeling functionality
- **@owlmeans/server-wl**: Server-side whitelabeling implementation
- **@owlmeans/client**: Base client functionality
- **@owlmeans/client-module**: Client module system for API calls

## TypeScript Support

This package is written in TypeScript and provides full type safety:

```typescript
import type { 
  WlWebService,
  ProvidedWLSet,
  Config,
  Context
} from '@owlmeans/web-wl'

const wlService: WlWebService = makeWlService()
const context: Context = makeWebContext(config)
```