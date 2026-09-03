# OwlMeans Common — Fullstack TypeScript Framework

**OwlMeans Common** is a comprehensive, security-first TypeScript framework designed for building scalable fullstack applications with modern microservices and microclients architecture. Built around the concept of unified entrypoints, context-driven dependency injection, and "quadra" pattern implementations, it provides everything needed to develop secure, maintainable applications from authentication to UI components.

## 🎯 **Framework Principles & Goals**

### **Security-First Architecture**
- **Ed25519 Cryptographic Authentication**: Advanced digital signature authentication beyond traditional JWT
- **Multi-Role Authorization**: Hierarchical roles (Guest, User, Service, Admin, System) with granular permissions
- **Decentralized Identity (DID)**: Wallet-based authentication and cryptographic key management
- **End-to-End Validation**: Unified AJV schema validation across frontend and backend
- **Secure Communication**: Built-in WebSocket encryption and API request signing

### **Unified Fullstack Development**
- **Single Source of Truth**: Shared entrypoints defining routes, validation, and types across all environments
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
An application instance that manages the lifecycle and dependencies of services, entrypoints, and resources. One context is built per process by a single factory: each layer's factory calls the factory below it, applies its own `append*` mixins, and returns the same context.

### **Entrypoint**
A URL unit in the system that declares routes, nesting relationships, and transforms into API endpoints (backend) or navigation routes (frontend). Entrypoints provide a centralized place where all possible routes are registered and maintain consistency across environments. A client-side entrypoint exposes three explicit verbs — `call()` for the value, `invoke()` for the value plus its outcome, and `url()` for the address.

### **Route**
Cross-environment structure consisting of URLs, URIs, aliases, permissions, and validations. A route declaration is a POJO (Plain Old JavaScript Object) and stays immutable: its `path` is the segment it contributes under its parent, and every address question — path, mount, service, host — is computed on demand from the declaration plus the context that asks.

### **Service**
Components that provide functionality and can be initialized either immediately or lazily. Services represent domain functionality without being bound to one specific model.

### **Resource** 
Components that provide data or external functionality, representing stored or remote entity sets with unified CRUD operations across different storage backends.

### **Guards**
Authentication and authorization middleware that protect routes and entrypoints based on user roles, permissions, and cryptographic verification.

### **Quadra Pattern**
OwlMeans' architectural pattern providing four implementations for comprehensive coverage:
- **Core packages**: Environment-agnostic logic and models
- **Server packages**: Backend implementations with API and business logic  
- **Client packages**: Platform-agnostic client logic and components
- **Web packages**: Browser-specific React implementations with Material-UI
- **Native packages**: React Native mobile implementations — see [owlmeans/native](https://github.com/owlmeans/native)

## 🤖 Agent guidance

Every published `@owlmeans/*` package ships embedded agent skills under `agent-meta/`. These files are version-matched to each package release and guide AI assistants in using the OwlMeans framework correctly.

### Install agent guidance

After installing OwlMeans packages, run the agent-skills installer once:

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.11
```

This scans `node_modules/@owlmeans/*/agent-meta/`, shows you what guidance is available, and (with your confirmation) copies it into `.agents/skills/<name>/SKILL.md` — the [Agent Skills](https://agentskills.io) standard location read by GitHub Copilot, Codex and others. A project that also uses Claude Code gets the per-skill symlinks it needs under `.claude/skills/`.

Re-run after updating `@owlmeans/*` packages to pick up revised guidance.

### Schema

Each package's `agent-meta/` directory contains:

```
agent-meta/
  manifest.json              # name, version, canonical GitHub paths, entries list
  skills/<name>/
    SKILL.md                 # agent skill (loaded on relevant context)
```

Embedded files are **generated and read-only**. To suggest edits, open a PR against [owlmeans/common](https://github.com/owlmeans/common).

## 🚀 **Quick Start**

> **Building a new app?** The fastest path is to scaffold one:
> ```sh
> npm create @owlmeans/app@latest my-app   # or: bun create @owlmeans/app my-app
> ```
> This generates a minimal fullstack project (`common` + `api` + `web`) with shadcn UI navigation,
> no authentication, and a session-scoped in-memory resource — and deploys the agent skills into it.
> See **[docs/getting-started.md](docs/getting-started.md)** for both the scaffolded and the
> step-by-step **manual** walkthrough.

Get started with OwlMeans Common in just a few minutes by creating a simple "Hello World" application with a server endpoint and client.

### **Step 1: Install Dependencies**

```bash
npm install @owlmeans/server-app@^0.1.18-rc.17 @owlmeans/web-client@^0.1.18-rc.23 @owlmeans/client-entrypoint@^0.1.18-rc.12 @owlmeans/client-context@^0.1.18-rc.12 @owlmeans/client@^0.1.18-rc.15 @owlmeans/config@^0.1.18-rc.11 @owlmeans/route@^0.1.18-rc.8
```

### **Step 2: Create Server**

```typescript
// server.ts
import {
  makeContext, main, entrypoints, entrypoint, elevate, handleRequest, route, config
} from '@owlmeans/server-app'
import { backend, RouteMethod } from '@owlmeans/route'

// Define a simple hello entrypoint
const appEntrypoints = [
  entrypoint(route('hello', '/api/hello', backend(null, RouteMethod.GET)))
]

// Handle the hello request — elevation replaces the declaration in the list
elevate(appEntrypoints, 'hello', handleRequest(async (req, res) => {
  res.resolve({ message: 'Hello World from OwlMeans!' })
}))

// Start server
const context = makeContext(config('api', { port: 3001 }))
await main(context, [...entrypoints, ...appEntrypoints])
```

### **Step 3: Create Client**

```typescript
// client.tsx
import React, { useState, useEffect } from 'react'
import { makeContext, render } from '@owlmeans/web-client'
import { App } from '@owlmeans/client'
import { entrypoint } from '@owlmeans/client-entrypoint'
import { route, backend, frontend, RouteMethod } from '@owlmeans/route'
import { config } from '@owlmeans/client-context'
import { AppType, service } from '@owlmeans/config'
import { Button, Typography, Box } from '@mui/material'

// Create the hello entrypoint for client-side API calls
const helloEntrypoint = entrypoint(route('hello', '/api/hello', backend({ service: 'api' }, RouteMethod.GET)))

// Create root component entrypoint
const rootEntrypoint = entrypoint(route('root', '/', frontend({ default: true })))

const HelloComponent = () => {
  const [message, setMessage] = useState('')

  const fetchHello = async () => {
    try {
      // Use entrypoint system to make API call
      const data = await helloEntrypoint.call()
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

// Declare where this app and its API live, then build the context
const cfg = service({ type: AppType.Frontend, service: 'hello-world-client', host: 'localhost', port: 3000 })
service({ type: AppType.Backend, service: 'api', host: 'localhost', port: 3001 }, cfg)

const context = makeContext(config('hello-world-client', cfg))

// Register entrypoints
context.registerEntrypoints([helloEntrypoint, rootEntrypoint])

// Initialize context and render
await context.configure().init()

render(
  <App context={context}>
    <HelloComponent />
  </App>,
  { domId: 'root' }
)
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
│   ├── entrypoints/      # Custom API entrypoint handlers
│   └── config.ts         # Server configuration
├── client/
│   ├── index.tsx         # Frontend entry point
│   ├── components/       # React components
│   └── config.ts         # Client configuration
└── shared/
    ├── types.ts          # Shared TypeScript types
    └── entrypoints.ts    # Shared entrypoint definitions
```

### **Step 1: Project Setup**

```bash
# Create project directory
mkdir hello-world-app && cd hello-world-app

# Initialize package.json
npm init -y

# Install OwlMeans dependencies
npm install @owlmeans/server-app@^0.1.18-rc.17 @owlmeans/mui-panel@^0.1.18-rc.26
npm install @owlmeans/auth@^0.1.18-rc.8 @owlmeans/config@^0.1.18-rc.11 @owlmeans/context@^0.1.18-rc.7 @owlmeans/route@^0.1.18-rc.8

# Install peer dependencies
npm install react react-dom @mui/material @emotion/react @emotion/styled
npm install typescript @types/node @types/react
```

### **Step 2: Shared Entrypoint Definitions**

```typescript
// shared/entrypoints.ts
import { entrypoint, route, guard, filter, body } from '@owlmeans/server-app'
import { backend, RouteMethod } from '@owlmeans/route'

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

// Entrypoints shared between frontend and backend. The declaration names the service it
// belongs to; where that service answers is a question the context resolves at call time.
export const appEntrypoints = [
  entrypoint(
    route('hello', '/api/hello', backend({ service: 'api' }, RouteMethod.GET))
  ),
  entrypoint(
    route('create-greeting', '/api/greeting', backend({ service: 'api' }, RouteMethod.POST)),
    filter(body(userSchema), guard('authenticated'))
  ),
  entrypoint(
    route('list-greetings', '/api/greetings', backend({ service: 'api' }, RouteMethod.GET)),
    guard('authenticated')
  )
]
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
import { config, service, AppType } from '@owlmeans/server-app'

// Where this service answers, and where its API is reachable from the browser
const cfg = service({
  type: AppType.Backend,
  service: 'api',
  host: process.env.API_HOST || 'localhost',
  port: parseInt(process.env.PORT || '3001')
})

// Databases live in `dbs`, keyed by the resource service they belong to
cfg.dbs = [{
  service: 'postgres',
  alias: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  schema: process.env.DB_SCHEMA || 'hello_world'
}]
cfg.port = parseInt(process.env.PORT || '3001')
cfg.debug = { all: process.env.NODE_ENV !== 'production' }

export const serverConfig = config('hello-world-server', cfg)
```

```typescript
// server/entrypoints/greeting.ts
import { elevate, handleRequest, handleBody, EntrypointOutcome } from '@owlmeans/server-app'
import { appEntrypoints } from '../../shared/entrypoints'
import type { HelloResponse, Greeting, User } from '../../shared/types'

// In-memory storage for demo (use database in production)
const greetings: Greeting[] = []
const users: User[] = []

// Simple hello endpoint
elevate(appEntrypoints, 'hello', handleRequest(async (req, res) => {
  const response: HelloResponse = {
    message: 'Hello from OwlMeans Common!',
    timestamp: new Date(),
    version: '1.0.0'
  }
  res.resolve(response)
}))

// Create greeting with authentication
elevate(appEntrypoints, 'create-greeting', handleBody(async (req, res) => {
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
  res.resolve(greeting, EntrypointOutcome.Created)
}))

// List all greetings
elevate(appEntrypoints, 'list-greetings', handleRequest(async (req, res) => {
  const sortedGreetings = greetings.sort((a, b) => 
    b.createdAt.getTime() - a.createdAt.getTime()
  )
  res.resolve(sortedGreetings)
}))
```

```typescript
// server/index.ts
import { makeContext, main, entrypoints } from '@owlmeans/server-app'
import { serverConfig } from './config'
import { appEntrypoints } from '../shared/entrypoints'
import './entrypoints/greeting' // Import to register handlers

async function startServer() {
  try {
    // Create application context
    const context = makeContext(serverConfig)
    
    // Combine default entrypoints with custom ones
    const allEntrypoints = [
      ...entrypoints, // Default OwlMeans entrypoints (auth, config, etc.)
      ...appEntrypoints
    ]
    
    // Start the server
    await main(context, allEntrypoints)
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
import { config, service, AppType, elevate } from '@owlmeans/mui-panel'
import { appEntrypoints } from '../shared/entrypoints'

// Calling an entrypoint from the browser is an explicit opt-in
elevate(appEntrypoints, 'hello')
elevate(appEntrypoints, 'create-greeting')
elevate(appEntrypoints, 'list-greetings')

const cfg = service({
  type: AppType.Frontend, service: 'hello-world-client', host: 'localhost', port: 3000
})
service({
  type: AppType.Backend,
  service: 'api',
  host: process.env.REACT_APP_API_HOST || 'localhost',
  port: parseInt(process.env.REACT_APP_API_PORT || '3001')
}, cfg)
cfg.debug = { all: process.env.NODE_ENV === 'development' }

export const clientConfig = config('hello-world-client', cfg)
```

```typescript
// client/components/HelloWorld.tsx
import React, { useState, useEffect } from 'react'
import {
  Form,
  TextInput,
  SubmitButton,
  Button,
  Text,
  Status
} from '@owlmeans/mui-panel'
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
import { useContext } from '@owlmeans/web-client'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import type { HelloResponse, Greeting } from '../../shared/types'
import { userSchema } from '../../shared/entrypoints'

const HelloWorld: React.FC = () => {
  const context = useContext()
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
      const hello = context.entrypoint<ClientEntrypoint<HelloResponse>>('hello')
      // call() resolves to the value itself and throws whatever the reply carried
      setHello(await hello.call())
    } catch (err) {
      setError('Failed to fetch hello message')
    } finally {
      setLoading(false)
    }
  }

  const fetchGreetings = async () => {
    try {
      setLoading(true)
      const list = context.entrypoint<ClientEntrypoint<Greeting[]>>('list-greetings')
      setGreetings(await list.call())
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
      
      const create = context.entrypoint<ClientEntrypoint<Greeting>>('create-greeting')
      // invoke() when the outcome decides what happens next
      const { value, outcome } = await create.invoke({ body: data })
      console.log(`greeting ${value.id} — ${outcome}`)
      
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
            <Text variant="h4">
              OwlMeans Common Hello World
            </Text>
            
            {loading && <Status message="Loading..." />}
            
            {error && <Status ok={false} message={error} />}
            
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
            
            <Button label="Refresh Hello" variant="outlined" onClick={fetchHello} />
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
            
            <Form
              validation={userSchema}
              onSubmit={handleSubmitGreeting}
              defaults={{ name: '', email: '', message: '' }}
            >
              <TextInput name="name" label="Your Name" />
              
              <TextInput name="email" label="Email Address" type="email" />
              
              <TextInput name="message" label="Your Message" />
              
              <Box sx={{ mt: 2 }}>
                <SubmitButton label="Send Greeting" />
              </Box>
            </Form>
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
              <Button label="Refresh" variant="outlined" size="small" onClick={fetchGreetings} />
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
import {
  makeContext, render, entrypoint, route, frontend, handler, BASE, HOME,
  entrypoints as baseEntrypoints
} from '@owlmeans/mui-panel'
import { createTheme } from '@mui/material/styles'
import { MainLayout } from './layout/main'
import HelloWorld from './components/HelloWorld'
import { clientConfig } from './config'
import { appEntrypoints } from '../shared/entrypoints'

// Custom Material-UI theme
const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' },
  },
  typography: {
    fontFamily: 'Roboto, Arial, sans-serif',
  },
})

// A screen is an entrypoint carrying a renderer — addressed by url(), never called over the wire.
// BASE renders the shared layout; HOME is its default child.
const screens = [
  entrypoint(route(BASE, '/', frontend()), handler(MainLayout)),
  entrypoint(route(HOME, '/', frontend({ default: true, parent: BASE })), handler(HelloWorld))
]

const context = makeContext(clientConfig)
context.registerEntrypoints([...baseEntrypoints, ...appEntrypoints, ...screens])
context.serviceRoute('hello-world-client', true)

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

1. **Unified Entrypoint System**: Shared route definitions between frontend and backend
2. **Automatic Validation**: AJV schemas enforced on both client and server
3. **Authentication Integration**: Built-in authentication guards and user management
4. **Material-UI Components**: Pre-styled, accessible UI components
5. **Type Safety**: Full TypeScript integration with shared types
6. **Context Management**: Dependency injection for services and configuration
7. **Error Handling**: Comprehensive error management and user feedback

This example showcases the power of OwlMeans Common's unified approach to fullstack development, where business logic, validation, and types are shared between frontend and backend, ensuring consistency and reducing duplication.

## 📦 **Complete Package Reference**

OwlMeans Common provides ~73 specialized packages organized into seven categories following the "quadra" architectural pattern. React Native packages live in the separate [owlmeans/native](https://github.com/owlmeans/native) monorepo.

> **Need the full dependency map?** See [`tree.md`](tree.md) — every package, its direct `@owlmeans/*` dependencies, its architecture layer, and the topological build order, including the two known dependency cycles.

### **⚙️ Configuration Packages (1 package)**
Shared build tooling and TypeScript configuration.

| Package | Description |
|---------|-------------|
| [`@owlmeans/dep-config`](packages/dep-config) | Shared TypeScript configurations (base, React) for all `@owlmeans` packages |

### **🏗️ Core Packages (33 packages)**
Foundational libraries providing environment-agnostic functionality.

| Package | Description |
|---------|-------------|
| [`@owlmeans/api`](packages/api) | HTTP API client library carrying entrypoint calls with automatic authentication |
| [`@owlmeans/basic-envelope`](packages/basic-envelope) | Lightweight cryptographic message envelope with Ed25519 signatures |
| [`@owlmeans/basic-ids`](packages/basic-ids) | Random and semi-random identifier generation utilities |
| [`@owlmeans/basic-keys`](packages/basic-keys) | Core cryptographic library for key pair generation and digital signing |
| [`@owlmeans/client`](packages/client) | Comprehensive React client library with routing and state management |
| [`@owlmeans/config`](packages/config) | Configuration management with merging, resources, and plugin integration |
| [`@owlmeans/context`](packages/context) | Dependency injection and management system for microservices |
| [`@owlmeans/did`](packages/did) | Decentralized Identity (DID) and cryptographic wallet management |
| [`@owlmeans/entrypoint`](packages/entrypoint) | URL unit system for fullstack route and component management |
| [`@owlmeans/error`](packages/error) | Fully typed error system for seamless frontend/backend error handling |
| [`@owlmeans/flow`](packages/flow) | Configurable user flow management with state transitions |
| [`@owlmeans/i18n`](packages/i18n) | Multi-level internationalization with namespace-based organization |
| [`@owlmeans/image-resource`](packages/image-resource) | Specialized image management for object storage systems |
| [`@owlmeans/kluster`](packages/kluster) | Kubernetes integration for cloud-native service discovery |
| [`@owlmeans/llm`](packages/llm) | LLM inference runtime: model, provider plugins (Anthropic/OpenAI/compatible), model factory, execution service |
| [`@owlmeans/llm-common`](packages/llm-common) | Serializable LLM inference and execution contracts (no langchain runtime) |
| [`@owlmeans/mongo`](packages/mongo) | MongoDB service integration with clustering and encryption |
| [`@owlmeans/mongo-resource`](packages/mongo-resource) | MongoDB resource implementation with schema validation |
| [`@owlmeans/oidc`](packages/oidc) | OpenID Connect integration with provider configuration |
| [`@owlmeans/payment`](packages/payment) | Payment system with product management and subscriptions |
| [`@owlmeans/postgres`](packages/postgres) | PostgreSQL service integration with pooling, readiness probing and least-privilege bootstrap |
| [`@owlmeans/postgres-resource`](packages/postgres-resource) | PostgreSQL resource implementation with schema-driven tables, auto structure sync and migrations |
| [`@owlmeans/queue`](packages/queue) | Job queues as resources, and the QUEUE route protocol that carries an entrypoint call over a broker |
| [`@owlmeans/redis`](packages/redis) | Redis service integration with clustering support |
| [`@owlmeans/redis-queue`](packages/redis-queue) | BullMQ-over-Redis driver for `@owlmeans/queue` — queues, workers, job graphs |
| [`@owlmeans/redis-resource`](packages/redis-resource) | Redis-based resource storage implementation |
| [`@owlmeans/resource`](packages/resource) | Abstract interfaces for database operations and data access |
| [`@owlmeans/route`](packages/route) | Cross-environment routing with URLs, permissions, and validations |
| [`@owlmeans/socket`](packages/socket) | WebSocket communication with RPC calls and authentication |
| [`@owlmeans/state`](packages/state) | Reactive state management with subscription-based reactivity |
| [`@owlmeans/static-resource`](packages/static-resource) | In-memory resource storage solution |
| [`@owlmeans/storage-common`](packages/storage-common) | Common interfaces for object storage systems |
| [`@owlmeans/storage-resource`](packages/storage-resource) | S3-compatible object storage with file management |
| [`@owlmeans/wled`](packages/wled) | Whitelabeling subsystem base types and entrypoints |

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
| [`@owlmeans/client-entrypoint`](packages/client-entrypoint) | Client-side entrypoint system — `call()`, `invoke()` and `url()` |
| [`@owlmeans/client-flow`](packages/client-flow) | Client-side user flow management with state persistence |
| [`@owlmeans/client-i18n`](packages/client-i18n) | React-based internationalization functionality |
| [`@owlmeans/client-panel`](packages/client-panel) | React panel library with UI components and form management |
| [`@owlmeans/client-payment`](packages/client-payment) | Client-side payment functionality |
| [`@owlmeans/client-resource`](packages/client-resource) | Client-side resource management with local database storage |
| [`@owlmeans/client-route`](packages/client-route) | Client-side routing extensions |
| [`@owlmeans/client-socket`](packages/client-socket) | Client-side WebSocket integration for real-time communication |
| [`@owlmeans/client-wl`](packages/client-wl) | Client-side whitelabeling functionality |

### **📱 Native Packages**
React Native implementations for mobile applications live in the **[owlmeans/native](https://github.com/owlmeans/native)** monorepo: `@owlmeans/native-client`, `@owlmeans/native-db`, `@owlmeans/native-panel`, `@owlmeans/native-router`.

### **🖥️ Server Packages (12 packages)**
Backend implementations for API services and business logic.

| Package | Description |
|---------|-------------|
| [`@owlmeans/server-api`](packages/server-api) | Server-side API framework built on Fastify with authentication |
| [`@owlmeans/server-app`](packages/server-app) | **🚀 Complete server application framework** - foundation for backend applications |
| [`@owlmeans/server-auth`](packages/server-auth) | Server-side authentication with Ed25519 verification and token management |
| [`@owlmeans/server-config`](packages/server-config) | Server-specific configuration utilities |
| [`@owlmeans/server-context`](packages/server-context) | Server-side context and dependency injection system |
| [`@owlmeans/server-entrypoint`](packages/server-entrypoint) | Server-side entrypoint system for HTTP request handling |
| [`@owlmeans/server-flow`](packages/server-flow) | Server-side flow management with persistence and API integrations |
| [`@owlmeans/server-oidc-provider`](packages/server-oidc-provider) | Complete OIDC identity provider service |
| [`@owlmeans/server-oidc-rp`](packages/server-oidc-rp) | Server-side OpenID Connect Relying Party functionality |
| [`@owlmeans/server-route`](packages/server-route) | Server-side routing with request matching and mount paths |
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
- **Mobile Applications**: Use packages from [owlmeans/native](https://github.com/owlmeans/native) — `@owlmeans/native-client`, `@owlmeans/native-panel`
- **Microservices**: Begin with [`@owlmeans/context`](packages/context) and [`@owlmeans/config`](packages/config)
- **Data Management**: Explore [`@owlmeans/resource`](packages/resource) with storage-specific implementations
- **Real-time Communication**: Use [`@owlmeans/socket`](packages/socket) with client/server implementations

### **Development Workflow**

1. **Design your entrypoints** using [`@owlmeans/entrypoint`](packages/entrypoint) for shared route definitions
2. **Configure your context** with [`@owlmeans/config`](packages/config) for dependency management
3. **Implement authentication** using the auth packages for security
4. **Build your API** with server packages for backend logic
5. **Create your UI** with web/native packages for user interfaces

## 📄 **License**

OwlMeans Common is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

**OwlMeans Common** — *Building the future of secure, scalable fullstack applications.*
