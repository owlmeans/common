# @owlmeans/web-oidc-provider

The **@owlmeans/web-oidc-provider** package provides web-based OpenID Connect Provider functionality for OwlMeans Common Libraries, enabling applications to act as OIDC identity providers with React-based user interfaces and web-specific integrations.

## Purpose

This package serves as the web frontend for OIDC Provider functionality, designed for:

- **Web OIDC Provider UI**: React components for OIDC provider user interfaces
- **Authentication Flows**: Web-based authentication and authorization flows
- **User Management**: Web interfaces for user registration, login, and profile management
- **Admin Interfaces**: Administrative interfaces for managing OIDC clients and configurations
- **Integration Support**: Seamless integration with server-side OIDC provider implementations

## Key Concepts

### Web-based Identity Provider
Provides the web frontend components for building a complete OIDC identity provider with user-friendly interfaces.

### React Integration
Includes React components and hooks for building OIDC provider interfaces with consistent styling and behavior.

### Authentication Flows
Implements web-based authentication flows including login, registration, consent, and error handling.

## Installation

```bash
npm install @owlmeans/web-oidc-provider
```

## API Reference

*Note: This package appears to be in development stage as part of the OIDC provider web interface.*

### Web OIDC Components

The package provides React components for building OIDC provider web interfaces.

## Usage Examples

### Basic OIDC Provider Web Setup

```typescript
import { OidcProviderApp } from '@owlmeans/web-oidc-provider'
import { makeWebContext } from '@owlmeans/web-client'

function IdentityProviderApp() {
  const context = makeWebContext(providerConfig)
  
  return (
    <OidcProviderApp context={context}>
      <LoginInterface />
      <ConsentInterface />
      <AdminInterface />
    </OidcProviderApp>
  )
}
```

### OIDC Provider Components

```typescript
import { LoginForm, ConsentForm } from '@owlmeans/web-oidc-provider'

function AuthenticationFlow() {
  return (
    <div>
      <LoginForm onAuthenticate={handleLogin} />
      <ConsentForm onConsent={handleConsent} />
    </div>
  )
}
```

## Dependencies

This package is designed to work with:
- `@owlmeans/oidc` - Core OIDC functionality
- `@owlmeans/server-oidc-provider` - Server-side OIDC provider
- `@owlmeans/web-client` - Web client framework
- React framework for web components

## Related Packages

- [`@owlmeans/oidc`](../oidc) - Core OIDC functionality
- [`@owlmeans/server-oidc-provider`](../server-oidc-provider) - Server OIDC provider
- [`@owlmeans/web-oidc-rp`](../web-oidc-rp) - Web OIDC Relying Party
- [`@owlmeans/auth`](../auth) - Authentication framework