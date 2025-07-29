# @owlmeans/web-client

A complete React DOM client library for OwlMeans Common applications. This package provides a web-specific implementation that extends `@owlmeans/client` with DOM-specific functionality, including rendering utilities, web database integration, and browser-specific services.

## Overview

The `@owlmeans/web-client` package is the web DOM implementation of the OwlMeans client system. It provides:

- **DOM Rendering**: Direct integration with ReactDOM for web applications
- **Web Database**: Browser-based database integration with IndexedDB/localStorage
- **Authentication Integration**: Pre-configured web authentication services
- **Browser Services**: Web-specific services and utilities
- **I18n Integration**: Internationalization support for web applications
- **Router Integration**: Web-specific routing with React Router DOM
- **Context Management**: Enhanced context with web-specific capabilities

This package is part of the OwlMeans client implementation family:
- **@owlmeans/client**: Base React client library
- **@owlmeans/web-client**: Web DOM implementation *(this package)*
- **@owlmeans/native-client**: React Native implementation

## Installation

```bash
npm install @owlmeans/web-client react react-dom react-router-dom
```

## Core Concepts

### Web-First Architecture
This library is specifically designed for web browsers and provides DOM-specific functionality that isn't available in other environments.

### Enhanced Context
The web context extends the base client context with web-specific services like database storage, authentication, and browser utilities.

### Integrated Rendering
Provides seamless integration with ReactDOM including support for both client-side rendering and server-side hydration.

## API Reference

### Factory Functions

#### `makeContext<C, T>(cfg: C): T`

Creates a web-specific application context with all necessary web services pre-configured.

```typescript
import { makeContext } from '@owlmeans/web-client'
import { AppType, Layer } from '@owlmeans/context'

const context = makeContext({
  service: 'my-web-app',
  type: AppType.Frontend,
  layer: Layer.Service,
  ready: false,
  services: {},
  brand: { name: 'My Web App' },
  trusted: []
})
```

**Parameters:**
- `cfg`: AppConfig - Configuration object for the web context

**Returns:** Enhanced AppContext with web-specific capabilities

**Pre-configured Services:**
- Web authentication service
- Web database service  
- Client resource service
- Primary host extraction

#### `render(node: ReactNode, opts?: RenderOptions): void`

Renders a React application to the DOM with web-specific optimizations.

```typescript
import { render } from '@owlmeans/web-client'
import { App } from '@owlmeans/client'

render(
  <App context={context}>
    <MyApplication />
  </App>,
  {
    domId: 'root',
    onReady: true,
    hydrate: false,
    debug: true
  }
)
```

**Parameters:**
- `node`: ReactNode - The React element to render
- `opts`: RenderOptions (optional) - Rendering configuration

### Core Interfaces

#### `AppContext<C extends AppConfig>`

Web-specific application context that extends ClientContext with authentication capabilities.

```typescript
interface AppContext<C extends AppConfig = AppConfig> extends ClientContext<C>,
  AuthServiceAppend {
  
  // Inherited from ClientContext:
  // - Configuration management
  // - State management
  // - Modal service
  // - Debug service
  // - Module and service registration
  // - Resource management
  
  // Enhanced with authentication:
  auth(): AuthService
}
```

#### `AppConfig`

Configuration interface for web applications (extends ClientConfig).

```typescript
interface AppConfig extends ClientConfig {
  // Inherits all ClientConfig properties
  // Can be extended with web-specific configuration
}
```

#### `RenderOptions`

Configuration options for DOM rendering.

```typescript
interface RenderOptions {
  domId?: string        // Target DOM element ID (default: 'root')
  onReady?: boolean     // Wait for DOMContentLoaded (default: true)
  hydrate?: boolean     // Use hydration for SSR (default: false)
  debug?: boolean       // Enable debug logging (default: false)
}
```

### React Hooks

#### `useContext<C, T>(): T`

Web-specific context hook that provides strongly typed access to the AppContext.

```typescript
import { useContext } from '@owlmeans/web-client'

function MyWebComponent() {
  const context = useContext()
  
  // Access web-specific services
  const authService = context.auth()
  const dbService = context.service('web-db')
  
  // Access base client services
  const stateResource = context.state()
  const modalService = context.modal()
  
  return <div>Web Component</div>
}
```

### Web Services

#### Web Database Integration

The package automatically configures web database services:

```typescript
// Access web database service
const dbService = context.service('web-db')

// Store data in browser
await dbService.store('user-preferences', {
  theme: 'dark',
  language: 'en'
})

// Retrieve data from browser
const preferences = await dbService.retrieve('user-preferences')
```

#### Authentication Service

Pre-configured web authentication with persistent storage:

```typescript
// Access authentication service
const authService = context.auth()

// Authentication persists across browser sessions
const isAuthenticated = await authService.authenticated()
```

### Helper Functions

#### `extractPrimaryHost<C, T>(context: T): void`

Extracts and configures the primary host from the current browser location.

**Purpose**: Automatically configures the application's primary host based on the browser's current URL

**Usage**: Called automatically during context creation

### Constants

#### `DEFAULT_ROOT`
Default DOM element ID for rendering (`'root'`).

### Components and Modules

The package provides web-specific components and modules:

#### I18n Integration
```typescript
import { i18nModules } from '@owlmeans/web-client'

// Pre-configured internationalization modules
context.registerModules(i18nModules)
```

#### Authentication Components
```typescript
import { authComponents } from '@owlmeans/web-client'

// Web-specific authentication components
// Available through the component system
```

## Usage Examples

### Complete Web Application Setup

```typescript
import React from 'react'
import { makeContext, render } from '@owlmeans/web-client'
import { App } from '@owlmeans/client'
import { createBrowserRouter } from 'react-router-dom'
import { AppType, Layer } from '@owlmeans/context'

// Create web application context
const context = makeContext({
  service: 'my-web-app',
  type: AppType.Frontend,
  layer: Layer.Service,
  ready: false,
  services: {},
  brand: { 
    name: 'My Web App',
    version: '1.0.0'
  },
  trusted: ['api.myapp.com']
})

// Register application modules
context.registerModules(appModules)

// Configure and initialize
await context.configure().init()

// Create router provider
const routerProvider = (routes) => createBrowserRouter(routes)

// Define the application
function MyWebApp() {
  return (
    <App context={context} provide={routerProvider}>
      <header>My Web Application</header>
      <main>
        {/* Application content will be rendered here by the router */}
      </main>
    </App>
  )
}

// Render to DOM
render(<MyWebApp />, {
  domId: 'root',
  debug: process.env.NODE_ENV === 'development'
})
```

### Server-Side Rendering (SSR) with Hydration

```typescript
import { makeContext, render } from '@owlmeans/web-client'
import { App } from '@owlmeans/client'

// Create context with SSR data
const context = makeContext({
  ...config,
  ssrData: window.__SSR_DATA__ // Data from server
})

// Pre-populate context with SSR data
await context.configure().init()

// Hydrate the server-rendered HTML
render(
  <App context={context}>
    <MyApplication />
  </App>,
  {
    hydrate: true, // Enable hydration
    onReady: false // Don't wait for DOMContentLoaded
  }
)
```

### Authentication-Enabled Web App

```typescript
import { makeContext, useContext } from '@owlmeans/web-client'
import { modules as authModules } from '@owlmeans/client-auth'

// Create context
const context = makeContext(config)

// Register authentication modules
context.registerModules(authModules)

// Initialize
await context.configure().init()

function AuthenticatedApp() {
  const context = useContext()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  
  useEffect(() => {
    const checkAuth = async () => {
      const authService = context.auth()
      const token = await authService.authenticated()
      setIsAuthenticated(token != null)
    }
    
    checkAuth()
  }, [])
  
  if (!isAuthenticated) {
    return <LoginPage />
  }
  
  return <Dashboard />
}

// Render with authentication
render(<AuthenticatedApp />)
```

### Web Database Usage

```typescript
import { useContext } from '@owlmeans/web-client'
import { useEffect, useState } from 'react'

function DataPersistentComponent() {
  const context = useContext()
  const [data, setData] = useState(null)
  
  useEffect(() => {
    const loadData = async () => {
      // Access web database through context
      const dbService = context.service('web-db')
      
      // Load persisted data
      const savedData = await dbService.retrieve('component-data')
      setData(savedData || { count: 0 })
    }
    
    loadData()
  }, [])
  
  const saveData = async (newData) => {
    const dbService = context.service('web-db')
    await dbService.store('component-data', newData)
    setData(newData)
  }
  
  const increment = () => {
    const newData = { count: data.count + 1 }
    saveData(newData)
  }
  
  return (
    <div>
      <p>Count: {data?.count || 0}</p>
      <button onClick={increment}>Increment</button>
    </div>
  )
}
```

### Custom Rendering Options

```typescript
import { render } from '@owlmeans/web-client'

// Render to custom DOM element
render(<MyApp />, {
  domId: 'custom-root',
  debug: true
})

// Immediate rendering (don't wait for DOMContentLoaded)
render(<MyApp />, {
  onReady: false
})

// Server-side hydration
render(<MyApp />, {
  hydrate: true,
  onReady: false
})
```

### Advanced Context Configuration

```typescript
import { makeContext } from '@owlmeans/web-client'

const context = makeContext({
  service: 'advanced-app',
  type: AppType.Frontend,
  layer: Layer.Service,
  ready: false,
  
  // Web-specific configuration
  services: {
    database: { 
      type: 'indexeddb',
      name: 'my-app-db'
    }
  },
  
  // Branding
  brand: {
    name: 'Advanced Web App',
    version: '2.1.0',
    logo: '/assets/logo.png'
  },
  
  // Trusted hosts for API calls
  trusted: [
    'api.myapp.com',
    'cdn.myapp.com'
  ],
  
  // Debug configuration
  debug: {
    all: process.env.NODE_ENV === 'development',
    routing: true,
    auth: true
  }
})

// Additional service registration
context.registerService(customWebService)

// Module registration with web-specific modules
context.registerModules([
  ...appModules,
  ...webSpecificModules
])
```

### Integration with Internationalization

```typescript
import { makeContext } from '@owlmeans/web-client'
import { addI18nApp } from '@owlmeans/i18n'

// Add web-specific translations
addI18nApp('en', 'web-common', {
  'button.close': 'Close',
  'message.loading': 'Loading...',
  'error.network': 'Network error occurred'
})

const context = makeContext(config)

// Access i18n through context
function I18nComponent() {
  const context = useContext()
  const i18nService = context.service('i18n')
  
  return (
    <div>
      <button>{i18nService.t('button.close')}</button>
    </div>
  )
}
```

## Browser Compatibility

The package is designed for modern web browsers with support for:

- **ES2020+**: Modern JavaScript features
- **IndexedDB**: For local database storage
- **LocalStorage**: For simple key-value storage
- **DOM API**: Standard DOM manipulation
- **Fetch API**: For HTTP requests
- **WebCrypto**: For cryptographic operations (if used)

## Performance Optimizations

1. **Lazy Loading**: Components and services are loaded on demand
2. **Efficient Rendering**: Optimized ReactDOM integration
3. **Database Caching**: Intelligent caching of web database operations
4. **Bundle Splitting**: Designed for code splitting compatibility
5. **SSR Ready**: Full server-side rendering support

## Error Handling

Web-specific error handling and reporting:

```typescript
import { OwlMeansError } from '@owlmeans/error'

// Web-specific error boundary
class WebErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    const context = this.props.context
    const debugService = context.debug()
    
    // Log web-specific error details
    debugService.error('web-error', 'Browser error', {
      error: error.message,
      stack: error.stack,
      userAgent: navigator.userAgent,
      url: window.location.href
    })
  }
}
```

## Security Considerations

1. **Trusted Hosts**: Configure trusted hosts to prevent CSRF attacks
2. **Authentication Storage**: Secure token storage in browser
3. **XSS Protection**: Built-in protection against cross-site scripting
4. **Content Security Policy**: Compatible with CSP headers
5. **HTTPS Only**: Designed for secure HTTPS environments

## Integration with Other Packages

### Client Ecosystem Integration
```typescript
// Authentication
import { makeAuthService } from '@owlmeans/client-auth'

// Resources
import { makeResourceService } from '@owlmeans/client-resource'

// Internationalization
import { makeI18nService } from '@owlmeans/client-i18n'

// Database
import { WebDbService } from '@owlmeans/web-db'
```

### Build Tool Integration
```typescript
// Webpack configuration
module.exports = {
  resolve: {
    alias: {
      '@owlmeans/web-client': path.resolve(__dirname, 'node_modules/@owlmeans/web-client')
    }
  }
}

// Vite configuration
export default {
  resolve: {
    alias: {
      '@owlmeans/web-client': path.resolve(__dirname, 'node_modules/@owlmeans/web-client')
    }
  }
}
```

## Best Practices

1. **Single Context**: Use one web context per application
2. **Proper Hydration**: Use hydration mode for SSR applications
3. **Error Boundaries**: Implement web-specific error boundaries
4. **Performance Monitoring**: Monitor web-specific performance metrics
5. **Responsive Design**: Ensure proper responsive behavior
6. **Accessibility**: Follow web accessibility guidelines
7. **SEO Optimization**: Use SSR for better search engine optimization

## Dependencies

This package depends on:
- `@owlmeans/client` - Base React client library
- `@owlmeans/client-context` - Client context management
- `@owlmeans/client-auth` - Client authentication
- `@owlmeans/web-db` - Web database integration
- `@owlmeans/client-i18n` - Client internationalization
- `react` - React library (peer dependency)
- `react-dom` - ReactDOM library (peer dependency)
- `react-router-dom` - React Router DOM (peer dependency)

## Related Packages

- [`@owlmeans/client`](../client) - Base React client library
- [`@owlmeans/native-client`](../native-client) - React Native implementation
- [`@owlmeans/web-db`](../web-db) - Web database implementation
- [`@owlmeans/client-auth`](../client-auth) - Client authentication
- [`@owlmeans/client-i18n`](../client-i18n) - Client internationalization