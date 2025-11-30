# @owlmeans/client

A comprehensive React client library for OwlMeans Common applications. This package provides a complete foundation for building React-based frontend applications with integrated routing, state management, context handling, and component utilities.

## Overview

The `@owlmeans/client` package extends the base `@owlmeans/client-context` package with React-specific functionality. It provides:

- **React Integration**: Complete React integration with hooks and context providers
- **Routing System**: Advanced routing with React Router integration and module-based navigation
- **Application Framework**: App component and router setup for complete applications
- **State Management**: Integrated state management with resource-based persistence
- **Context Management**: Enhanced client context with React-specific capabilities
- **UI Components**: Core UI components and utilities for React applications
- **Navigation Utilities**: Programmatic navigation and router interaction
- **Debug Services**: Development and debugging utilities

This package is designed for environment-agnostic React applications and can be extended with platform-specific implementations:
- **@owlmeans/web-client**: Web DOM-specific React implementation
- **@owlmeans/native-client**: React Native-specific implementation

## Installation

```bash
npm install @owlmeans/client react
```

## Core Concepts

### Application Architecture
The library follows the OwlMeans pattern where modules represent URL units that can be transformed into React routes with associated components.

### Context-Driven Development
All functionality is built around a central context that manages services, resources, modules, and application state.

### Module-Based Routing
Routes are generated from modules, providing a unified approach to both frontend routing and backend API endpoints.

## API Reference

### Factory Functions

#### `makeClientContext<C, T>(cfg: C): T`

Creates an enhanced client context with React-specific capabilities.

```typescript
import { makeClientContext } from '@owlmeans/client'
import { AppType, Layer } from '@owlmeans/context'

const context = makeClientContext({
  service: 'my-app',
  type: AppType.Frontend,
  layer: Layer.Service,
  ready: false,
  services: {},
  brand: {},
  trusted: []
})
```

**Parameters:**
- `cfg`: ClientConfig - Configuration object for the context

**Returns:** Enhanced ClientContext with React-specific capabilities

### Core Interfaces

#### `ClientContext<C extends ClientConfig>`

Enhanced client context interface that extends BasicClientContext with React-specific functionality.

```typescript
interface ClientContext<C extends ClientConfig = ClientConfig> extends BasicClientContext<C>,
  ConfigResourceAppend,
  StateResourceAppend,
  ModalServiceAppend,
  DebugServiceAppend {
  
  // React-specific methods
  registerRerenderer(listener: CallableFunction): () => void
  rerender(): void
}
```

**Enhanced Capabilities:**
- **Config Resource**: Configuration management and persistence
- **State Resource**: Application state management
- **Modal Service**: Modal dialog management
- **Debug Service**: Development and debugging utilities
- **Rerender System**: Component rerendering coordination

#### `RouterModel`

Interface for defining application routing structure.

```typescript
interface RouterModel {
  routes: RouteObject[]
  resolve<C, T>(context: T): Promise<RouteObject[]>
}
```

#### `Navigator`

Interface for programmatic navigation throughout the application.

```typescript
interface Navigator {
  _navigate: NavigateFunction
  navigate<R>(module: ClientModule, request?: R): Promise<void>
  go<R>(alias: string, request?: R): Promise<void>
  back(): Promise<void>
  pressBack(): () => void
}
```

#### `NavRequest<T>`

Interface for navigation requests with additional client-specific options.

```typescript
interface NavRequest<T = Record<string, any>> extends Partial<AbstractRequest<T>> {
  replace?: boolean    // Replace current route in history
  silent?: boolean     // Navigate without triggering side effects
}
```

#### `ModuleContextParams<T>`

Parameters passed to route components when rendered.

```typescript
interface ModuleContextParams<T = {}> {
  alias: string                    // Module alias
  params: AbstractRequest<T>['params']  // Route parameters
  path: string                     // Current path
  context: ClientContext           // Application context
}
```

#### `RoutedComponent<ExtraProps>`

Function component interface for route-rendered components.

```typescript
interface RoutedComponent<ExtraProps = {}> extends FC<PropsWithChildren<ModuleContextParams & ExtraProps>> {
}
```

### React Components

#### `<App />`

Main application component that provides context and routing.

```typescript
interface AppProps extends PropsWithChildren {
  context: ClientContext<any>
  provide?: RouterProvider | RemixRouter
}

const App: FC<AppProps>
```

**Usage:**
```typescript
import { App, makeClientContext } from '@owlmeans/client'

const context = makeClientContext(config)

function MyApp() {
  return (
    <App context={context} provide={routerProvider}>
      <div>Application content</div>
    </App>
  )
}
```

#### `<Router />`

Internal router component that manages React Router integration.

```typescript
interface RouterProps {
  provide: RouterProvider | RemixRouter
}

const Router: FC<RouterProps>
```

**Note:** Usually used internally by the App component.

### React Hooks

#### `useContext(): ClientContext`

Hook to access the application context from any component.

```typescript
import { useContext } from '@owlmeans/client'

function MyComponent() {
  const context = useContext()
  
  // Access services
  const authService = context.service('auth')
  
  // Access resources
  const stateResource = context.state()
  
  return <div>Component content</div>
}
```

### Context Management

#### Enhanced Context Methods

The ClientContext provides additional methods beyond the basic context:

**`registerRerenderer(listener: CallableFunction): () => void`**
- **Purpose**: Register a listener for application-wide rerenders
- **Usage**: Component synchronization and global state updates
- **Returns**: Cleanup function to unregister the listener

**`rerender(): void`**
- **Purpose**: Trigger a rerender of all registered components
- **Usage**: Global state changes that require UI updates

```typescript
const context = makeClientContext(config)

// Register for rerenders
const cleanup = context.registerRerenderer(() => {
  console.log('Application rerendered')
})

// Trigger rerender
context.rerender()

// Cleanup when done
cleanup()
```

### Navigation System

#### Router Utilities

**`buildModuleTree(context: ClientContext): ModuleTree`**
Builds a tree structure from registered modules for routing.

**`initializeRouter(context: ClientContext): Promise<RouteObject[]>`**
Initializes the router with routes generated from modules.

**`createRouteRenderer(module: ClientModule): ComponentType`**
Creates a React component that renders the appropriate component for a module.

#### Navigation Methods

```typescript
import { navigate, go, back } from '@owlmeans/client'

// Navigate to a specific module
await navigate(userModule, { params: { id: '123' } })

// Navigate by alias
await go('user-profile', { params: { id: '123' } })

// Go back in history
await back()
```

### State Management

The package integrates with `@owlmeans/state` for application state management:

```typescript
// Access state resource
const stateResource = context.state()

// Save application state
await stateResource.save({
  id: 'app-state',
  data: { theme: 'dark', language: 'en' }
})

// Load application state
const state = await stateResource.load('app-state')
```

### Configuration Management

The package integrates with `@owlmeans/config` for configuration management:

```typescript
// Access config resource
const configResource = context.config()

// Load configuration
const config = await configResource.load('app-config')
```

### Modal Management

Built-in modal service for managing dialogs:

```typescript
// Access modal service
const modalService = context.modal()

// Show modal
modalService.show('confirm-dialog', { 
  title: 'Confirm Action',
  message: 'Are you sure?' 
})

// Hide modal
modalService.hide('confirm-dialog')
```

### Debug Service

Development and debugging utilities:

```typescript
// Access debug service  
const debugService = context.debug()

// Log debug information
debugService.log('module-routing', 'Route resolved', { alias: 'users' })

// Enable debug mode
debugService.enable('all')
```

### Utility Functions

#### Route Creation

**`createModuleRoute(module: ClientModule, component: ComponentType): RouteObject`**
Creates a React Router route object from a module and component.

**`resolveModulePath(module: ClientModule): string`**
Resolves the final path for a module considering parent relationships.

#### Component Utilities

**`withModuleContext(component: ComponentType): RoutedComponent`**
Higher-order component that injects module context into components.

```typescript
import { withModuleContext } from '@owlmeans/client'

const UserProfile = withModuleContext(({ alias, params, context }) => {
  const userId = params.id
  return <div>User Profile for {userId}</div>
})
```

## Usage Examples

### Basic Application Setup

```typescript
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App, makeClientContext } from '@owlmeans/client'
import { createBrowserRouter } from 'react-router-dom'
import { AppType, Layer } from '@owlmeans/context'

// Create application context
const context = makeClientContext({
  service: 'my-app',
  type: AppType.Frontend,
  layer: Layer.Service,
  ready: false,
  services: {},
  brand: { name: 'My App' },
  trusted: []
})

// Register modules and services
context.registerModules(modules)
context.registerService(authService)

// Configure and initialize
await context.configure().init()

// Create router provider
const routerProvider = (routes) => createBrowserRouter(routes)

// Render application
const root = createRoot(document.getElementById('root'))
root.render(
  <App context={context} provide={routerProvider}>
    <header>My Application</header>
  </App>
)
```

### Module-Based Routing

```typescript
import { module, filter, body } from '@owlmeans/module'
import { route } from '@owlmeans/route'
import { UserProfile, UserList } from './components'

// Define modules with associated components
const userListModule = module(route('users', '/users'), {
  component: UserList
})

const userProfileModule = module(
  route('user-profile', '/users/:id'),
  filter(params({
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id']
  })),
  { component: UserProfile }
)

// Register modules
context.registerModules([userListModule, userProfileModule])
```

### Programmatic Navigation

```typescript
import { useContext, navigate, go } from '@owlmeans/client'

function NavigationExample() {
  const context = useContext()
  
  const handleUserClick = async (userId: string) => {
    const userModule = context.module('user-profile')
    await navigate(userModule, { 
      params: { id: userId },
      replace: false 
    })
  }
  
  const handleBackClick = async () => {
    await go('users')
  }
  
  return (
    <div>
      <button onClick={() => handleUserClick('123')}>
        View User
      </button>
      <button onClick={handleBackClick}>
        Back to Users
      </button>
    </div>
  )
}
```

### Context Usage in Components

```typescript
import { useContext } from '@owlmeans/client'

function UserDashboard() {
  const context = useContext()
  
  // Access services
  const authService = context.service('auth')
  const apiService = context.service('api')
  
  // Access resources
  const stateResource = context.state()
  const configResource = context.config()
  
  // Access utilities
  const modalService = context.modal()
  const debugService = context.debug()
  
  const handleSaveState = async () => {
    await stateResource.save({
      id: 'dashboard-state',
      data: { collapsed: false, activeTab: 'users' }
    })
  }
  
  const handleShowModal = () => {
    modalService.show('settings-modal')
  }
  
  return (
    <div>
      <h1>Dashboard</h1>
      <button onClick={handleSaveState}>Save State</button>
      <button onClick={handleShowModal}>Settings</button>
    </div>
  )
}
```

### Advanced Router Configuration

```typescript
import { createBrowserRouter } from 'react-router-dom'
import { initializeRouter } from '@owlmeans/client'

// Custom router provider with error handling
const customRouterProvider = async (routes) => {
  return createBrowserRouter(routes, {
    future: {
      v7_normalizeFormMethod: true
    }
  })
}

// Use with App component
<App context={context} provide={customRouterProvider}>
  <ApplicationShell />
</App>
```

### Component with Module Context

```typescript
import { RoutedComponent } from '@owlmeans/client'

const ProductDetails: RoutedComponent<{ extraProp: string }> = ({ 
  alias, 
  params, 
  context, 
  extraProp 
}) => {
  const productId = params.id
  const debugService = context.debug()
  
  debugService.log('product-view', 'Viewing product', { productId })
  
  return (
    <div>
      <h1>Product {productId}</h1>
      <p>Extra prop: {extraProp}</p>
    </div>
  )
}
```

### State and Configuration Management

```typescript
import { useContext } from '@owlmeans/client'
import { useEffect, useState } from 'react'

function AppSettings() {
  const context = useContext()
  const [settings, setSettings] = useState(null)
  
  useEffect(() => {
    const loadSettings = async () => {
      const stateResource = context.state()
      const saved = await stateResource.load('app-settings')
      setSettings(saved?.data || { theme: 'light' })
    }
    
    loadSettings()
  }, [])
  
  const saveSettings = async (newSettings) => {
    const stateResource = context.state()
    await stateResource.save({
      id: 'app-settings',
      data: newSettings
    })
    setSettings(newSettings)
    context.rerender() // Trigger global rerender if needed
  }
  
  return (
    <div>
      <h2>Settings</h2>
      {settings && (
        <div>
          <label>
            Theme:
            <select 
              value={settings.theme} 
              onChange={(e) => saveSettings({ ...settings, theme: e.target.value })}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      )}
    </div>
  )
}
```

## Error Handling

The package integrates with the OwlMeans error system:

```typescript
import { OwlMeansError } from '@owlmeans/error'

// Error boundaries for React components
class AppErrorBoundary extends React.Component {
  state = { hasError: false, error: null }
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  
  componentDidCatch(error) {
    const context = this.props.context
    const debugService = context.debug()
    debugService.error('app-error', 'Application error', error)
  }
  
  render() {
    if (this.state.hasError) {
      return <div>Something went wrong</div>
    }
    return this.props.children
  }
}
```

## Performance Considerations

1. **Context Optimization**: The context system is optimized for minimal re-renders
2. **Lazy Loading**: Components and modules can be loaded on demand
3. **State Persistence**: Application state is efficiently managed and persisted
4. **Route Optimization**: Routes are generated efficiently from module definitions

## Integration with Other Packages

### Client Ecosystem
```typescript
// Client authentication
import { makeAuthService } from '@owlmeans/client-auth'

// Client resources
import { makeResourceService } from '@owlmeans/client-resource'

// Client modules
import { modules } from '@owlmeans/client-module'
```

### Platform-Specific Extensions
```typescript
// Web DOM implementation
import { makeWebClient } from '@owlmeans/web-client'

// React Native implementation  
import { makeNativeClient } from '@owlmeans/native-client'
```

## Best Practices

1. **Single Context**: Use one primary context per application
2. **Module Organization**: Organize modules hierarchically for better route structure
3. **State Management**: Use the integrated state resource for application state
4. **Error Boundaries**: Implement error boundaries for robust error handling
5. **Performance**: Leverage lazy loading for large applications
6. **Context Access**: Use the provided hook rather than direct context access

## Dependencies

This package depends on:
- `@owlmeans/client-context` - Basic client context functionality
- `@owlmeans/client-module` - Client-side module system
- `@owlmeans/client-resource` - Client-side resource management
- `@owlmeans/config` - Configuration management
- `@owlmeans/context` - Core context system
- `@owlmeans/state` - State management
- `react` - React library (peer dependency)

## Related Packages

- [`@owlmeans/web-client`](../web-client) - Web DOM-specific React implementation
- [`@owlmeans/native-client`](../native-client) - React Native implementation
- [`@owlmeans/client-context`](../client-context) - Basic client context
- [`@owlmeans/client-module`](../client-module) - Client module system
- [`@owlmeans/client-auth`](../client-auth) - Client authentication