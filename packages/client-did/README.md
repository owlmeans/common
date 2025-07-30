# @owlmeans/client-did

Client-side Decentralized Identity (DID) implementation for OwlMeans applications. This package provides complete DID wallet management, authentication, and account functionality for browser and React Native environments.

## Overview

The `@owlmeans/client-did` package enables client-side decentralized identity functionality, providing:

- **DID Wallet Service**: Complete wallet lifecycle management with lazy initialization
- **DID Account Models**: Account abstraction for authentication and signing operations
- **Resource Integration**: Seamless integration with client resource system for persistent storage
- **Authentication Support**: DID-based authentication credential generation
- **State Management**: Integration with OwlMeans state system for reactive updates
- **Cross-Platform Support**: Works in web browsers and React Native environments

This package is part of the OwlMeans DID ecosystem:
- **@owlmeans/did**: Core DID functionality and wallet implementation
- **@owlmeans/client-did**: Client-side DID implementation *(this package)*
- **@owlmeans/basic-keys**: Cryptographic key management

## Installation

```bash
npm install @owlmeans/client-did
```

## Dependencies

This package requires:
- `@owlmeans/did`: Core DID functionality
- `@owlmeans/client-context`: Client context management
- `@owlmeans/client-resource`: Client resource system
- `@owlmeans/basic-keys`: Cryptographic operations
- `@owlmeans/auth`: Authentication types and interfaces
- `@owlmeans/state`: State management integration

## Core Concepts

### DID Wallet Service

The DID wallet service manages the lifecycle of decentralized identity wallets, including creation, initialization, and persistence across client sessions.

### DID Account Model

Account models provide a simplified interface for DID-based authentication and credential generation.

### Resource Dependencies

The service uses three key resources for persistent storage:
- **Keys Resource**: Stores cryptographic key pairs
- **Meta Resource**: Stores metadata about DID keys
- **Master Resource**: Stores master wallet configuration

## API Reference

### Types

#### `DIDService`

Main service interface for DID wallet management.

```typescript
interface DIDService extends LazyService {
  wallet: DIDWallet                                          // Current wallet instance
  exists(): Promise<boolean>                                 // Check if wallet exists
  create(opts?: MakeDIDWalletOptions): Promise<DIDWallet>   // Create new wallet
  intialize(): Promise<DIDWallet>                           // Initialize existing wallet
  get(): DIDWallet                                          // Get current wallet
}
```

#### `DIDServiceAppend`

Interface for contexts that provide DID service access.

```typescript
interface DIDServiceAppend {
  getDidService(alias?: string): DIDService
}
```

#### `DIDServiceDeps`

Configuration for service resource dependencies.

```typescript
interface DIDServiceDeps {
  keys: string     // Key pair resource alias
  meta: string     // Key metadata resource alias
  master: string   // Master wallet resource alias
}
```

#### `DIDAccountModel`

Account model interface for DID-based authentication.

```typescript
interface DIDAccountModel {
  did: DIDKeyModel                                          // DID key model
  authenticate<T extends Partial<AuthCredentials>>(auth: T): Promise<T>  // Generate auth credentials
}
```

### Factory Functions

#### `makeWalletService(alias?: string, deps?: DIDServiceDeps): DIDService`

Creates a DID wallet service with resource dependencies.

**Parameters:**
- `alias`: Service alias (default: 'did-wallet')
- `deps`: Resource dependencies configuration

**Returns:** DIDService instance

**Example:**
```typescript
import { makeWalletService } from '@owlmeans/client-did'

const didService = makeWalletService('primary-wallet')

// Custom resource dependencies
const customService = makeWalletService('custom-wallet', {
  keys: 'custom-keys',
  meta: 'custom-meta', 
  master: 'custom-master'
})
```

#### `appendDidService<C extends ClientConfig, T extends ClientContext<C>>(ctx: T, alias?: string, customDeps?: Partial<DIDServiceDeps>): T & DIDServiceAppend`

Appends DID service capabilities to a client context.

**Parameters:**
- `ctx`: Client context to extend
- `alias`: Service alias (default: 'did-wallet')
- `customDeps`: Custom resource dependencies

**Returns:** Context with DID service capabilities

**Features:**
- Automatically creates required resources if they don't exist
- Registers DID service with context
- Adds `getDidService()` method to context
- Integrates with state debugging

**Example:**
```typescript
import { appendDidService } from '@owlmeans/client-did'
import { makeClientContext } from '@owlmeans/client-context'

const context = makeClientContext(config)
const contextWithDid = appendDidService(context)

// Initialize context
await contextWithDid.configure().init()

// Access DID service
const didService = contextWithDid.getDidService()
```

#### `makeDidAccountModel(did: KeyPair | DIDKeyModel | string, isPub?: boolean): DIDAccountModel`

Creates a DID account model for authentication operations.

**Parameters:**
- `did`: DID key material (KeyPair, DIDKeyModel, or string)
- `isPub`: Whether the string is a public key (default: false)

**Returns:** DIDAccountModel instance

**Example:**
```typescript
import { makeDidAccountModel } from '@owlmeans/client-did'

// From existing DID key model
const account1 = makeDidAccountModel(didKeyModel)

// From key pair
const account2 = makeDidAccountModel(keyPair)

// From private key string
const account3 = makeDidAccountModel('ed25519:privateKeyString')

// From public key string
const account4 = makeDidAccountModel('ed25519:publicKeyString', true)
```

### Service Methods

#### `exists(): Promise<boolean>`

Checks if a DID wallet already exists in persistent storage.

**Returns:** Promise resolving to boolean indicating existence

**Example:**
```typescript
const didService = makeWalletService()

if (await didService.exists()) {
  console.log('Wallet already exists')
  await didService.intialize()
} else {
  console.log('Creating new wallet')
  await didService.create()
}
```

#### `create(opts?: MakeDIDWalletOptions): Promise<DIDWallet>`

Creates a new DID wallet. Throws error if wallet already exists.

**Parameters:**
- `opts`: Wallet creation options

**Returns:** Promise resolving to new DIDWallet

**Throws:** `DIDInitializationError` if wallet already exists

**Example:**
```typescript
try {
  const wallet = await didService.create({
    // Custom wallet options
    keyType: 'ed25519',
    derivationPath: "m/44'/60'/0'/0/0"
  })
  
  console.log('Wallet created:', wallet.exportAddress())
} catch (error) {
  if (error instanceof DIDInitializationError) {
    console.error('Wallet already exists')
  }
}
```

#### `intialize(): Promise<DIDWallet>`

Initializes an existing DID wallet from persistent storage.

**Returns:** Promise resolving to initialized DIDWallet

**Example:**
```typescript
const wallet = await didService.intialize()
console.log('Wallet initialized:', wallet.exportAddress())
```

#### `get(): DIDWallet`

Gets the current wallet instance (must be initialized first).

**Returns:** Current DIDWallet instance

**Example:**
```typescript
await didService.intialize()
const wallet = didService.get()

// Use wallet for operations
const signature = await wallet.sign('message to sign')
```

### Account Model Methods

#### `authenticate<T extends Partial<AuthCredentials>>(auth: T): Promise<T>`

Generates authentication credentials using the DID key.

**Parameters:**
- `auth`: Partial authentication credentials with challenge

**Returns:** Promise resolving to complete authentication credentials

**Process:**
1. Sets `userId` to DID address
2. Sets `publicKey` to DID public key
3. Signs the challenge and sets `credential`

**Example:**
```typescript
const account = makeDidAccountModel(didKeyModel)

// Authenticate with challenge
const authResult = await account.authenticate({
  challenge: 'authentication-challenge-string',
  type: 'ed25519'
})

console.log('User ID:', authResult.userId)
console.log('Public Key:', authResult.publicKey)
console.log('Credential:', authResult.credential)
```

### Constants

#### Service Configuration
```typescript
const DEFAULT_ALIAS = 'did-wallet'                    // Default service alias

const DEF_KEYS_RESOURCE = 'did-wallet-keys'          // Default keys resource
const DEF_META_RESOURCE = 'did-wallet-meta'          // Default meta resource  
const DEF_MASTER_RESOURCE = 'did-wallet-master'      // Default master resource

const defDeps: DIDServiceDeps = {
  keys: DEF_KEYS_RESOURCE,
  meta: DEF_META_RESOURCE,
  master: DEF_MASTER_RESOURCE
}
```

## Usage Examples

### Basic DID Wallet Setup

```typescript
import { appendDidService } from '@owlmeans/client-did'
import { makeClientContext } from '@owlmeans/client-context'

// Create context with DID capabilities
const context = makeClientContext({
  service: 'my-app',
  // ... other config
})

const contextWithDid = appendDidService(context)

// Initialize context
await contextWithDid.configure().init()

// Access DID service
const didService = contextWithDid.getDidService()

// Check if wallet exists
if (await didService.exists()) {
  await didService.intialize()
  console.log('Wallet loaded')
} else {
  await didService.create()
  console.log('New wallet created')
}
```

### DID-Based Authentication

```typescript
import { makeDidAccountModel } from '@owlmeans/client-did'

// Create account from wallet
const didService = context.getDidService()
const wallet = didService.get()
const account = makeDidAccountModel(wallet.master)

// Authenticate with server challenge
const challenge = 'server-provided-challenge'
const authCredentials = await account.authenticate({
  challenge,
  type: 'ed25519'
})

// Send credentials to server
const response = await fetch('/api/authenticate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(authCredentials)
})
```

### Multiple DID Wallets

```typescript
// Create multiple wallet services
const primaryContext = appendDidService(context, 'primary', {
  keys: 'primary-keys',
  meta: 'primary-meta',
  master: 'primary-master'
})

const backupContext = appendDidService(primaryContext, 'backup', {
  keys: 'backup-keys',
  meta: 'backup-meta', 
  master: 'backup-master'
})

await backupContext.configure().init()

// Use different wallets
const primaryDid = backupContext.getDidService('primary')
const backupDid = backupContext.getDidService('backup')

// Create both wallets
if (!await primaryDid.exists()) {
  await primaryDid.create()
}

if (!await backupDid.exists()) {
  await backupDid.create()
}
```

### Wallet Recovery and Import

```typescript
import { makeDidAccountModel } from '@owlmeans/client-did'

// Recovery from private key
const recoverWallet = async (privateKeyString: string) => {
  const account = makeDidAccountModel(privateKeyString)
  console.log('Recovered wallet address:', account.did.exportAddress())
  
  return account
}

// Import from existing key pair
const importWallet = async (keyPair: KeyPair) => {
  const account = makeDidAccountModel(keyPair)
  
  // Authenticate to verify ownership
  const authTest = await account.authenticate({
    challenge: 'ownership-verification'
  })
  
  return account
}

// Usage
const recovered = await recoverWallet('ed25519:private-key-string')
const imported = await importWallet(existingKeyPair)
```

### Signing and Verification

```typescript
// Sign messages with DID wallet
const didService = context.getDidService()
const wallet = didService.get()

// Sign arbitrary data
const signature = await wallet.sign('important message')
console.log('Signature:', signature)

// Verify signature
const isValid = await wallet.verify('important message', signature)
console.log('Signature valid:', isValid)

// Account-based signing
const account = makeDidAccountModel(wallet.master)
const authSig = await account.authenticate({
  challenge: 'server-challenge'
})
```

### Integration with Authentication Flow

```typescript
import { AuthenticationStage } from '@owlmeans/auth'

class DIDAuthenticationFlow {
  private account: DIDAccountModel
  
  constructor(didService: DIDService) {
    this.account = makeDidAccountModel(didService.get().master)
  }
  
  async initialize() {
    return {
      stage: AuthenticationStage.Init,
      publicKey: this.account.did.exportPublic(),
      address: this.account.did.exportAddress()
    }
  }
  
  async authenticate(challenge: string) {
    const credentials = await this.account.authenticate({
      challenge,
      type: 'ed25519'
    })
    
    return {
      stage: AuthenticationStage.Authenticated,
      ...credentials
    }
  }
}

// Usage
const authFlow = new DIDAuthenticationFlow(didService)
const initResult = await authFlow.initialize()

// Send init to server, receive challenge
const challenge = await sendToServer('/auth/init', initResult)
const authResult = await authFlow.authenticate(challenge.challenge)
```

### State Management Integration

```typescript
// The service automatically integrates with state debugging
const contextWithDid = appendDidService(context)

// State changes are tracked for resources
contextWithDid.getDidService()  // State debugging enabled for did-wallet-*

// Monitor wallet state changes
const stateService = contextWithDid.service('state')
stateService.subscribe('did-wallet-master', (change) => {
  console.log('Wallet state changed:', change)
})
```

### Error Handling

```typescript
import { DIDInitializationError } from '@owlmeans/did'

try {
  const didService = makeWalletService()
  
  // Try to create wallet
  await didService.create()
} catch (error) {
  if (error instanceof DIDInitializationError) {
    if (error.message.includes('exists:service')) {
      console.log('Wallet already exists, initializing instead')
      await didService.intialize()
    } else {
      console.error('DID initialization failed:', error.message)
    }
  } else {
    console.error('Unexpected error:', error)
  }
}
```

### Custom Resource Configuration

```typescript
// Custom resource aliases for different use cases
const customDeps: DIDServiceDeps = {
  keys: 'secure-keys',
  meta: 'wallet-metadata',
  master: 'master-wallet'
}

const secureDidService = makeWalletService('secure-wallet', customDeps)

// Or use with appendDidService
const contextWithCustomDid = appendDidService(context, 'custom', {
  keys: 'custom-keys-resource',
  meta: 'custom-meta-resource'
  // master will default to 'custom-master'
})
```

### Cross-Platform Considerations

```typescript
// Browser-specific initialization
if (typeof window !== 'undefined') {
  // Browser environment
  const context = makeClientContext(browserConfig)
  const contextWithDid = appendDidService(context)
}

// React Native-specific initialization  
if (typeof global !== 'undefined' && global.navigator?.product === 'ReactNative') {
  // React Native environment
  const context = makeClientContext(reactNativeConfig)
  const contextWithDid = appendDidService(context)
}
```

## Advanced Features

### Wallet Export and Backup

```typescript
// Export wallet for backup
const didService = context.getDidService()
const wallet = didService.get()

const exportData = {
  address: wallet.exportAddress(),
  publicKey: wallet.exportPublic(),
  // Note: private key export depends on wallet implementation
  masterKey: wallet.master?.export?.() // If available
}

// Store backup securely
localStorage.setItem('wallet-backup', JSON.stringify(exportData))
```

### Multi-Signature Support

```typescript
// Create multiple accounts for multi-sig
const wallet = didService.get()
const accounts = [
  makeDidAccountModel(wallet.master),
  makeDidAccountModel(wallet.createDerived?.(1) || wallet.master),
  makeDidAccountModel(wallet.createDerived?.(2) || wallet.master)
]

// Multi-signature authentication
const multiAuth = async (challenge: string) => {
  const signatures = await Promise.all(
    accounts.map(account => 
      account.authenticate({ challenge, type: 'ed25519' })
    )
  )
  
  return {
    type: 'multi-sig',
    signatures,
    threshold: 2  // Require 2 of 3 signatures
  }
}
```

### Hierarchical Deterministic Support

```typescript
// If wallet supports HD derivation
const wallet = didService.get()

// Create derived accounts for different purposes
const tradingAccount = wallet.deriveAccount?.('m/44\'/60\'/0\'/0/0')
const savingsAccount = wallet.deriveAccount?.('m/44\'/60\'/0\'/0/1')

if (tradingAccount && savingsAccount) {
  const tradingDid = makeDidAccountModel(tradingAccount)
  const savingsDid = makeDidAccountModel(savingsAccount)
  
  console.log('Trading address:', tradingDid.did.exportAddress())
  console.log('Savings address:', savingsDid.did.exportAddress())
}
```

## Security Considerations

### Private Key Protection
- Private keys are stored using client resource system
- Use appropriate security measures for key storage
- Consider hardware security modules for high-value applications

### Authentication Security
- Always verify challenges come from trusted sources
- Implement replay attack protection
- Use secure communication channels for credential exchange

### Wallet Management
- Implement proper wallet backup and recovery procedures
- Use strong entropy for wallet generation
- Consider multi-factor authentication for wallet access

## Best Practices

1. **Initialization**: Check wallet existence before creation
2. **Error Handling**: Properly handle DID initialization errors
3. **Resource Management**: Use meaningful resource aliases
4. **State Integration**: Leverage state debugging for development
5. **Security**: Never expose private keys in logs or error messages
6. **Backup**: Implement secure wallet backup procedures
7. **Testing**: Test authentication flows thoroughly

## Integration with OwlMeans Ecosystem

### Authentication Integration
```typescript
import { AuthService } from '@owlmeans/client-auth'

// Use DID for OwlMeans authentication
const authService = context.service<AuthService>('auth')
const didService = context.getDidService()

// Custom DID-based authentication
const authenticateWithDid = async (challenge: string) => {
  const account = makeDidAccountModel(didService.get().master)
  const credentials = await account.authenticate({ challenge })
  
  await authService.authenticate({ token: credentials.credential })
}
```

### Context Integration
```typescript
import { makeClientContext } from '@owlmeans/client-context'

// DID service integrates seamlessly with client context
const context = makeClientContext(config)
const contextWithDid = appendDidService(context)

// All OwlMeans services work together
await contextWithDid.configure().init()
```

## Performance Considerations

- **Lazy Initialization**: Service initializes only when needed
- **Resource Caching**: Resources are cached after first access
- **Cryptographic Operations**: Ed25519 operations are computationally efficient
- **State Updates**: State changes are optimized for performance

## Related Packages

- [`@owlmeans/did`](../did) - Core DID functionality and wallet implementation
- [`@owlmeans/basic-keys`](../basic-keys) - Cryptographic key management
- [`@owlmeans/client-context`](../client-context) - Client context management
- [`@owlmeans/client-resource`](../client-resource) - Client resource system
- [`@owlmeans/auth`](../auth) - Authentication types and interfaces
- [`@owlmeans/state`](../state) - State management system