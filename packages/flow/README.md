# @owlmeans/flow

A configurable user flow management system for OwlMeans Common applications. This package provides a comprehensive framework for defining, managing, and executing multi-step user workflows with state management, transitions, and cross-service coordination.

## Overview

The `@owlmeans/flow` package is a workflow orchestration library in the OwlMeans Common ecosystem that enables:

- **Multi-Step Workflows**: Define complex user journeys with multiple steps and decision points
- **State Management**: Maintain flow state across steps and services
- **Cross-Service Coordination**: Coordinate workflows across different microservices
- **Configurable Transitions**: Define conditional transitions between workflow steps
- **Payload Management**: Handle data passing between workflow steps
- **Reversible Steps**: Support for backward navigation in workflows
- **Serialization**: Persistent workflow state through URL parameters or storage
- **Internationalization**: Built-in i18n support for workflow content

## Installation

```bash
npm install @owlmeans/flow
```

## Core Concepts

### Flow Definition

A flow is a structured definition of a multi-step process with:
- **Steps**: Individual stages in the workflow
- **Transitions**: Connections between steps with conditions
- **Configuration**: Global settings and service mappings
- **Payload Mapping**: Data transformation rules between steps

### Flow State

The current state of a workflow execution including:
- Current step
- Previous step (for reversible flows)
- Payload data
- Target service
- Status information

### Flow Model

A runtime instance that provides methods to:
- Navigate between steps
- Execute transitions
- Manage state and payload
- Serialize/deserialize flow state

## API Reference

### Types

#### `Flow`
Complete flow definition with configuration and prefabs.

```typescript
interface Flow extends ShallowFlow {
  config: FlowConfig
  prefabs: { [step: string]: string }
}
```

#### `ShallowFlow`
Basic flow structure without configuration.

```typescript
interface ShallowFlow {
  flow: string
  initialStep: string
  steps: { [key: string]: FlowStep }
}
```

#### `FlowStep`
Individual step definition in a workflow.

```typescript
interface FlowStep {
  index: number
  step: string
  service: string
  path?: string
  module?: string
  initial?: boolean
  payloadMap?: { [key: string]: number }
  transitions: { [key: string]: FlowTransition }
}
```

#### `FlowTransition`
Transition between workflow steps.

```typescript
interface FlowTransition {
  transition: string
  step: string
  explicit?: boolean      // User can choose this transition
  reversible?: boolean    // User can go back
}
```

#### `FlowState`
Current state of workflow execution.

```typescript
interface FlowState {
  flow: string
  step: string
  previous?: string
  entityId?: string | null
  service: string
  payload?: FlowPayload
  message?: string
  ok: boolean
}
```

#### `FlowConfig`
Global configuration for flow behavior.

```typescript
interface FlowConfig {
  queryParam?: string                    // URL parameter name for flow state
  services?: { [ref: string]: string }   // Service reference mappings
  modules?: { [ref: string]: string }    // Module reference mappings
  pathes?: { [ref: string]: string }     // Path reference mappings
  defaultFlow?: string                   // Default flow to use
}
```

#### `FlowModel`
Runtime workflow management interface.

```typescript
interface FlowModel {
  target: (service: string) => FlowModel
  entity: (entityId: string) => FlowModel
  enter: (step?: string) => FlowModel
  steps: (enter?: boolean) => FlowStep[]
  state: () => FlowState
  setState: (state: FlowState | null) => FlowModel
  payload: <T extends FlowPayload>() => T
  step: (step?: string) => FlowStep
  transitions: (explicit?: boolean) => FlowTransition[]
  transition: (transition: string) => FlowTransition
  next: () => FlowTransition
  transit: (transition: string, ok: boolean, message?: string | FlowPayload, payload?: FlowPayload) => string
  serialize: () => string
}
```

### Factory Functions

#### `makeFlowModel(flow: string | ShallowFlow, provider?: FlowProvider): Promise<FlowModel>`
Creates a flow model instance from flow definition or serialized state.

**Parameters:**
- `flow`: Flow name, definition, or serialized state
- `provider`: Optional flow provider function

**Returns:** Promise resolving to FlowModel instance

### Helper Functions

#### `flow<C>(cfg: C, flow: ShallowFlow): C`
Adds a flow definition to configuration.

#### `configureFlows<C>(cfg: C & WithFlowConfig, config: FlowConfig): C & WithFlowConfig`
Adds flow configuration to application config.

### Error Types

The package provides specialized error types for flow operations:

#### `FlowError`
Base error class for all flow-related errors.

#### `FlowUnsupported`
Error for unsupported flow operations.

#### `FlowTargetError`
Error related to flow target service issues.

#### `UnknownFlow`
Error when referenced flow doesn't exist.

#### `FlowStepError`
Base error for step-related issues.

#### `FlowStepMissconfigured`
Error for misconfigured flow steps.

#### `UnknownFlowStep`
Error when referenced step doesn't exist.

#### `UnknownTransition`
Error when referenced transition doesn't exist.

### Constants

```typescript
// Standard flow types
const STD_AUTH_FLOW = '_oa'      // Authentication flow
const STD_OIDC_FLOW = '_oidc'    // OIDC flow
const STD_STAB_FLOW = '_stb'     // Stabilization flow
const STD_OIDP_FLOW = '_oidp'    // OIDC Provider flow

// Configuration
const CFG_FLOW_PREFIX = 'flow'
const FLOW_RECORD = 'flow'
const TARGET_SERVICE = '-'
```

## Usage Examples

### Basic Flow Definition

```typescript
import { flow, makeFlowModel } from '@owlmeans/flow'

const registrationFlow: ShallowFlow = {
  flow: 'user-registration',
  initialStep: 'start',
  steps: {
    start: {
      index: 0,
      step: 'start',
      service: 'auth-service',
      path: '/register/start',
      initial: true,
      transitions: {
        next: { transition: 'next', step: 'credentials' },
        cancel: { transition: 'cancel', step: 'cancelled' }
      }
    },
    credentials: {
      index: 1,
      step: 'credentials',
      service: 'auth-service', 
      path: '/register/credentials',
      transitions: {
        submit: { transition: 'submit', step: 'verify' },
        back: { transition: 'back', step: 'start', reversible: true }
      }
    },
    verify: {
      index: 2,
      step: 'verify',
      service: 'auth-service',
      path: '/register/verify',
      transitions: {
        confirmed: { transition: 'confirmed', step: 'complete' },
        resend: { transition: 'resend', step: 'verify' }
      }
    },
    complete: {
      index: 3,
      step: 'complete',
      service: 'auth-service',
      path: '/register/complete',
      transitions: {}
    }
  }
}

// Add to configuration
const config = flow(baseConfig, registrationFlow)
```

### Flow Execution

```typescript
// Create flow model
const flowModel = await makeFlowModel('user-registration', flowProvider)

// Target a specific service
flowModel.target('auth-service')

// Set entity context
flowModel.entity('user123')

// Get current step
const currentStep = flowModel.step()
console.log(`Current step: ${currentStep.step}`)

// Get available transitions
const transitions = flowModel.transitions(true) // Only explicit transitions
console.log('Available actions:', transitions.map(t => t.transition))

// Execute transition
const nextState = flowModel.transit('submit', true, 'Success', { 
  username: 'john_doe',
  email: 'john@example.com' 
})

// Serialize state for URL or storage
const serializedState = flowModel.serialize()
```

### Flow State Management

```typescript
// Load from serialized state
const flowModel = await makeFlowModel(serializedState, flowProvider)

// Check if flow completed successfully
const state = flowModel.state()
if (state.ok && state.step === 'complete') {
  console.log('Registration completed successfully')
}

// Handle errors
if (!state.ok && state.message) {
  console.error('Flow error:', state.message)
}

// Access payload data
const payload = flowModel.payload<{username: string, email: string}>()
console.log('User data:', payload)
```

### Cross-Service Flow

```typescript
const crossServiceFlow: ShallowFlow = {
  flow: 'order-fulfillment',
  initialStep: 'create-order',
  steps: {
    'create-order': {
      index: 0,
      step: 'create-order',
      service: 'order-service',
      transitions: {
        created: { transition: 'created', step: 'process-payment' }
      }
    },
    'process-payment': {
      index: 1,
      step: 'process-payment',
      service: 'payment-service',
      transitions: {
        paid: { transition: 'paid', step: 'ship-order' },
        failed: { transition: 'failed', step: 'payment-failed' }
      }
    },
    'ship-order': {
      index: 2,
      step: 'ship-order',
      service: 'shipping-service',
      transitions: {
        shipped: { transition: 'shipped', step: 'complete' }
      }
    }
  }
}
```

### Configuration Setup

```typescript
import { configureFlows } from '@owlmeans/flow'

const config = configureFlows(baseConfig, {
  queryParam: 'flow',
  defaultFlow: 'user-registration',
  services: {
    auth: 'auth-service',
    payment: 'payment-service'
  },
  modules: {
    login: 'auth:login',
    register: 'auth:register'
  },
  pathes: {
    home: '/dashboard',
    login: '/auth/login'
  }
})
```

### Flow Provider Implementation

```typescript
import { FlowProvider } from '@owlmeans/flow'

const flowProvider: FlowProvider = async (flowName: string) => {
  // Load from database, configuration, or static definitions
  const flowRecord = await flowRepository.get(flowName)
  
  return {
    ...flowRecord,
    config: {
      queryParam: 'f',
      services: { auth: 'auth-service' }
    },
    prefabs: {
      start: 'welcome-template',
      complete: 'success-template'
    }
  }
}
```

### Error Handling

```typescript
import { UnknownFlow, FlowStepError } from '@owlmeans/flow'

try {
  const flowModel = await makeFlowModel('unknown-flow', flowProvider)
} catch (error) {
  if (error instanceof UnknownFlow) {
    console.error('Flow not found')
  } else if (error instanceof FlowStepError) {
    console.error('Step configuration error:', error.message)
  }
}
```

## Advanced Features

### Payload Mapping

Configure how data flows between steps:

```typescript
const step: FlowStep = {
  index: 1,
  step: 'credentials',
  service: 'auth-service',
  payloadMap: {
    username: 0,    // Map to first payload parameter
    email: 1,       // Map to second payload parameter  
    phone: 2        // Map to third payload parameter
  },
  transitions: { /* ... */ }
}
```

### Conditional Transitions

Implement business logic in transitions:

```typescript
const flowModel = await makeFlowModel(flow, flowProvider)

// Custom transition logic
const canProceed = await validateUserInput(payload)
const nextState = flowModel.transit(
  canProceed ? 'submit' : 'error',
  canProceed,
  canProceed ? 'Validation passed' : 'Please fix errors'
)
```

### URL-Based Flow State

```typescript
// Extract flow state from URL
const urlParams = new URLSearchParams(window.location.search)
const flowState = urlParams.get('flow')

if (flowState) {
  const flowModel = await makeFlowModel(flowState, flowProvider)
  // Resume flow from URL state
}

// Update URL with current flow state
const currentState = flowModel.serialize()
const newUrl = `${window.location.pathname}?flow=${currentState}`
window.history.pushState({}, '', newUrl)
```

## Integration with OwlMeans Ecosystem

The `@owlmeans/flow` package integrates with:

- **@owlmeans/config**: Configuration management and record storage
- **@owlmeans/error**: Resilient error handling system
- **@owlmeans/resource**: Flow state persistence and retrieval
- **@owlmeans/i18n**: Internationalization for flow content
- **@owlmeans/client-flow**: Client-side flow execution
- **@owlmeans/server-flow**: Server-side flow management
- **@owlmeans/web-flow**: Web-specific flow features

## Best Practices

### Flow Design
- Keep steps focused on single responsibilities
- Design for both forward and backward navigation
- Use meaningful step and transition names
- Plan for error scenarios and recovery paths

### State Management
- Minimize payload size for URL serialization
- Use appropriate TTL for flow state persistence
- Handle state corruption gracefully
- Implement proper cleanup for abandoned flows

### Security
- Validate payload data at each step
- Implement proper authorization for step access
- Sanitize flow state when exposing in URLs
- Use secure channels for sensitive flow data

### Performance
- Cache flow definitions for better performance
- Implement efficient flow provider lookups
- Use pagination for large step lists
- Optimize serialization for large payloads

Fixes #32.