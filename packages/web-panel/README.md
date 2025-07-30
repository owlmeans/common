# @owlmeans/web-panel

The **@owlmeans/web-panel** package provides web-based panel components and infrastructure for OwlMeans Common Libraries, extending the client-panel functionality with web-specific implementations and React components for building administrative interfaces and user panels.

## Purpose

This package serves as a web-specific extension to the panel system, designed for:

- **Web Panel Components**: React components for building web-based admin panels
- **Authentication Integration**: Panel components with built-in authentication support
- **Module System**: Integration with OwlMeans module system for panel routes
- **Context Management**: Web-specific context handling for panel applications
- **Component Re-export**: Access to base client-panel functionality

## Key Concepts

### Web-specific Panels
Extends the base panel functionality with web-specific components and behaviors optimized for browser environments.

### React Integration
Provides React components and hooks for building panel interfaces with consistent styling and behavior.

### Authentication Aware
Panel components that integrate with OwlMeans authentication system for secure access control.

## Installation

```bash
npm install @owlmeans/web-panel
```

## API Reference

This package extends `@owlmeans/client-panel` with web-specific functionality:

### Exports

```typescript
// Re-exports all client-panel functionality
export * from '@owlmeans/client-panel'

// Web-specific exports
export * from './main.js'
export * from './exports.js'
export * from './context.js'
export * from './modules.js'
export * from './components/index.js'
```

### Components

The package provides React components for building panel interfaces (specific components depend on implementation).

### Context Management

Web-specific context handling for panel applications with authentication and routing integration.

## Usage Examples

### Basic Panel Setup

```typescript
import { WebPanelProvider } from '@owlmeans/web-panel'
import { makeWebContext } from '@owlmeans/web-client'

function App() {
  const context = makeWebContext(config)
  
  return (
    <WebPanelProvider context={context}>
      <PanelInterface />
    </WebPanelProvider>
  )
}
```

### Panel Components

```typescript
import { PanelComponent } from '@owlmeans/web-panel'

function AdminPanel() {
  return (
    <PanelComponent title="Administration">
      <UserManagement />
      <SystemSettings />
    </PanelComponent>
  )
}
```

## Dependencies

This package depends on:
- `@owlmeans/client-panel` - Base panel functionality
- React-related dependencies for web components

## Related Packages

- [`@owlmeans/client-panel`](../client-panel) - Base panel functionality
- [`@owlmeans/native-panel`](../native-panel) - Native panel implementation
- [`@owlmeans/web-client`](../web-client) - Web client framework