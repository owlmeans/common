# @owlmeans/web-flow

Web-specific flow management library for OwlMeans Common applications. This package extends `@owlmeans/client-flow` with web browser-specific functionality including URL-based flow state management, browser navigation integration, and query parameter handling.

## Overview

The `@owlmeans/web-flow` package provides web-specific implementations of the OwlMeans flow system. It offers:

- **URL-Based Flow State**: Flow state management through browser URLs and query parameters
- **Browser Navigation**: Integration with browser history and navigation APIs
- **Resource Persistence**: Web-specific flow state persistence using browser storage
- **Query Parameter Management**: Automatic flow state serialization in URL parameters
- **Module Integration**: Enhanced module integration for web-based flow transitions
- **Client-Side Routing**: Seamless integration with React Router for flow navigation

This package is part of the OwlMeans flow management quadra:
- **@owlmeans/flow**: Common flow interfaces and utilities
- **@owlmeans/client-flow**: Client-side flow implementation
- **@owlmeans/web-flow**: Web-specific flow implementation *(this package)*
- **@owlmeans/server-flow**: Server-side flow processing

## Installation

```bash
npm install @owlmeans/web-flow react react-router-dom
```

## Core Concepts

### Web Flow Service
Extends the basic flow service with web-specific capabilities like URL management and browser navigation.

### URL State Management
Flow state is automatically serialized and stored in URL query parameters, allowing flows to survive page reloads and be shareable.

### Browser Integration
Full integration with browser APIs for navigation, history management, and URL manipulation.

## API Reference

### Factory Functions

#### `makeFlowService(alias?: string): FlowService`

Creates a web-specific flow service with enhanced browser integration.

```typescript
import { makeFlowService } from '@owlmeans/web-flow'

const webFlowService = makeFlowService('web-flow')
```

**Parameters:**
- `alias`: string (optional) - Service alias for registration, defaults to 'flow'

**Returns:** Enhanced FlowService with web-specific capabilities

#### `appendWebFlowService<C, T>(context: T, alias?: string): T`

Appends a web flow service to the application context with necessary resource setup.

```typescript
import { appendWebFlowService } from '@owlmeans/web-flow'
import { makeClientContext } from '@owlmeans/client-context'

const context = makeClientContext(config)
appendWebFlowService(context)
```

**Parameters:**
- `context`: T - The client context to append the service to
- `alias`: string (optional) - Service alias, defaults to 'flow'

**Returns:** Enhanced context with web flow service and resources

### Enhanced Methods

#### `proceed(req?: Partial<AbstractRequest>, dryRun?: boolean): Promise<string>`

Web-specific implementation of flow progression with URL management.

**Behavior**:
- Calls the appropriate module for the current flow step
- Serializes flow state into URL query parameters
- Handles browser navigation and URL updates
- Integrates with React Router for seamless transitions

**Usage**: Advancing through flow steps with automatic URL updates

```typescript
const webFlowService = context.service<FlowService>('flow')

// Proceed to next step with automatic URL update
await webFlowService.proceed({
  body: { userInput: 'data' }
})
```

### Configuration

#### Flow Configuration Options

```typescript
interface WebFlowConfig extends FlowConfig {
  queryParam?: string    // URL query parameter name for flow state
}
```

### Constants

#### `QUERY_PARAM`
Default query parameter name for flow state (`'flow'`).

## Usage Examples

### Basic Web Flow Setup

```typescript
import { appendWebFlowService } from '@owlmeans/web-flow'
import { makeClientContext } from '@owlmeans/client-context'

// Create context with web flow
const context = makeClientContext({
  service: 'my-web-app',
  flowConfig: {
    defaultFlow: 'user-onboarding',
    queryParam: 'state'  // Custom query parameter name
  }
})

appendWebFlowService(context)

// Initialize
await context.configure().init()
```

### URL-Aware Flow Component

```typescript
import { useContext } from '@owlmeans/client'
import { useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'

function WebFlowComponent() {
  const context = useContext()
  const [searchParams] = useSearchParams()
  const [currentStep, setCurrentStep] = useState(null)
  
  useEffect(() => {
    const initFlow = async () => {
      const flowService = context.service('flow')
      
      // Check if flow state exists in URL
      const flowState = searchParams.get('flow')
      let flow
      
      if (flowState) {
        // Restore flow from URL parameter
        flow = await flowService.load(flowState)
      } else {
        // Start new flow
        flow = await flowService.begin('user-onboarding')
      }
      
      setCurrentStep(flow.step())
    }
    
    initFlow()
  }, [searchParams])
  
  const handleNext = async () => {
    const flowService = context.service('flow')
    await flowService.proceed({ action: 'next' })
    
    // Flow state is automatically updated in URL
    const updatedFlow = await flowService.state()
    setCurrentStep(updatedFlow?.step())
  }
  
  return (
    <div>
      <h2>Current Step: {currentStep}</h2>
      <button onClick={handleNext}>Next Step</button>
    </div>
  )
}
```

### Shareable Flow URLs

```typescript
function ShareableFlow() {
  const context = useContext()
  
  const getShareableURL = async () => {
    const flowService = context.service('flow')
    const flow = await flowService.state()
    
    if (flow) {
      const currentURL = new URL(window.location.href)
      currentURL.searchParams.set('flow', flow.serialize())
      return currentURL.toString()
    }
    
    return window.location.href
  }
  
  const handleShare = async () => {
    const shareableURL = await getShareableURL()
    
    if (navigator.share) {
      await navigator.share({
        title: 'Continue Flow',
        url: shareableURL
      })
    } else {
      // Fallback to clipboard
      await navigator.clipboard.writeText(shareableURL)
      alert('URL copied to clipboard!')
    }
  }
  
  return (
    <button onClick={handleShare}>
      Share Flow Progress
    </button>
  )
}
```

### Browser Navigation Integration

```typescript
import { useNavigate, useLocation } from 'react-router-dom'
import { useContext } from '@owlmeans/client'

function NavigationAwareFlow() {
  const context = useContext()
  const navigate = useNavigate()
  const location = useLocation()
  
  useEffect(() => {
    // Listen for browser back/forward navigation
    const handlePopState = async () => {
      const flowService = context.service('flow')
      const searchParams = new URLSearchParams(location.search)
      const flowState = searchParams.get('flow')
      
      if (flowState) {
        await flowService.load(flowState)
      }
    }
    
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [location])
  
  const proceedToStep = async (stepName: string) => {
    const flowService = context.service('flow')
    await flowService.proceed({ target: stepName })
    
    // Navigation is handled automatically by the web flow service
  }
  
  return (
    <div>
      <button onClick={() => proceedToStep('step1')}>Go to Step 1</button>
      <button onClick={() => proceedToStep('step2')}>Go to Step 2</button>
      <button onClick={() => navigate(-1)}>Browser Back</button>
    </div>
  )
}
```

### Custom Query Parameter Configuration

```typescript
const context = makeClientContext({
  service: 'custom-app',
  flowConfig: {
    defaultFlow: 'checkout',
    queryParam: 'checkout-state',  // Custom parameter name
    services: {
      payment: 'payment-service',
      shipping: 'shipping-service'
    }
  }
})

appendWebFlowService(context)

// URLs will look like: /checkout?checkout-state=serialized-flow-data
```

### Flow State Persistence

```typescript
class WebFlowManager {
  constructor(private context: ClientContext) {}
  
  async saveFlowToURL(): Promise<string> {
    const flowService = this.context.service('flow')
    const flow = await flowService.state()
    
    if (flow) {
      const url = new URL(window.location.href)
      url.searchParams.set('flow', flow.serialize())
      
      // Update browser URL without navigation
      window.history.replaceState({}, '', url.toString())
      
      return url.toString()
    }
    
    return window.location.href
  }
  
  async loadFlowFromURL(): Promise<boolean> {
    const searchParams = new URLSearchParams(window.location.search)
    const flowState = searchParams.get('flow')
    
    if (flowState) {
      const flowService = this.context.service('flow')
      await flowService.load(flowState)
      return true
    }
    
    return false
  }
  
  clearFlowFromURL(): void {
    const url = new URL(window.location.href)
    url.searchParams.delete('flow')
    window.history.replaceState({}, '', url.toString())
  }
}

// Usage
const flowManager = new WebFlowManager(context)

// Save current flow state to URL
await flowManager.saveFlowToURL()

// Restore flow from URL on page load
const restored = await flowManager.loadFlowFromURL()
```

## Integration with React Router

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { appendWebFlowService } from '@owlmeans/web-flow'

function App() {
  const context = makeClientContext(config)
  appendWebFlowService(context)
  
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/flow/*" element={<FlowRoutes />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

function FlowRoutes() {
  const context = useContext()
  const [searchParams] = useSearchParams()
  
  // Flow state is automatically managed through URL
  const flowState = searchParams.get('flow')
  
  return (
    <div>
      {flowState ? (
        <ActiveFlowComponent />
      ) : (
        <StartFlowComponent />
      )}
    </div>
  )
}
```

## Best Practices

1. **URL Management**: Use meaningful query parameter names for flow state
2. **Browser Integration**: Respect browser navigation patterns
3. **State Serialization**: Keep flow state minimal for URL storage
4. **Error Handling**: Handle URL parsing errors gracefully
5. **SEO Considerations**: Use appropriate meta tags for flow pages
6. **Performance**: Optimize flow state serialization for large flows
7. **User Experience**: Provide clear navigation indicators

## Dependencies

This package depends on:
- `@owlmeans/client-flow` - Base client flow implementation
- `@owlmeans/client` - React client library
- `@owlmeans/flow` - Core flow system
- `react` - React library (peer dependency)
- `react-router-dom` - React Router DOM (peer dependency)

## Related Packages

- [`@owlmeans/client-flow`](../client-flow) - Base client flow implementation
- [`@owlmeans/flow`](../flow) - Core flow system
- [`@owlmeans/server-flow`](../server-flow) - Server-side flow processing
- [`@owlmeans/client`](../client) - React client library