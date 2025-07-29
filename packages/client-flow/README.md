# @owlmeans/client-flow

Client-side configurable user flow management library for OwlMeans Common applications. This package provides a comprehensive system for implementing complex user workflows, authentication flows, and multi-step processes in React applications with state persistence and navigation integration.

## Overview

The `@owlmeans/client-flow` package extends the base `@owlmeans/flow` package with client-specific functionality. It provides:

- **Client Flow Management**: Complete client-side implementation of configurable user flows
- **State Persistence**: Automatic flow state persistence across browser sessions
- **Navigation Integration**: Seamless integration with React Router navigation
- **Authentication Flows**: Pre-built authentication and authorization workflows
- **Service Integration**: Integration with OwlMeans service and module systems
- **React Components**: Flow-aware components and hooks for React applications
- **Configuration Management**: Dynamic flow configuration from external sources
- **Error Handling**: Robust error handling and recovery mechanisms

This package is part of the OwlMeans flow management quadra:
- **@owlmeans/flow**: Common flow interfaces and utilities
- **@owlmeans/client-flow**: Client-side flow implementation *(this package)*
- **@owlmeans/web-flow**: Web-specific flow components and utilities
- **@owlmeans/server-flow**: Server-side flow processing

## Installation

```bash
npm install @owlmeans/client-flow react
```

## Core Concepts

### Flow Models
Flows are state machines that guide users through multi-step processes. Each flow consists of steps, transitions, and conditions that determine the user's path.

### Flow States
Flow states represent the current position in a workflow and are automatically persisted to survive browser sessions and page reloads.

### Flow Service
The central service that manages flow lifecycle, state transitions, and integration with other application services.

### Flow Client
A client-side wrapper that provides an easy-to-use interface for flow operations with navigation integration.

## API Reference

### Factory Functions

#### `makeBasicFlowService(alias?: string): FlowService`

Creates a flow service instance for managing client-side flows.

```typescript
import { makeBasicFlowService } from '@owlmeans/client-flow'

const flowService = makeBasicFlowService('user-flows')
```

**Parameters:**
- `alias`: string (optional) - Service alias for registration, defaults to 'flow'

**Returns:** FlowService instance ready for registration with context

#### `createFlowClient<C, T>(context: T, nav: Navigator): FlowClient`

Creates a flow client that integrates flows with navigation and context.

```typescript
import { createFlowClient } from '@owlmeans/client-flow'
import { useContext, useNavigate } from '@owlmeans/client'

const context = useContext()
const navigator = useNavigate()
const flowClient = createFlowClient(context, navigator)
```

**Parameters:**
- `context`: T - Application context with flow service
- `nav`: Navigator - Navigation service for routing integration

**Returns:** FlowClient instance for flow operations

### Core Interfaces

#### `FlowService`

Main service interface for flow management and lifecycle operations.

```typescript
interface FlowService extends LazyService {
  supplied: Promise<boolean>                          // Flow availability promise
  flow: FlowModel | null                             // Current active flow
  
  // Flow operations
  state(): Promise<FlowModel | null>                 // Get current flow state
  begin(slug?: string, from?: string): Promise<FlowModel>  // Start new flow
  load(flow: string): Promise<FlowModel>             // Load existing flow
  proceed(req?, dryRun?): Promise<string>            // Proceed to next step
  
  // Configuration and providers
  config(): FlowConfig                               // Get flow configuration
  provideFlow: FlowProvider                          // Flow provider function
  resolvePair(): ResolvePair                         // Promise resolution pair
}
```

#### `FlowClient`

Client-side flow wrapper with navigation and persistence integration.

```typescript
interface FlowClient {
  boot(target?: string, from?: string): Promise<FlowClient>     // Initialize flow client
  setup(flow: FlowModel): FlowClient                            // Setup with existing flow
  flow(): FlowModel                                             // Get current flow model
  service(): ResolvedServiceRoute                               // Get target service route
  proceed(transition: FlowTransition, req?): Promise<void>      // Execute transition
  persist(): Promise<boolean>                                   // Persist current state
}
```

#### `StateRecord`

Interface for flow state persistence records.

```typescript
interface StateRecord extends ResourceRecord, FlowState {
  id: string                    // Record identifier
  flow: string                  // Flow type identifier
  step: string                  // Current step identifier
  service: string               // Target service
  data: any                     // Flow-specific data
  // ... other FlowState properties
}
```

#### `StateResource`

Resource interface for managing flow state persistence.

```typescript
interface StateResource extends ClientResource<StateRecord> {
  // Inherits all standard resource methods for CRUD operations
}
```

### Flow Service Methods Detailed Reference

#### `state(): Promise<FlowModel | null>`

**Purpose**: Retrieves the current active flow model

**Behavior**:
- Waits for flow service to be supplied/ready
- Returns the currently active flow or null if no flow is active
- Used to check flow status before operations

**Usage**: Checking if a flow is currently active

```typescript
const flowService = context.service<FlowService>('flow')

const currentFlow = await flowService.state()
if (currentFlow) {
  console.log('Active flow:', currentFlow.name)
  console.log('Current step:', currentFlow.step())
} else {
  console.log('No active flow')
}
```

#### `begin(slug?: string, from?: string): Promise<FlowModel>`

**Purpose**: Starts a new flow with the specified configuration

**Behavior**:
- Creates a new flow model based on the slug
- Sets the service as supplied/ready
- Enters the flow from the specified step or initial step
- Returns the active flow model

**Usage**: Starting authentication, registration, or other workflows

**Parameters**:
- `slug`: string (optional) - Flow identifier, defaults to config.defaultFlow or STD_AUTH_FLOW
- `from`: string (optional) - Starting step, defaults to flow's initial step

```typescript
const flowService = context.service<FlowService>('flow')

// Start default authentication flow
const authFlow = await flowService.begin()

// Start specific flow from specific step
const registrationFlow = await flowService.begin('user-registration', 'email-verification')

// Start flow with default slug
const defaultFlow = await flowService.begin('custom-onboarding')
```

#### `load(flow: string): Promise<FlowModel>`

**Purpose**: Loads and activates a flow from serialized state

**Behavior**:
- Recreates flow model from serialized state string
- Sets the service as supplied/ready
- Restores flow to its previous state
- Returns the restored flow model

**Usage**: Restoring flows from persistent storage

```typescript
const flowService = context.service<FlowService>('flow')

// Load flow from saved state
const savedFlowState = localStorage.getItem('flow-state')
if (savedFlowState) {
  const restoredFlow = await flowService.load(savedFlowState)
  console.log('Flow restored to step:', restoredFlow.step())
}
```

#### `proceed(req?: Partial<AbstractRequest>, dryRun?: boolean): Promise<string>`

**Purpose**: Advances the flow to the next step based on conditions

**Behavior**:
- Evaluates current step's transitions and conditions
- Moves to the next appropriate step
- Throws FlowUnsupported error (not implemented in basic service)
- Should be overridden in specific implementations

**Usage**: Advancing through flow steps

**Note**: The basic service throws `FlowUnsupported` - this should be implemented by specific flow implementations

```typescript
// This would be implemented in a specific flow service
const nextStep = await flowService.proceed({
  body: { userInput: 'some-data' }
})
```

#### `config(): FlowConfig`

**Purpose**: Retrieves the current flow configuration

**Behavior**:
- Accesses flow configuration from context
- Returns default empty config if not configured
- Used for flow behavior customization

**Usage**: Accessing flow settings and configuration

```typescript
const flowService = context.service<FlowService>('flow')

const config = flowService.config()
console.log('Default flow:', config.defaultFlow)
console.log('Available services:', config.services)
```

### Flow Client Methods Detailed Reference

#### `boot(target?: string, from?: string): Promise<FlowClient>`

**Purpose**: Initializes the flow client with optional target service and starting point

**Behavior**:
- Waits for flow service to be ready
- Attempts to restore flow from persistent storage
- Creates new flow if no saved state exists
- Sets target service if provided
- Returns the initialized client

**Usage**: Starting the flow system in your application

```typescript
const flowClient = createFlowClient(context, navigator)

// Boot with specific target service
await flowClient.boot('user-dashboard', 'login-step')

// Boot with default behavior
await flowClient.boot()

// Boot without target, from saved state
await flowClient.boot(null)
```

#### `setup(flow: FlowModel): FlowClient`

**Purpose**: Configures the client with an existing flow model

**Behavior**:
- Sets the provided flow as the active flow
- Returns the client for method chaining
- Used when you already have a flow model

**Usage**: Using pre-configured flow models

```typescript
const existingFlow = await flowService.begin('checkout-flow')
const flowClient = createFlowClient(context, navigator)
  .setup(existingFlow)
```

#### `flow(): FlowModel`

**Purpose**: Returns the current active flow model

**Behavior**: Direct access to the underlying flow model

**Usage**: Accessing flow state and methods

```typescript
const currentFlow = flowClient.flow()
console.log('Current step:', currentFlow.step())
console.log('Flow data:', currentFlow.data())
```

#### `service(): ResolvedServiceRoute`

**Purpose**: Returns the resolved service route for the target service

**Behavior**: 
- Resolves the target service from the context
- Returns route information for navigation

**Usage**: Getting service routing information

```typescript
const serviceRoute = flowClient.service()
console.log('Target service:', serviceRoute.service)
console.log('Service path:', serviceRoute.path)
```

#### `proceed(transition: FlowTransition, req?: Partial<AbstractRequest>): Promise<void>`

**Purpose**: Executes a flow transition with optional request data

**Behavior**:
- Executes the specified transition
- Passes request data to the transition handler
- Updates flow state based on transition result
- Handles navigation if required

**Usage**: Moving between flow steps

```typescript
await flowClient.proceed('next', {
  body: { formData: userData }
})

await flowClient.proceed('back')

await flowClient.proceed('submit', {
  params: { id: userId }
})
```

#### `persist(): Promise<boolean>`

**Purpose**: Saves the current flow state to persistent storage

**Behavior**:
- Serializes current flow state
- Saves to flow state resource
- Returns success status

**Usage**: Saving flow progress

```typescript
const saved = await flowClient.persist()
if (saved) {
  console.log('Flow state saved successfully')
} else {
  console.log('Failed to save flow state')
}
```

### Constants

#### `DEFAULT_ALIAS`
Default flow service alias (`'flow'`).

#### `FLOW_STATE`
Resource identifier for flow state persistence (`'state:flow'`).

#### `REHACK_MOD`
Internal module identifier for redirects (`'__redirect'`).

## Usage Examples

### Basic Flow Setup

```typescript
import { makeBasicFlowService, createFlowClient } from '@owlmeans/client-flow'
import { makeClientContext, useContext } from '@owlmeans/client'

// Create context with flow service
const context = makeClientContext(config)
const flowService = makeBasicFlowService()
context.registerService(flowService)

// Initialize context
await context.configure().init()

// Create flow client
function MyFlowComponent() {
  const context = useContext()
  const navigator = useNavigate()
  
  const [flowClient, setFlowClient] = useState(null)
  
  useEffect(() => {
    const initFlow = async () => {
      const client = createFlowClient(context, navigator)
      await client.boot('user-onboarding')
      setFlowClient(client)
    }
    
    initFlow()
  }, [])
  
  return flowClient ? <FlowRenderer client={flowClient} /> : <div>Loading...</div>
}
```

### Authentication Flow Implementation

```typescript
import { makeBasicFlowService } from '@owlmeans/client-flow'
import { STD_AUTH_FLOW } from '@owlmeans/flow'

// Setup authentication flow
const context = makeClientContext({
  service: 'my-app',
  // ... other config
  flowConfig: {
    defaultFlow: STD_AUTH_FLOW,
    services: {
      auth: 'authentication-service',
      dashboard: 'user-dashboard'
    },
    modules: {
      login: 'auth-login-module',
      register: 'auth-register-module'
    }
  }
})

const flowService = makeBasicFlowService('auth-flow')
context.registerService(flowService)

// Use in component
function AuthFlow() {
  const context = useContext()
  const navigator = useNavigate()
  const [currentStep, setCurrentStep] = useState(null)
  
  useEffect(() => {
    const startAuthFlow = async () => {
      const client = createFlowClient(context, navigator)
      await client.boot('dashboard', 'login')
      
      const flow = client.flow()
      setCurrentStep(flow.step())
    }
    
    startAuthFlow()
  }, [])
  
  const handleLogin = async (credentials) => {
    const client = createFlowClient(context, navigator)
    await client.proceed('authenticate', {
      body: credentials
    })
    
    // Persist progress
    await client.persist()
    
    // Update current step
    setCurrentStep(client.flow().step())
  }
  
  return (
    <div>
      <h2>Authentication Flow</h2>
      <p>Current Step: {currentStep}</p>
      {currentStep === 'login' && <LoginForm onSubmit={handleLogin} />}
      {currentStep === 'verified' && <Navigate to="/dashboard" />}
    </div>
  )
}
```

### Multi-Step Registration Flow

```typescript
interface RegistrationData {
  personalInfo: { name: string; email: string }
  preferences: { theme: string; notifications: boolean }
  verification: { code: string }
}

function RegistrationFlow() {
  const context = useContext()
  const navigator = useNavigate()
  const [flowClient, setFlowClient] = useState<FlowClient | null>(null)
  const [registrationData, setRegistrationData] = useState<Partial<RegistrationData>>({})
  
  useEffect(() => {
    const initRegistration = async () => {
      const client = createFlowClient(context, navigator)
      await client.boot('user-registration', 'personal-info')
      setFlowClient(client)
    }
    
    initRegistration()
  }, [])
  
  const proceedToNext = async (stepData: any) => {
    if (!flowClient) return
    
    // Update registration data
    const updatedData = { ...registrationData, ...stepData }
    setRegistrationData(updatedData)
    
    // Proceed to next step
    await flowClient.proceed('next', {
      body: updatedData
    })
    
    // Persist state
    await flowClient.persist()
  }
  
  const getCurrentStep = () => {
    return flowClient?.flow().step() || 'loading'
  }
  
  const renderCurrentStep = () => {
    const step = getCurrentStep()
    
    switch (step) {
      case 'personal-info':
        return <PersonalInfoForm onSubmit={proceedToNext} />
      case 'preferences':
        return <PreferencesForm onSubmit={proceedToNext} />
      case 'verification':
        return <VerificationForm onSubmit={proceedToNext} />
      case 'complete':
        return <RegistrationComplete />
      default:
        return <div>Loading...</div>
    }
  }
  
  return (
    <div>
      <h2>Registration Flow</h2>
      <div>Step: {getCurrentStep()}</div>
      {renderCurrentStep()}
    </div>
  )
}
```

### Flow State Persistence

```typescript
import { appendClientResource } from '@owlmeans/client-resource'
import { FLOW_STATE } from '@owlmeans/client-flow'

// Setup flow state resource
appendClientResource(context, FLOW_STATE)

class FlowStateManager {
  constructor(private context: ClientContext) {}
  
  async saveFlowState(flowClient: FlowClient): Promise<boolean> {
    try {
      const flow = flowClient.flow()
      const stateResource = this.context.resource<StateResource>(FLOW_STATE)
      
      await stateResource.save({
        id: FLOW_STATE,
        flow: flow.name,
        step: flow.step(),
        service: flowClient.service().service,
        data: flow.data(),
        timestamp: new Date()
      })
      
      return true
    } catch (error) {
      console.error('Failed to save flow state:', error)
      return false
    }
  }
  
  async loadFlowState(): Promise<StateRecord | null> {
    try {
      const stateResource = this.context.resource<StateResource>(FLOW_STATE)
      return await stateResource.load(FLOW_STATE)
    } catch (error) {
      console.error('Failed to load flow state:', error)
      return null
    }
  }
  
  async clearFlowState(): Promise<void> {
    try {
      const stateResource = this.context.resource<StateResource>(FLOW_STATE)
      await stateResource.delete(FLOW_STATE)
    } catch (error) {
      console.error('Failed to clear flow state:', error)
    }
  }
}

// Usage
const stateManager = new FlowStateManager(context)

// Auto-save flow state
const flowClient = createFlowClient(context, navigator)
await flowClient.boot()

// Save state after each step
await stateManager.saveFlowState(flowClient)

// Restore on application start
const savedState = await stateManager.loadFlowState()
if (savedState) {
  const flowService = context.service<FlowService>('flow')
  const restoredFlow = await flowService.begin(savedState.flow)
  restoredFlow.setState(savedState)
}
```

### Custom Flow Service

```typescript
import { makeBasicFlowService } from '@owlmeans/client-flow'

class CustomFlowService extends makeBasicFlowService('custom') {
  async proceed(req?: Partial<AbstractRequest>, dryRun?: boolean): Promise<string> {
    if (!this.flow) {
      throw new Error('No active flow')
    }
    
    const currentStep = this.flow.step()
    const transitions = this.flow.transitions()
    
    // Custom logic for determining next step
    let nextStep = 'default'
    
    if (req?.body?.action === 'skip') {
      nextStep = this.findSkipTransition(transitions)
    } else if (req?.body?.action === 'back') {
      nextStep = this.findBackTransition(transitions)
    } else {
      nextStep = this.findNextTransition(transitions, req)
    }
    
    if (!dryRun) {
      await this.flow.transition(nextStep, req)
    }
    
    return nextStep
  }
  
  private findNextTransition(transitions: any[], req?: any): string {
    // Implement custom transition logic
    return transitions[0]?.target || 'end'
  }
  
  private findSkipTransition(transitions: any[]): string {
    return transitions.find(t => t.type === 'skip')?.target || 'end'
  }
  
  private findBackTransition(transitions: any[]): string {
    return transitions.find(t => t.type === 'back')?.target || 'start'
  }
}

// Register custom service
const customFlowService = new CustomFlowService()
context.registerService(customFlowService)
```

### Flow-Aware React Hook

```typescript
import { useState, useEffect } from 'react'
import { useContext } from '@owlmeans/client'

interface UseFlowResult {
  flowClient: FlowClient | null
  currentStep: string | null
  isLoading: boolean
  proceed: (action: string, data?: any) => Promise<void>
  persist: () => Promise<boolean>
}

export function useFlow(flowType?: string, targetService?: string): UseFlowResult {
  const context = useContext()
  const navigator = useNavigate()
  const [flowClient, setFlowClient] = useState<FlowClient | null>(null)
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    const initFlow = async () => {
      try {
        const client = createFlowClient(context, navigator)
        await client.boot(targetService)
        
        if (flowType) {
          const flowService = context.service<FlowService>('flow')
          const flow = await flowService.begin(flowType)
          client.setup(flow)
        }
        
        setFlowClient(client)
        setCurrentStep(client.flow().step())
      } catch (error) {
        console.error('Flow initialization failed:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    initFlow()
  }, [flowType, targetService])
  
  const proceed = async (action: string, data?: any) => {
    if (!flowClient) return
    
    await flowClient.proceed(action, { body: data })
    setCurrentStep(flowClient.flow().step())
  }
  
  const persist = async (): Promise<boolean> => {
    if (!flowClient) return false
    return await flowClient.persist()
  }
  
  return {
    flowClient,
    currentStep,
    isLoading,
    proceed,
    persist
  }
}

// Usage in component
function FlowBasedComponent() {
  const { currentStep, isLoading, proceed, persist } = useFlow('onboarding', 'dashboard')
  
  if (isLoading) {
    return <div>Initializing flow...</div>
  }
  
  const handleNext = async (data: any) => {
    await proceed('next', data)
    await persist()
  }
  
  return (
    <div>
      <h3>Current Step: {currentStep}</h3>
      {currentStep === 'welcome' && <WelcomeStep onNext={handleNext} />}
      {currentStep === 'setup' && <SetupStep onNext={handleNext} />}
      {currentStep === 'complete' && <CompleteStep />}
    </div>
  )
}
```

## Error Handling

The package integrates with the OwlMeans error system and may throw the following errors:

### `FlowUnsupported`
Thrown when an unsupported flow operation is attempted.

### `UnknownFlow`
Thrown when trying to access a flow that hasn't been registered.

### `FlowTargetError`
Thrown when the target service for a flow cannot be resolved.

### `FlowStepMissconfigured`
Thrown when flow steps are not properly configured.

```typescript
import { FlowUnsupported, UnknownFlow, FlowTargetError } from '@owlmeans/flow'

const handleFlowError = async () => {
  try {
    await flowClient.proceed('invalid-transition')
  } catch (error) {
    if (error instanceof FlowUnsupported) {
      console.error('Flow operation not supported')
    } else if (error instanceof UnknownFlow) {
      console.error('Flow not found:', error.message)
    } else if (error instanceof FlowTargetError) {
      console.error('Invalid flow target:', error.message)
    }
  }
}
```

## Integration with Other Packages

### Authentication Integration
```typescript
import { makeAuthService } from '@owlmeans/client-auth'
import { makeBasicFlowService } from '@owlmeans/client-flow'

// Setup authentication flow
const context = makeClientContext(config)
const authService = makeAuthService()
const flowService = makeBasicFlowService()

context.registerService(authService)
context.registerService(flowService)
```

### Resource Integration
```typescript
import { appendClientResource } from '@owlmeans/client-resource'
import { FLOW_STATE } from '@owlmeans/client-flow'

// Setup flow state persistence
appendClientResource(context, FLOW_STATE)
```

### Navigation Integration
```typescript
import { useNavigate } from '@owlmeans/client'
import { createFlowClient } from '@owlmeans/client-flow'

const navigator = useNavigate()
const flowClient = createFlowClient(context, navigator)
```

## Best Practices

1. **State Persistence**: Always persist flow state for long-running processes
2. **Error Handling**: Implement comprehensive error handling for flow operations
3. **Flow Design**: Design flows with clear steps and transition conditions
4. **Service Integration**: Properly configure target services for flows
5. **React Integration**: Use hooks for clean React component integration
6. **Testing**: Test flow transitions and error conditions thoroughly
7. **Configuration**: Use external configuration for flexible flow behavior

## Dependencies

This package depends on:
- `@owlmeans/flow` - Core flow interfaces and utilities
- `@owlmeans/client-context` - Client context management
- `@owlmeans/client-module` - Client module system
- `@owlmeans/client-resource` - Client resource management
- `@owlmeans/context` - Core context system
- `react` - React library (peer dependency)

## Related Packages

- [`@owlmeans/flow`](../flow) - Core flow system
- [`@owlmeans/web-flow`](../web-flow) - Web-specific flow components
- [`@owlmeans/server-flow`](../server-flow) - Server-side flow processing
- [`@owlmeans/client-auth`](../client-auth) - Authentication with flow integration
- [`@owlmeans/client`](../client) - Base React client library