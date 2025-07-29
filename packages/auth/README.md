# @owlmeans/auth

A comprehensive authentication and authorization library for OwlMeans Common applications. This package provides the foundational authentication subsystem that enables secure user management, credential validation, permission-based access control, and multi-role authorization across fullstack applications.

## Overview

The `@owlmeans/auth` package is the core authentication library in the OwlMeans Common ecosystem, designed for fullstack applications with a focus on security and proper authentication/authorization patterns. It provides:

- **Multi-Role Authentication**: Support for users, guests, services, admins, and system-level authentication
- **Cryptographic Security**: Integration with digital signatures and advanced cryptographic methods
- **Permission-Based Authorization**: Granular permission and capability management
- **Profile Management**: User profile and group-based access control
- **Flexible Authentication Types**: Support for multiple authentication methods including Ed25519, one-time tokens, and wallet-based authentication

## Installation

```bash
npm install @owlmeans/auth
```

## Core Concepts

### Authentication Types

The library supports various authentication methods through the `AuthenticationType` enum:

- **BasicEd25519**: Cryptographic authentication using Ed25519 signatures
- **OneTimeToken**: Temporary token-based authentication
- **ReCaptcha**: CAPTCHA-based verification
- **WalletDid**: Decentralized identity wallet authentication
- **RelyHandshake**: Internal cross-authentication for wallet connections
- **WalletConsumer**: Client-side wallet authentication
- **WalletProvider**: Provider-side wallet authentication

### Authorization Types

Authorization is handled through the `AuthroizationType` enum:

- **AuthToken**: Classic bearer token authorization
- **Ed25519BasicToken**: OwlMeans' primary authorization token
- **Ed25519BasicSignature**: Signature-based authorization

### User Roles

The system supports hierarchical roles via the `AuthRole` enum:

- **Guest**: Unauthenticated users with limited access
- **User**: Authenticated regular users
- **Service**: Service-to-service authentication
- **Admin**: Administrative users with elevated privileges
- **Superuser**: Highest privilege level
- **System**: System-level processes
- **Blocked**: Restricted/banned users

## API Reference

### Types

#### `AuthCredentials`
Contains authentication challenge and credential information.

```typescript
interface AuthCredentials extends AuthPayload {
  challenge: string
  credential: string
  publicKey?: string
}
```

#### `AuthPayload`
Core authentication payload with user and authorization data.

```typescript
interface AuthPayload extends ProfilePayload {
  type: string
  role: AuthRole
  userId: string
  source?: string
  profileId?: string
  expiresAt?: Date
}
```

#### `Auth`
Complete authentication object with token and metadata.

```typescript
interface Auth extends AuthPayload {
  token: string
  isUser: boolean
  createdAt: Date
}
```

#### `Profile`
User profile with permissions and group membership.

```typescript
interface Profile extends ProfilePayload {
  id: string
  name: string
  credential?: string
  secret?: string
}
```

#### `Authorization`
Permission and capability structure for access control.

```typescript
interface Authorization {
  entityId?: string
  scopes: string[]
  permissions?: PermissionSet[]
  attributes?: AttributeSet[]
  permissioned?: boolean
  denormalized?: boolean
}
```

#### `PermissionSet`
Defines capabilities within a specific scope.

```typescript
interface PermissionSet {
  scope: string
  title?: string
  permissions: Capabilties
  resources?: string[]
}
```

### Helper Functions

#### `verifyAuth(auth: Auth): boolean`
Validates an authentication object against the defined schema.

#### `verifyAuthCredentials(auth: AuthCredentials): boolean`
Validates authentication credentials against the defined schema.

#### `isAuth(auth: unknown): auth is Auth`
Type guard to check if an object is a valid Auth instance.

#### `isAuthCredentials(auth: unknown): auth is AuthCredentials`
Type guard to check if an object is valid AuthCredentials.

#### `isAuthToken(auth: unknown): auth is AuthToken`
Type guard to check if an object is a valid AuthToken.

### Constants

#### Authentication Scopes
- `ALL_SCOPES`: Wildcard scope (`'*'`)
- `AUTH_SCOPE`: Authentication-specific scope (`'__auth'`)

#### Authentication Stages
```typescript
enum AuthenticationStage {
  Error = 'error',
  Init = 'init',
  Allowence = 'allowence',
  Authenticate = 'authenticate',
  Authentication = 'auhtentication',
  Authenticated = 'authenticated'
}
```

#### Module Aliases
- `AUTHEN`: Authentication module base
- `AUTHEN_INIT`: Authentication initialization
- `AUTHEN_AUTHEN`: Authentication execution
- `CAUTHEN`: Client authentication module base

### Error Types

The package provides a comprehensive error hierarchy for authentication failures:

#### `AuthError`
Base error class for all authentication-related errors.

#### `AuthUnknown`
Error for unknown authentication issues.

#### `AuthManagerError`
Errors related to authentication manager operations.

#### `AuthManagerUnsupported`
Error for unsupported authentication methods.

#### `AuthenFailed`
General authentication failure error.

#### `AuthenExists`
Error when attempting to create duplicate authentication.

#### `AuthenPayloadError`
Error for invalid authentication payload.

#### `AuthPluginError`
Errors related to authentication plugins.

#### `TypeMissmatchError`
Error for authentication type mismatches.

#### `AuthorizationError`
Base error for authorization failures.

#### `AuthForbidden`
Error for forbidden access attempts.

#### `ProfileError`
Errors related to user profile operations.

#### `ProfileConsistencyError`
Error for profile data consistency issues.

## Usage Examples

### Basic Authentication Validation

```typescript
import { verifyAuth, isAuth, AuthRole } from '@owlmeans/auth'

// Validate an authentication object
const auth = {
  type: 'basic-ed25519',
  role: AuthRole.User,
  userId: 'user123',
  token: 'token123',
  isUser: true,
  createdAt: new Date(),
  scopes: ['read', 'write']
}

if (verifyAuth(auth)) {
  console.log('Authentication is valid')
}

// Type checking
if (isAuth(someObject)) {
  // TypeScript knows someObject is Auth
  console.log(`User ID: ${someObject.userId}`)
}
```

### Permission Checking

```typescript
import { PermissionSet, AuthRole } from '@owlmeans/auth'

const permissions: PermissionSet = {
  scope: 'documents',
  title: 'Document Permissions',
  permissions: {
    read: true,
    write: true,
    delete: false
  },
  resources: ['doc1', 'doc2']
}
```

### Error Handling

```typescript
import { AuthError, AuthForbidden } from '@owlmeans/auth'

try {
  // Authentication operation
} catch (error) {
  if (error instanceof AuthForbidden) {
    console.log('Access denied')
  } else if (error instanceof AuthError) {
    console.log('Authentication error:', error.message)
  }
}
```

## Integration with OwlMeans Ecosystem

The `@owlmeans/auth` package integrates seamlessly with other OwlMeans packages:

- **@owlmeans/basic-keys**: Provides cryptographic key management for signature-based authentication
- **@owlmeans/error**: Uses the ResilientError system for type-safe error handling
- **@owlmeans/context**: Integrates with the dependency injection system for service registration
- **@owlmeans/server-auth**: Server-side authentication implementation
- **@owlmeans/client-auth**: Client-side authentication implementation

## Package Structure

The authentication system is organized into several specialized modules:

- **allowance/**: Authentication request and response handling
- **auth/**: Core authentication logic and models
- **permission/**: Permission and capability management
- **rely/**: Wallet and third-party authentication rely functionality
- **entity/**: Entity-based authentication and authorization

## Advanced Features

### Scoped Permissions
The system supports hierarchical permission scopes with wildcard and specific resource targeting.

### Multi-Entity Authorization
Support for entity-specific permissions and cross-entity authorization.

### Cryptographic Authentication
Integration with Ed25519 digital signatures for secure, non-repudiable authentication.

### Wallet Integration
Built-in support for decentralized identity wallets and blockchain-based authentication.

## Security Considerations

- All authentication tokens should be transmitted over HTTPS
- Store credentials securely using appropriate encryption
- Implement proper session management and token expiration
- Use signature-based authentication for high-security requirements
- Validate all authentication payloads using the provided validation functions

Fixes #32.