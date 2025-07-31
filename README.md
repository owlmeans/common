# OwlMeans Common — Fullstack TypeScript Framework

**OwlMeans Common** is a comprehensive, security-first TypeScript framework designed for building scalable fullstack applications with modern microservices and microclients architecture. Built around the concept of unified modules, context-driven dependency injection, and "quadra" pattern implementations, it provides everything needed to develop secure, maintainable applications from authentication to UI components.

## 🎯 **Framework Principles & Goals**

### **Security-First Architecture**
- **Ed25519 Cryptographic Authentication**: Advanced digital signature authentication beyond traditional JWT
- **Multi-Role Authorization**: Hierarchical roles (Guest, User, Service, Admin, System) with granular permissions
- **Decentralized Identity (DID)**: Wallet-based authentication and cryptographic key management
- **End-to-End Validation**: Unified AJV schema validation across frontend and backend
- **Secure Communication**: Built-in WebSocket encryption and API request signing

### **Unified Fullstack Development**
- **Single Source of Truth**: Shared modules defining routes, validation, and types across all environments
- **Context-Driven Architecture**: Dependency injection system managing services, resources, and middleware
- **Cross-Platform Consistency**: Unified APIs working across web browsers, React Native, and Node.js servers
- **Type Safety**: Full TypeScript coverage with shared types between frontend and backend

### **Modern Microservices Ready**
- **Kubernetes Integration**: Built-in Kubernetes deployment and service discovery
- **Service Mesh**: Inter-service communication with authentication and load balancing
- **Resource Abstraction**: Unified interfaces for MongoDB, Redis, S3 storage, and more
- **Configuration Management**: Environment-aware configuration with service discovery

### **Developer Experience**
- **Rapid Development**: High-level components and pre-configured application frameworks
- **Material Design Integration**: Complete Material-UI integration for web applications
- **Internationalization**: Built-in i18n with browser language detection and namespace organization
- **File Management**: Advanced file upload, image processing, and storage capabilities

## 📚 **Thesaurus & Core Concepts**

### **Context**
An application instance that manages the lifecycle and dependencies of services, modules, and resources. Multiple contexts can exist within one application with different capabilities depending on the complexity of operation and its dependencies.

### **Module**
A URL unit in the system that declares routes, nesting relationships, and transforms into API endpoints (backend) or navigation routes (frontend). Modules provide a centralized place where all possible routes are registered and maintain consistency across environments.

### **Route**
Cross-environment structure consisting of URLs, URIs, aliases, permissions, and validations. Routes are POJO (Plain Old JavaScript Objects) that define the navigation and API structure.

### **Service**
Components that provide functionality and can be initialized either immediately or lazily. Services represent domain functionality without being bound to one specific model.

### **Resource** 
Components that provide data or external functionality, representing stored or remote entity sets with unified CRUD operations across different storage backends.

### **Guards**
Authentication and authorization middleware that protect routes and modules based on user roles, permissions, and cryptographic verification.

### **Layers**
Hierarchical organization system supporting System, Global, Service, Entity, and User levels for complex multi-tenant applications.

### **Quadra Pattern**
OwlMeans' architectural pattern providing four implementations for comprehensive coverage:
- **Core packages**: Environment-agnostic logic and models
- **Server packages**: Backend implementations with API and business logic  
- **Client packages**: Platform-agnostic client logic and components
- **Web packages**: Browser-specific React implementations with Material-UI
- **Native packages**: React Native mobile implementations

## 🚀 **Quick Start**

Get started with OwlMeans Common in just a few minutes by creating a simple "Hello World" application with a server endpoint and client.

### **Step 1: Install Dependencies**

```bash
npm install @owlmeans/server-app @owlmeans/web-client @owlmeans/client-module @owlmeans/client-config @owlmeans/client
```

### **Step 2: Create Server**

```typescript
// server.ts
import { makeContext, main, modules, elevate, handleRequest } from '@owlmeans/server-app'
import { module, route } from '@owlmeans/module'

// Define a simple hello endpoint
const helloModule = module(
  route('hello', '/api/hello', { method: 'GET' })
)

// Handle the hello request
elevate(helloModule, 'hello', handleRequest(async (req, res) => {
  res.resolve({ message: 'Hello World from OwlMeans!' })
}))

// Start server
const context = makeContext({ port: 3001 })
main(context, [...modules, helloModule])
```

### **Step 3: Create Client**

```typescript
// client.tsx
import React, { useState, useEffect } from 'react'
import { makeContext, render } from '@owlmeans/web-client'
import { App } from '@owlmeans/client'
import { module } from '@owlmeans/client-module'
import { route } from '@owlmeans/route'
import { config, addWebService } from '@owlmeans/client-config'
import { Button, Typography, Box } from '@mui/material'
import { AppType, Layer } from '@owlmeans/context'

// Create the hello module for client-side API calls
const helloModule = module(route('hello', '/api/hello', { method: 'GET' }))

// Create root component module 
const rootModule = module(route('root', '/', { frontend: true }))

const HelloComponent = () => {
  const [message, setMessage] = useState('')

  const fetchHello = async () => {
    try {
      // Use module system to make API call
      const [data, outcome] = await helloModule.call()
      setMessage(data.message)
    } catch (error) {
      console.error('Failed to fetch hello:', error)
      setMessage('Error loading message')
    }
  }

  useEffect(() => { fetchHello() }, [])

  return (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      <Typography variant="h4" gutterBottom>
        OwlMeans Common
      </Typography>
      <Typography variant="h6" color="primary" sx={{ mb: 2 }}>
        {message || 'Loading...'}
      </Typography>
      <Button variant="contained" onClick={fetchHello}>
        Refresh
      </Button>
    </Box>
  )
}

// Create web context with API service configuration
const context = makeContext(config(
  AppType.Frontend,
  'hello-world-client',
  addWebService('api', {
    host: 'localhost',
    port: 3001
  }),
  {
    layer: Layer.Service,
    trusted: ['localhost:3001']
  }
))

// Register modules
context.registerModules([helloModule, rootModule])

// Initialize context and render
context.configure().then(() => context.init()).then(() => {
  render(
    <App context={context}>
      <HelloComponent />
    </App>,
    { domId: 'root' }
  )
})
```

### **Step 4: Run the Application**

```bash
# Terminal 1: Start server
npx ts-node server.ts

# Terminal 2: Start client (with your preferred React setup)
npm start
```

That's it! You now have a working OwlMeans Common application. For a more comprehensive example with authentication, validation, and advanced features, see the Full Example below.

## 📖 **Full Example: Complete Fullstack Application**

This comprehensive example demonstrates building a complete fullstack application with user authentication, a backend API, and a React Material-UI frontend using OwlMeans Common.

### **Project Structure**

```
hello-world-app/
├── package.json
├── server/
│   ├── index.ts          # Backend entry point
│   ├── modules/          # Custom API modules
│   └── config.ts         # Server configuration
├── client/
│   ├── index.tsx         # Frontend entry point
│   ├── components/       # React components
│   └── config.ts         # Client configuration
└── shared/
    ├── types.ts          # Shared TypeScript types
    └── modules.ts        # Shared module definitions
```

### **Step 1: Project Setup**

```bash
# Create project directory
mkdir hello-world-app && cd hello-world-app

# Initialize package.json
npm init -y

# Install OwlMeans dependencies
npm install @owlmeans/server-app @owlmeans/web-panel
npm install @owlmeans/auth @owlmeans/config @owlmeans/context

# Install peer dependencies
npm install react react-dom @mui/material @emotion/react @emotion/styled
npm install typescript @types/node @types/react
```

### **Step 2: Shared Module Definitions**

```typescript
// shared/modules.ts
import { module, route, guard, filter, body } from '@owlmeans/server-app'

// User data validation schema
export const userSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 100 },
    email: { type: 'string', format: 'email' },
    message: { type: 'string', minLength: 1, maxLength: 500 }
  },
  required: ['name', 'email', 'message']
}

// API modules shared between frontend and backend
export const helloModule = module(
  route('hello', '/api/hello', { method: 'GET' })
)

export const createGreetingModule = module(
  route('create-greeting', '/api/greeting', { method: 'POST' }),
  filter(body(userSchema), guard('authenticated'))
)

export const listGreetingsModule = module(
  route('list-greetings', '/api/greetings', { method: 'GET' }),
  guard('authenticated')
)
```

```typescript
// shared/types.ts
export interface User {
  id: string
  name: string
  email: string
  createdAt: Date
}

export interface Greeting {
  id: string
  userId: string
  name: string
  email: string
  message: string
  createdAt: Date
}

export interface HelloResponse {
  message: string
  timestamp: Date
  version: string
}
```

### **Step 3: Backend Server**

```typescript
// server/config.ts
import { config, service, AppType, Layer } from '@owlmeans/server-app'

export const serverConfig = config(
  AppType.Backend,
  'hello-world-server',
  service('database', {
    // In production, use environment variables
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'hello_world'
  }),
  {
    layer: Layer.Service,
    port: parseInt(process.env.PORT || '3001'),
    debug: { all: process.env.NODE_ENV !== 'production' }
  }
)
```

```typescript
// server/modules/greeting.ts
import { elevate, handleRequest, handleBody, ModuleOutcome } from '@owlmeans/server-app'
import { helloModule, createGreetingModule, listGreetingsModule } from '../../shared/modules'
import type { HelloResponse, Greeting, User } from '../../shared/types'

// In-memory storage for demo (use database in production)
const greetings: Greeting[] = []
const users: User[] = []

// Simple hello endpoint
elevate(helloModule, 'hello', handleRequest(async (req, res) => {
  const response: HelloResponse = {
    message: 'Hello from OwlMeans Common!',
    timestamp: new Date(),
    version: '1.0.0'
  }
  res.resolve(response)
}))

// Create greeting with authentication
elevate(createGreetingModule, 'create-greeting', handleBody(async (req, res) => {
  const { name, email, message } = req.body
  
  // Find or create user
  let user = users.find(u => u.email === email)
  if (!user) {
    user = {
      id: `user_${Date.now()}`,
      name,
      email,
      createdAt: new Date()
    }
    users.push(user)
  }
  
  // Create greeting
  const greeting: Greeting = {
    id: `greeting_${Date.now()}`,
    userId: user.id,
    name,
    email,
    message,
    createdAt: new Date()
  }
  
  greetings.push(greeting)
  res.resolve(greeting, ModuleOutcome.Created)
}))

// List all greetings
elevate(listGreetingsModule, 'list-greetings', handleRequest(async (req, res) => {
  const sortedGreetings = greetings.sort((a, b) => 
    b.createdAt.getTime() - a.createdAt.getTime()
  )
  res.resolve(sortedGreetings)
}))
```

```typescript
// server/index.ts
import { makeContext, main, modules } from '@owlmeans/server-app'
import { serverConfig } from './config'
import { helloModule, createGreetingModule, listGreetingsModule } from '../shared/modules'
import './modules/greeting' // Import to register handlers

async function startServer() {
  try {
    // Create application context
    const context = makeContext(serverConfig)
    
    // Combine default modules with custom modules
    const allModules = [
      ...modules, // Default OwlMeans modules (auth, config, etc.)
      helloModule,
      createGreetingModule, 
      listGreetingsModule
    ]
    
    // Start the server
    await main(context, allModules)
    console.log(`🚀 Server running on port ${serverConfig.port}`)
    
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
```

### **Step 4: Frontend Application**

```typescript
// client/config.ts
import { config, addWebService, AppType, Layer } from '@owlmeans/web-panel'

export const clientConfig = config(
  AppType.Frontend,
  'hello-world-client',
  addWebService('api', {
    host: process.env.REACT_APP_API_HOST || 'localhost',
    port: parseInt(process.env.REACT_APP_API_PORT || '3001')
  }),
  {
    layer: Layer.Service,
    debug: { all: process.env.NODE_ENV === 'development' }
  }
)
```

```typescript
// client/components/HelloWorld.tsx
import React, { useState, useEffect } from 'react'
import {
  PanelForm,
  FormField,
  FormButton,
  PanelText,
  StatusIndicator,
  PanelButton
} from '@owlmeans/web-panel'
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Box,
  List,
  ListItem,
  ListItemText
} from '@mui/material'
import { useClientContext } from '@owlmeans/web-client'
import type { HelloResponse, Greeting } from '../../shared/types'
import { userSchema } from '../../shared/modules'

const HelloWorld: React.FC = () => {
  const context = useClientContext()
  const [hello, setHello] = useState<HelloResponse | null>(null)
  const [greetings, setGreetings] = useState<Greeting[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch hello message on component mount
  useEffect(() => {
    fetchHello()
  }, [])

  const fetchHello = async () => {
    try {
      setLoading(true)
      const response = await context.service('api').call('hello')
      setHello(response.data)
    } catch (err) {
      setError('Failed to fetch hello message')
    } finally {
      setLoading(false)
    }
  }

  const fetchGreetings = async () => {
    try {
      setLoading(true)
      const response = await context.service('api').call('list-greetings')
      setGreetings(response.data)
    } catch (err) {
      setError('Failed to fetch greetings')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitGreeting = async (data: any) => {
    try {
      setLoading(true)
      setError(null)
      
      await context.service('api').call('create-greeting', {
        method: 'POST',
        body: data
      })
      
      // Refresh greetings list
      await fetchGreetings()
      
    } catch (err) {
      setError('Failed to create greeting')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Grid container spacing={3} sx={{ p: 3 }}>
      {/* Welcome Section */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <PanelText variant="h4" gutterBottom>
              OwlMeans Common Hello World
            </PanelText>
            
            {loading && (
              <StatusIndicator status="loading" message="Loading..." />
            )}
            
            {error && (
              <StatusIndicator 
                status="error" 
                message={error}
                onClose={() => setError(null)}
              />
            )}
            
            {hello && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="h6" color="primary">
                  {hello.message}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Server time: {new Date(hello.timestamp).toLocaleString()}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Version: {hello.version}
                </Typography>
              </Box>
            )}
            
            <PanelButton
              variant="outlined"
              onClick={fetchHello}
              disabled={loading}
              sx={{ mt: 2 }}
            >
              Refresh Hello
            </PanelButton>
          </CardContent>
        </Card>
      </Grid>

      {/* Greeting Form */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Leave a Greeting
            </Typography>
            
            <PanelForm
              schema={userSchema}
              onSubmit={handleSubmitGreeting}
              defaultValues={{
                name: '',
                email: '',
                message: ''
              }}
            >
              <FormField
                name="name"
                label="Your Name"
                required
                fullWidth
                margin="normal"
              />
              
              <FormField
                name="email"
                label="Email Address"
                type="email"
                required
                fullWidth
                margin="normal"
              />
              
              <FormField
                name="message"
                label="Your Message"
                multiline
                rows={4}
                required
                fullWidth
                margin="normal"
              />
              
              <Box sx={{ mt: 2 }}>
                <FormButton
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={loading}
                >
                  Send Greeting
                </FormButton>
              </Box>
            </PanelForm>
          </CardContent>
        </Card>
      </Grid>

      {/* Greetings List */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Recent Greetings
              </Typography>
              <PanelButton
                variant="outlined"
                size="small"
                onClick={fetchGreetings}
                disabled={loading}
              >
                Refresh
              </PanelButton>
            </Box>
            
            {greetings.length === 0 ? (
              <Typography variant="body2" color="textSecondary">
                No greetings yet. Be the first to leave one!
              </Typography>
            ) : (
              <List>
                {greetings.map((greeting) => (
                  <ListItem key={greeting.id} divider>
                    <ListItemText
                      primary={`${greeting.name} (${greeting.email})`}
                      secondary={
                        <>
                          <Typography component="span" variant="body2">
                            {greeting.message}
                          </Typography>
                          <br />
                          <Typography component="span" variant="caption" color="textSecondary">
                            {new Date(greeting.createdAt).toLocaleString()}
                          </Typography>
                        </>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  )
}

export default HelloWorld
```

```typescript
// client/index.tsx
import React from 'react'
import { render } from '@owlmeans/web-panel'
import { makeWebContext } from '@owlmeans/web-client'
import { createTheme } from '@mui/material/styles'
import {
  PanelApp,
  AuthGuard
} from '@owlmeans/web-panel'
import HelloWorld from './components/HelloWorld'
import { clientConfig } from './config'

// Custom Material-UI theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    fontFamily: 'Roboto, Arial, sans-serif',
  },
})

const App: React.FC = () => {
  const context = makeWebContext(clientConfig)

  return (
    <PanelApp context={context} theme={theme}>
      <AuthGuard fallback={<div>Please log in to continue</div>}>
        <HelloWorld />
      </AuthGuard>
    </PanelApp>
  )
}

// Render the application
const context = makeWebContext(clientConfig)
render(context, theme)
```

### **Step 5: Running the Application**

```bash
# Terminal 1: Start the backend server
npx ts-node server/index.ts

# Terminal 2: Start the frontend (in a new terminal)
npx webpack serve --config webpack.config.js
# or if using Create React App:
npm start
```

### **Key Features Demonstrated**

1. **Unified Module System**: Shared route definitions between frontend and backend
2. **Automatic Validation**: AJV schemas enforced on both client and server
3. **Authentication Integration**: Built-in authentication guards and user management
4. **Material-UI Components**: Pre-styled, accessible UI components
5. **Type Safety**: Full TypeScript integration with shared types
6. **Context Management**: Dependency injection for services and configuration
7. **Error Handling**: Comprehensive error management and user feedback

This example showcases the power of OwlMeans Common's unified approach to fullstack development, where business logic, validation, and types are shared between frontend and backend, ensuring consistency and reducing duplication.

## 📦 **Complete Package Reference**

OwlMeans Common provides 69 specialized packages organized into six categories following the "quadra" architectural pattern.

### **🏗️ Core Packages (29 packages)**
Foundational libraries providing environment-agnostic functionality.

| Package | Description |
|---------|-------------|
| [`@owlmeans/api`](packages/api) | HTTP API client library with module system integration and automatic authentication |
| [`@owlmeans/basic-envelope`](packages/basic-envelope) | Lightweight cryptographic message envelope with Ed25519 signatures |
| [`@owlmeans/basic-ids`](packages/basic-ids) | Random and semi-random identifier generation utilities |
| [`@owlmeans/basic-keys`](packages/basic-keys) | Core cryptographic library for key pair generation and digital signing |
| [`@owlmeans/client`](packages/client) | Comprehensive React client library with routing and state management |
| [`@owlmeans/config`](packages/config) | Configuration management with merging, resources, and plugin integration |
| [`@owlmeans/context`](packages/context) | Dependency injection and management system for microservices |
| [`@owlmeans/did`](packages/did) | Decentralized Identity (DID) and cryptographic wallet management |
| [`@owlmeans/error`](packages/error) | Fully typed error system for seamless frontend/backend error handling |
| [`@owlmeans/flow`](packages/flow) | Configurable user flow management with state transitions |
| [`@owlmeans/i18n`](packages/i18n) | Multi-level internationalization with namespace-based organization |
| [`@owlmeans/image-resource`](packages/image-resource) | Specialized image management for object storage systems |
| [`@owlmeans/kluster`](packages/kluster) | Kubernetes integration for cloud-native service discovery |
| [`@owlmeans/module`](packages/module) | URL unit system for fullstack route and component management |
| [`@owlmeans/mongo`](packages/mongo) | MongoDB service integration with clustering and encryption |
| [`@owlmeans/mongo-resource`](packages/mongo-resource) | MongoDB resource implementation with schema validation |
| [`@owlmeans/oidc`](packages/oidc) | OpenID Connect integration with provider configuration |
| [`@owlmeans/payment`](packages/payment) | Payment system with product management and subscriptions |
| [`@owlmeans/queue`](packages/queue) | Message queue abstractions for distributed applications |
| [`@owlmeans/redis`](packages/redis) | Redis service integration with clustering support |
| [`@owlmeans/redis-resource`](packages/redis-resource) | Redis-based resource storage implementation |
| [`@owlmeans/resource`](packages/resource) | Abstract interfaces for database operations and data access |
| [`@owlmeans/route`](packages/route) | Cross-environment routing with URLs, permissions, and validations |
| [`@owlmeans/socket`](packages/socket) | WebSocket communication with RPC calls and authentication |
| [`@owlmeans/state`](packages/state) | Reactive state management with subscription-based reactivity |
| [`@owlmeans/static-resource`](packages/static-resource) | In-memory resource storage solution |
| [`@owlmeans/storage-common`](packages/storage-common) | Common interfaces for object storage systems |
| [`@owlmeans/storage-resource`](packages/storage-resource) | S3-compatible object storage with file management |
| [`@owlmeans/wled`](packages/wled) | Whitelabeling subsystem base types and modules |

### **🔌 API Packages (3 packages)**
Specialized packages for API configuration and service advertisement.

| Package | Description |
|---------|-------------|
| [`@owlmeans/api-config`](packages/api-config) | Shared API configuration library for exposing safe configuration data |
| [`@owlmeans/api-config-client`](packages/api-config-client) | Client-side functionality for fetching API configuration |
| [`@owlmeans/api-config-server`](packages/api-config-server) | Server-side functionality for advertising API configuration |

### **🔐 Authentication Packages (2 packages)**
Comprehensive authentication and authorization infrastructure.

| Package | Description |
|---------|-------------|
| [`@owlmeans/auth`](packages/auth) | Core authentication library with multi-role authorization and cryptographic security |
| [`@owlmeans/auth-common`](packages/auth-common) | Shared authentication components bridging client and server implementations |

### **💻 Client Packages (13 packages)**
Platform-agnostic client libraries for React applications.

| Package | Description |
|---------|-------------|
| [`@owlmeans/client-auth`](packages/client-auth) | Client-side authentication with token management and session persistence |
| [`@owlmeans/client-config`](packages/client-config) | Client-side configuration management with web service support |
| [`@owlmeans/client-context`](packages/client-context) | Client context management with service routing and API integration |
| [`@owlmeans/client-did`](packages/client-did) | Client-side DID wallet management and authentication |
| [`@owlmeans/client-flow`](packages/client-flow) | Client-side user flow management with state persistence |
| [`@owlmeans/client-i18n`](packages/client-i18n) | React-based internationalization functionality |
| [`@owlmeans/client-module`](packages/client-module) | Client-side module system with API calls and URL generation |
| [`@owlmeans/client-panel`](packages/client-panel) | React panel library with UI components and form management |
| [`@owlmeans/client-payment`](packages/client-payment) | Client-side payment functionality |
| [`@owlmeans/client-resource`](packages/client-resource) | Client-side resource management with local database storage |
| [`@owlmeans/client-route`](packages/client-route) | Client-side routing extensions |
| [`@owlmeans/client-socket`](packages/client-socket) | Client-side WebSocket integration for real-time communication |
| [`@owlmeans/client-wl`](packages/client-wl) | Client-side whitelabeling functionality |

### **📱 Native Packages (3 packages)**
React Native implementations for mobile applications.

| Package | Description |
|---------|-------------|
| [`@owlmeans/native-client`](packages/native-client) | React Native client framework with authentication and database integration |
| [`@owlmeans/native-db`](packages/native-db) | React Native database functionality using AsyncStorage |
| [`@owlmeans/native-panel`](packages/native-panel) | React Native panel components with Material Design 3 support |

### **🖥️ Server Packages (12 packages)**
Backend implementations for API services and business logic.

| Package | Description |
|---------|-------------|
| [`@owlmeans/server-api`](packages/server-api) | Server-side API framework built on Fastify with authentication |
| [`@owlmeans/server-app`](packages/server-app) | **🚀 Complete server application framework** - foundation for backend applications |
| [`@owlmeans/server-auth`](packages/server-auth) | Server-side authentication with Ed25519 verification and token management |
| [`@owlmeans/server-config`](packages/server-config) | Server-specific configuration utilities |
| [`@owlmeans/server-context`](packages/server-context) | Server-side context and dependency injection system |
| [`@owlmeans/server-flow`](packages/server-flow) | Server-side flow management with persistence and API integrations |
| [`@owlmeans/server-module`](packages/server-module) | Server-side module system for HTTP request handling |
| [`@owlmeans/server-oidc-provider`](packages/server-oidc-provider) | Complete OIDC identity provider service |
| [`@owlmeans/server-oidc-rp`](packages/server-oidc-rp) | Server-side OpenID Connect Relying Party functionality |
| [`@owlmeans/server-route`](packages/server-route) | Server-side routing with request matching and path resolution |
| [`@owlmeans/server-socket`](packages/server-socket) | WebSocket server functionality with authentication |
| [`@owlmeans/server-wl`](packages/server-wl) | Server-side whitelabeling functionality |

### **🌐 Web Packages (7 packages)**
Browser-specific implementations with Material-UI integration.

| Package | Description |
|---------|-------------|
| [`@owlmeans/web-client`](packages/web-client) | React DOM client library with browser-specific functionality |
| [`@owlmeans/web-db`](packages/web-db) | Web database implementation using IndexedDB |
| [`@owlmeans/web-flow`](packages/web-flow) | Web-specific flow management with URL-based state management |
| [`@owlmeans/web-oidc-provider`](packages/web-oidc-provider) | Web-based OIDC Provider functionality for React applications |
| [`@owlmeans/web-oidc-rp`](packages/web-oidc-rp) | Web client-side OIDC Relying Party functionality |
| [`@owlmeans/web-panel`](packages/web-panel) | **🎨 Complete web panel framework** - Material-UI components for admin interfaces |
| [`@owlmeans/web-wl`](packages/web-wl) | Web-specific whitelabeling with React components |

## 🎯 **Getting Started**

### **For Fullstack Applications**
Start with the two flagship packages:

1. **Backend**: [`@owlmeans/server-app`](packages/server-app) - Complete server application framework
2. **Frontend**: [`@owlmeans/web-panel`](packages/web-panel) - Material-UI web components and infrastructure

### **For Specific Use Cases**

- **Authentication Systems**: Start with [`@owlmeans/auth`](packages/auth) and [`@owlmeans/auth-common`](packages/auth-common)
- **Mobile Applications**: Use [`@owlmeans/native-client`](packages/native-client) and [`@owlmeans/native-panel`](packages/native-panel)
- **Microservices**: Begin with [`@owlmeans/context`](packages/context) and [`@owlmeans/config`](packages/config)
- **Data Management**: Explore [`@owlmeans/resource`](packages/resource) with storage-specific implementations
- **Real-time Communication**: Use [`@owlmeans/socket`](packages/socket) with client/server implementations

### **Development Workflow**

1. **Design your modules** using [`@owlmeans/module`](packages/module) for shared route definitions
2. **Configure your context** with [`@owlmeans/config`](packages/config) for dependency management
3. **Implement authentication** using the auth packages for security
4. **Build your API** with server packages for backend logic
5. **Create your UI** with web/native packages for user interfaces

## 📄 **License**

OwlMeans Common is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

**OwlMeans Common** — *Building the future of secure, scalable fullstack applications.*
