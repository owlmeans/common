# @owlmeans/native-client

React Native client implementation for OwlMeans Common applications. This package provides a comprehensive React Native client framework with authentication, routing, permissions, database integration, and native-specific functionality for building mobile applications with OwlMeans.

## Overview

The `@owlmeans/native-client` package extends the OwlMeans client ecosystem for React Native applications, offering:

- **Native Context Management**: React Native-specific application context with mobile optimizations
- **Router Integration**: React Router Native integration with OwlMeans module system
- **Authentication Support**: Built-in authentication service integration for mobile apps
- **Permission Management**: Native permission handling for device capabilities
- **Database Integration**: Local database support through native database services
- **Component Library**: React Native components following OwlMeans patterns
- **Environment Configuration**: Multi-environment support for development and production

This package follows the OwlMeans "quadra" pattern as a native implementation extending the client packages for React Native mobile applications.

## Installation

```bash
npm install @owlmeans/native-client
```

## Dependencies

This package requires React Native and integrates with:
- `@owlmeans/client`: Base client framework
- `@owlmeans/client-context`: Client context management
- `@owlmeans/client-auth`: Client authentication
- `@owlmeans/native-db`: Native database services
- `react-native`: React Native framework
- `react-router-native`: React Router for React Native

## Peer Dependencies

```json
{
  "react": "*",
  "react-native": "*",
  "react-native-permissions": "*"
}
```

## Core Concepts

### Native App Context

A specialized application context that extends client context with React Native-specific functionality including permissions, local database, and native environment handling.

### Permission Management

Built-in permission service for handling device permissions (camera, location, storage, etc.) with a consistent API across iOS and Android.

### Native Database

Integration with local database services for offline capability and local data persistence.

### Environment Configuration

Support for multiple deployment environments with different service configurations.

## API Reference

### Types

#### `AppConfig`
Configuration interface for native applications extending ClientConfig.

```typescript
interface AppConfig extends ClientConfig {
  environments?: { [env: string]: Partial<CommonServiceRoute> }  // Environment-specific service routes
  defaultEnv?: string                                            // Default environment
  debug: ClientConfig['debug'] & {
    webView?: boolean                                            // WebView debugging
  }
}
```

#### `AppContext<C>`
Main native application context interface.

```typescript
interface AppContext<C extends AppConfig = AppConfig> extends ClientContext<C>, AuthServiceAppend, PermissionsAppend {
  // Inherits all client context functionality plus:
  // - Authentication service access
  // - Permission service access
}
```

#### `PermissionService`
Service interface for native permission management.

```typescript
interface PermissionService extends InitializedService, PermissionServicePlugin {
  plugin: PermissionServicePlugin
  settings: () => Promise<void>  // Opens device settings for permission management
}
```

#### `PermissionsAppend`
Interface for contexts that provide permission service access.

```typescript
interface PermissionsAppend {
  permissions: () => PermissionService
}
```

### Factory Functions

#### `makeContext<C, T>(cfg: C): T`

Creates a native application context with React Native-specific services and integrations.

**Parameters:**
- `cfg`: Native application configuration

**Returns:** AppContext instance

**Features:**
- Automatic authentication service integration
- Native database service setup
- Permission service registration
- API configuration middleware
- Environment-specific service routing

**Example:**
```typescript
import { makeContext } from '@owlmeans/native-client'

const appConfig = {
  service: 'mobile-app',
  type: AppType.Frontend,
  layer: Layer.User,
  services: {
    'api': {
      alias: 'api',
      route: {
        alias: 'api',
        path: '/api',
        service: 'backend'
      }
    }
  },
  environments: {
    development: {
      route: { path: 'http://localhost:3000/api' }
    },
    production: {
      route: { path: 'https://api.example.com/api' }
    }
  },
  defaultEnv: 'development'
}

const context = makeContext(appConfig)
await context.configure().init()
```

#### `useContext<C, T>(): T`

React hook for accessing the native application context.

**Returns:** AppContext instance

**Example:**
```typescript
import React from 'react'
import { useContext } from '@owlmeans/native-client'

const MyComponent = () => {
  const context = useContext()
  const authService = context.auth()
  const permissionService = context.permissions()
  
  return (
    // Component JSX
  )
}
```

### Router Integration

#### `provide: RouterProvider`

Router provider function for React Router Native integration.

**Features:**
- Memory router for React Native navigation
- Error boundary integration
- Route object transformation for native compatibility

**Example:**
```typescript
import { provide } from '@owlmeans/native-client'

// Used internally by OwlMeans routing system
const router = provide(routes)
```

### Services

#### Authentication Service

Automatically integrated authentication service for mobile apps:

```typescript
const context = makeContext(config)
const authService = context.auth()

// Authenticate user
await authService.authenticate(credentials)

// Check authentication status
const isAuthenticated = await authService.isAuthenticated()
```

#### Permission Service

Native permission management:

```typescript
const permissionService = context.permissions()

// Request camera permission
const cameraPermission = await permissionService.request('camera')

// Check permission status
const hasLocation = await permissionService.check('location')

// Open settings for permission management
await permissionService.settings()
```

## Usage Examples

### Basic Native App Setup

```typescript
import React from 'react'
import { makeContext } from '@owlmeans/native-client'
import { AppRegistry } from 'react-native'

const config = {
  service: 'my-mobile-app',
  services: {
    'backend': {
      alias: 'backend',
      route: {
        alias: 'api',
        path: '/api',
        service: 'backend'
      }
    }
  },
  environments: {
    dev: { route: { path: 'http://10.0.2.2:3000/api' } },
    prod: { route: { path: 'https://api.myapp.com/api' } }
  },
  defaultEnv: __DEV__ ? 'dev' : 'prod'
}

const App = () => {
  const [context, setContext] = React.useState(null)
  
  React.useEffect(() => {
    const initContext = async () => {
      const ctx = makeContext(config)
      await ctx.configure().init()
      setContext(ctx)
    }
    initContext()
  }, [])
  
  if (!context) {
    return <LoadingScreen />
  }
  
  return (
    <AppContextProvider context={context}>
      <MainApp />
    </AppContextProvider>
  )
}

AppRegistry.registerComponent('MyApp', () => App)
```

### Authentication Flow

```typescript
import React from 'react'
import { useContext } from '@owlmeans/native-client'

const LoginScreen = () => {
  const context = useContext()
  const authService = context.auth()
  const [loading, setLoading] = React.useState(false)
  
  const handleLogin = async (credentials) => {
    setLoading(true)
    try {
      await authService.authenticate(credentials)
      // Navigate to main app
    } catch (error) {
      // Handle authentication error
    } finally {
      setLoading(false)
    }
  }
  
  return (
    // Login form JSX
  )
}
```

### Permission Handling

```typescript
import React from 'react'
import { useContext } from '@owlmeans/native-client'

const CameraScreen = () => {
  const context = useContext()
  const permissionService = context.permissions()
  const [hasPermission, setHasPermission] = React.useState(false)
  
  React.useEffect(() => {
    const checkCameraPermission = async () => {
      const status = await permissionService.check('camera')
      if (status === 'denied') {
        const result = await permissionService.request('camera')
        setHasPermission(result === 'granted')
      } else {
        setHasPermission(status === 'granted')
      }
    }
    checkCameraPermission()
  }, [])
  
  const openSettings = async () => {
    await permissionService.settings()
  }
  
  if (!hasPermission) {
    return (
      <View>
        <Text>Camera permission required</Text>
        <Button title="Open Settings" onPress={openSettings} />
      </View>
    )
  }
  
  return <CameraComponent />
}
```

### Database Integration

```typescript
import React from 'react'
import { useContext } from '@owlmeans/native-client'

const DataScreen = () => {
  const context = useContext()
  const [data, setData] = React.useState([])
  
  React.useEffect(() => {
    const loadData = async () => {
      try {
        // Access native database through context
        const dbService = context.service('native-db')
        const result = await dbService.query('SELECT * FROM users')
        setData(result)
      } catch (error) {
        console.error('Database error:', error)
      }
    }
    loadData()
  }, [])
  
  return (
    // Data display JSX
  )
}
```

### Environment-Specific Configuration

```typescript
const config = {
  service: 'multi-env-app',
  services: {
    'api': {
      alias: 'api',
      route: {
        alias: 'api',
        path: '/api',
        service: 'backend'
      }
    }
  },
  environments: {
    development: {
      route: { 
        path: 'http://localhost:3000/api',
        headers: { 'X-Debug': 'true' }
      }
    },
    staging: {
      route: { 
        path: 'https://staging-api.example.com/api',
        headers: { 'X-Environment': 'staging' }
      }
    },
    production: {
      route: { 
        path: 'https://api.example.com/api',
        headers: { 'X-Environment': 'production' }
      }
    }
  },
  defaultEnv: 'development',
  debug: {
    all: __DEV__,
    webView: __DEV__
  }
}

const context = makeContext(config)
// Context automatically uses environment-specific configuration
```

### Component Integration

```typescript
import React from 'react'
import { useContext } from '@owlmeans/native-client'
import { View, Text, Button } from 'react-native'

const ProfileScreen = () => {
  const context = useContext()
  const authService = context.auth()
  const apiClient = context.service('api-client')
  const [profile, setProfile] = React.useState(null)
  
  React.useEffect(() => {
    const loadProfile = async () => {
      try {
        const user = authService.user()
        const apiRoute = context.serviceRoute('api')
        const response = await apiClient.call(apiRoute, `users/${user.userId}`)
        setProfile(response)
      } catch (error) {
        console.error('Failed to load profile:', error)
      }
    }
    loadProfile()
  }, [])
  
  const handleLogout = async () => {
    await authService.logout()
    // Navigate to login screen
  }
  
  return (
    <View>
      <Text>Welcome, {profile?.name}</Text>
      <Button title="Logout" onPress={handleLogout} />
    </View>
  )
}
```

## Components

The package includes React Native components following OwlMeans patterns:

```typescript
import { /* components */ } from '@owlmeans/native-client'
```

Common components may include:
- Authentication forms
- Permission request dialogs
- Loading indicators
- Error boundaries
- Navigation components

## Helpers

Utility functions for native app development:

```typescript
import { /* helpers */ } from '@owlmeans/native-client'
```

Helper functions may include:
- Environment detection
- Permission utilities
- Database helpers
- Navigation utilities

## Configuration

### Environment Variables

The package supports environment-specific configuration:

```typescript
// .env.development
API_URL=http://localhost:3000/api
DEBUG_WEBVIEW=true

// .env.production  
API_URL=https://api.example.com/api
DEBUG_WEBVIEW=false
```

### Permission Configuration

Configure required permissions in your app configuration:

```typescript
const config = {
  // ... other config
  permissions: {
    required: ['camera', 'location'],
    optional: ['notifications', 'contacts']
  }
}
```

## Error Handling

Handle native-specific errors:

```typescript
try {
  const permission = await permissionService.request('camera')
} catch (error) {
  if (error.code === 'PERMISSION_DENIED') {
    // Handle permission denial
  } else if (error.code === 'PERMISSION_BLOCKED') {
    // Handle permission blocked (user must use settings)
  }
}
```

## Integration with OwlMeans Ecosystem

This package integrates with:

- **@owlmeans/client**: Base client functionality
- **@owlmeans/client-auth**: Authentication services
- **@owlmeans/native-db**: Local database services
- **@owlmeans/client-context**: Context management
- **@owlmeans/route**: Routing and navigation

## Best Practices

1. **Handle permissions gracefully** with user-friendly messages
2. **Use environment-specific configurations** for different deployment stages
3. **Implement offline capabilities** using local database services
4. **Handle authentication state** across app lifecycles
5. **Provide loading states** for async operations
6. **Follow React Native performance guidelines**

## Related Packages

- **@owlmeans/web-client**: Web client implementation
- **@owlmeans/client**: Base client functionality
- **@owlmeans/native-db**: Native database services
- **@owlmeans/client-auth**: Client authentication

## Platform Support

- **iOS**: Full support with iOS-specific optimizations
- **Android**: Full support with Android-specific optimizations
- **Cross-platform**: Shared business logic and API communication

## License

See the LICENSE file in the repository root for license information.