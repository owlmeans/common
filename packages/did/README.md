# @owlmeans/did

A comprehensive Decentralized Identity (DID) and cryptographic wallet management library for OwlMeans Common applications. This package provides secure key generation, hierarchical deterministic wallets, and decentralized identity management with mnemonic seed support.

## Overview

The `@owlmeans/did` package is the core decentralized identity library in the OwlMeans Common ecosystem, providing:

- **DID Wallet Management**: Hierarchical deterministic wallet creation and management
- **Mnemonic Key Generation**: BIP39-compatible mnemonic phrase generation and recovery
- **Cryptographic Key Derivation**: Secure key derivation with configurable depth
- **Identity Management**: Profile and entity-based identity organization
- **Secure Storage**: Resource-based secure storage for keys and metadata
- **Plugin Architecture**: Extensible cryptographic algorithm support
- **Cross-Platform Support**: Works across server, web, and mobile environments

## Installation

```bash
npm install @owlmeans/did
```

## Core Concepts

### DID Wallet

A `DIDWallet` is a hierarchical deterministic wallet that manages cryptographic keys and associated metadata. It supports key derivation, profile management, and secure storage.

### DID Key Model

A `DIDKeyModel` extends the basic key pair model with DID-specific functionality, including path-based key derivation and parent-child key relationships.

### Key Metadata

Key metadata associates human-readable information with cryptographic keys, including names, entity IDs, and profile information.

### Mnemonic Seeds

Mnemonic phrases provide a human-readable way to backup and restore wallets, following BIP39 standards.

## API Reference

### Types

#### `DIDWallet`
Core wallet interface for managing decentralized identities.

```typescript
interface DIDWallet {
  store: DIDStore                                                    // Storage backend
  generate: (opts?: MnemonicOptions) => Promise<void>               // Generate new wallet
  mnemonic: (crash?: boolean) => Promise<string | false>            // Get mnemonic phrase
  master: () => Promise<DIDKeyModel>                                // Get master key
  add: (key: DIDKeyModel, meta: KeyMeta) => Promise<void>           // Add key with metadata
  meta: (key: string | DIDKeyModel) => Promise<KeyMeta>             // Get key metadata
  update: (key: DIDKeyModel, meta: KeyMeta) => Promise<[DIDKeyModel, KeyMeta]>  // Update key metadata
  get: (did: string) => Promise<DIDKeyModel | null>                 // Get key by DID
  find: (meta: Partial<KeyMeta>) => Promise<DIDKeyModel[]>          // Find keys by metadata
  provide: (meta: Partial<KeyMeta>) => Promise<DIDKeyModel[]>       // Provide keys matching criteria
  remove: (did: string | KeyMeta | DIDKeyModel) => Promise<DIDKeyModel>  // Remove key
  all: () => Promise<DIDKeyModel[]>                                 // Get all keys
  allMeta: () => Promise<KeyMeta[]>                                 // Get all metadata
}
```

#### `DIDKeyModel`
Extended key model with DID capabilities.

```typescript
interface DIDKeyModel extends KeyPairModel {
  keyPair?: DIDKeyPair                        // Underlying key pair
  derive: (path: string) => DIDKeyModel       // Derive child keys
}
```

#### `KeyMeta`
Metadata associated with keys.

```typescript
interface KeyMeta extends Partial<Profile> {
  id: string          // Unique identifier
  name: string        // Human-readable name
  entityId?: string   // Associated entity ID
}
```

#### `DIDStore`
Storage interface for wallet data.

```typescript
interface DIDStore {
  master: MasterResource      // Master key storage
  keys: KeyPairResource       // Key pair storage
  meta: KeyMetaResource       // Metadata storage
}
```

### Factory Functions

#### `makeWallet(store: DIDStore, opts?: MakeDIDWalletOptions): Promise<DIDWallet>`
Creates a new DID wallet instance.

**Parameters:**
- `store`: Storage backend for wallet data
- `opts`: Optional wallet creation options

**Options:**
```typescript
interface MakeDIDWalletOptions {
  force?: boolean           // Force creation even if master exists
  allowEmpty?: boolean      // Allow empty wallet creation
  mnemonic?: MnemonicOptions  // Mnemonic generation options
  type?: string            // Key type (default: 'owlmk')
  allowCustomType?: boolean // Allow custom key types
}
```

#### `makeDidKeyModel(input?: KeyPair | string): DIDKeyModel`
Creates a DID key model from key pair or type string.

### Wallet Operations

#### `generate(opts?: MnemonicOptions): Promise<void>`
Generates a new wallet with mnemonic seed.

```typescript
// Generate with default options
await wallet.generate()

// Generate with custom entropy
await wallet.generate({ size: 256 })
```

#### `mnemonic(crash?: boolean): Promise<string | false>`
Retrieves the wallet's mnemonic phrase.

```typescript
// Get mnemonic (safe, returns false if not available)
const mnemonic = await wallet.mnemonic()

// Get mnemonic (throws error if not available)
const mnemonic = await wallet.mnemonic(true)
```

#### `master(): Promise<DIDKeyModel>`
Gets the master key for the wallet.

```typescript
const masterKey = await wallet.master()
console.log('Master DID:', masterKey.did)
```

### Key Management

#### `add(key: DIDKeyModel, meta: KeyMeta): Promise<void>`
Adds a key with metadata to the wallet.

```typescript
const childKey = masterKey.derive('profile/user')
await wallet.add(childKey, {
  id: 'user-profile',
  name: 'User Profile Key',
  entityId: 'user-123'
})
```

#### `get(did: string): Promise<DIDKeyModel | null>`
Retrieves a key by its DID.

```typescript
const key = await wallet.get('did:owlmeans:key:...')
if (key) {
  console.log('Found key:', key.did)
}
```

#### `find(meta: Partial<KeyMeta>): Promise<DIDKeyModel[]>`
Finds keys matching metadata criteria.

```typescript
// Find all profile keys
const profileKeys = await wallet.find({ entityId: 'user-123' })

// Find keys by name pattern
const namedKeys = await wallet.find({ name: 'Service Key' })
```

### Key Derivation

#### `derive(path: string): DIDKeyModel`
Derives child keys from parent keys using hierarchical paths.

```typescript
const masterKey = await wallet.master()

// Derive profile key
const profileKey = masterKey.derive('profile/user')

// Derive service key
const serviceKey = masterKey.derive('service/api')

// Derive entity-specific key
const entityKey = masterKey.derive('entity/org/dept')
```

### Constants

```typescript
const KEY_OWL = 'owlmk'              // Default key type
const MAX_DEPTH = 6                 // Maximum derivation depth
const PROFILE_PREFIX = 'profile'    // Profile key prefix
const ENTITY_PREFIX = 'entity'      // Entity key prefix  
const SERVICE_PREFIX = 'service'    // Service key prefix
const MASTER = '_master_key'        // Master key identifier
```

## Usage Examples

### Basic Wallet Creation

```typescript
import { makeWallet } from '@owlmeans/did'
import { createDIDStore } from './storage'

// Create storage backend
const store = createDIDStore()

// Create new wallet
const wallet = await makeWallet(store, {
  allowEmpty: true
})

// Generate master key
await wallet.generate()

// Get mnemonic for backup
const mnemonic = await wallet.mnemonic()
console.log('Backup phrase:', mnemonic)
```

### Key Derivation and Management

```typescript
// Get master key
const master = await wallet.master()

// Derive keys for different purposes
const profileKey = master.derive('profile/personal')
const workKey = master.derive('profile/work')
const apiKey = master.derive('service/api/v1')

// Add keys with metadata
await wallet.add(profileKey, {
  id: 'personal-profile',
  name: 'Personal Profile',
  entityId: 'user-123'
})

await wallet.add(workKey, {
  id: 'work-profile', 
  name: 'Work Profile',
  entityId: 'org-456'
})

await wallet.add(apiKey, {
  id: 'api-service',
  name: 'API Service Key',
  entityId: 'service-789'
})
```

### Identity Management

```typescript
// Create identity for a user
const createUserIdentity = async (userId: string, name: string) => {
  const master = await wallet.master()
  const userKey = master.derive(`profile/${userId}`)
  
  await wallet.add(userKey, {
    id: `user-${userId}`,
    name: `${name}'s Identity`,
    entityId: userId,
    scopes: ['user:profile', 'user:data']
  })
  
  return userKey
}

// Create identity for a service
const createServiceIdentity = async (serviceName: string) => {
  const master = await wallet.master()
  const serviceKey = master.derive(`service/${serviceName}`)
  
  await wallet.add(serviceKey, {
    id: `service-${serviceName}`,
    name: `${serviceName} Service`,
    entityId: serviceName,
    scopes: ['service:*']
  })
  
  return serviceKey
}
```

### Signature and Verification

```typescript
// Sign data with a specific key
const signWithProfile = async (data: string, profileId: string) => {
  const keys = await wallet.find({ id: profileId })
  if (keys.length === 0) {
    throw new Error('Profile key not found')
  }
  
  const key = keys[0]
  const signature = await key.sign(Buffer.from(data, 'utf8'))
  
  return {
    data,
    signature: signature.toString('base64'),
    did: key.did,
    publicKey: key.publicKey?.toString('base64')
  }
}

// Verify signature
const verifySignature = async (signedData: any) => {
  const key = await wallet.get(signedData.did)
  if (!key) {
    throw new Error('Key not found')
  }
  
  const signature = Buffer.from(signedData.signature, 'base64')
  const data = Buffer.from(signedData.data, 'utf8')
  
  return await key.verify(data, signature)
}
```

### Multi-Entity Wallet

```typescript
// Organization with multiple departments
const setupOrganizationWallet = async () => {
  const master = await wallet.master()
  
  // Organization master key
  const orgKey = master.derive('entity/acme-corp')
  await wallet.add(orgKey, {
    id: 'acme-corp',
    name: 'ACME Corporation',
    entityId: 'org-acme'
  })
  
  // Department keys
  const departments = ['hr', 'engineering', 'sales']
  
  for (const dept of departments) {
    const deptKey = orgKey.derive(`dept/${dept}`)
    await wallet.add(deptKey, {
      id: `acme-${dept}`,
      name: `ACME ${dept.toUpperCase()} Department`,
      entityId: `org-acme-${dept}`
    })
  }
  
  // Employee keys within departments
  const engineeringKey = await wallet.get('acme-engineering')
  const employeeKey = engineeringKey!.derive('employee/john-doe')
  
  await wallet.add(employeeKey, {
    id: 'john-doe-work',
    name: 'John Doe Work Identity',
    entityId: 'user-john-doe',
    groups: ['engineering', 'senior-dev']
  })
}
```

### Wallet Recovery

```typescript
// Recover wallet from mnemonic
const recoverWallet = async (mnemonic: string, store: DIDStore) => {
  // Create wallet allowing empty state
  const wallet = await makeWallet(store, { allowEmpty: true })
  
  // Import from mnemonic
  await wallet.generate({ mnemonic })
  
  // Verify master key was restored
  const master = await wallet.master()
  console.log('Recovered master DID:', master.did)
  
  // List all recovered keys
  const allKeys = await wallet.all()
  console.log(`Recovered ${allKeys.length} keys`)
  
  return wallet
}
```

### Key Export and Import

```typescript
// Export key for external use
const exportKey = async (keyId: string) => {
  const keys = await wallet.find({ id: keyId })
  if (keys.length === 0) {
    throw new Error('Key not found')
  }
  
  const key = keys[0]
  const meta = await wallet.meta(key)
  
  return {
    did: key.did,
    publicKey: key.publicKey?.toString('base64'),
    privateKey: key.privateKey?.toString('base64'), // Only if needed
    meta: {
      id: meta.id,
      name: meta.name,
      entityId: meta.entityId
    }
  }
}

// Import external key
const importKey = async (keyData: any) => {
  const keyModel = makeDidKeyModel({
    type: 'ed25519',
    publicKey: Buffer.from(keyData.publicKey, 'base64'),
    privateKey: keyData.privateKey ? Buffer.from(keyData.privateKey, 'base64') : undefined
  })
  
  await wallet.add(keyModel, keyData.meta)
}
```

## Advanced Features

### Custom Key Types

```typescript
// Register custom key type
const customKeyType = 'custom-ed25519'

const wallet = await makeWallet(store, {
  type: customKeyType,
  allowCustomType: true
})
```

### Hierarchical Path Management

```typescript
// Standardized path structure
const createStandardPath = (type: 'profile' | 'entity' | 'service', identifier: string, subpath?: string) => {
  const basePath = `${type}/${identifier}`
  return subpath ? `${basePath}/${subpath}` : basePath
}

// Usage
const userProfilePath = createStandardPath('profile', 'user123')
const serviceApiPath = createStandardPath('service', 'api', 'v1')
const entityDeptPath = createStandardPath('entity', 'corp', 'dept/engineering')
```

### Batch Operations

```typescript
// Batch key creation
const createBatchKeys = async (specifications: Array<{path: string, meta: Omit<KeyMeta, 'id'>}>) => {
  const master = await wallet.master()
  const keys: DIDKeyModel[] = []
  
  for (const spec of specifications) {
    const key = master.derive(spec.path)
    await wallet.add(key, {
      ...spec.meta,
      id: `${spec.meta.name.toLowerCase().replace(/\s+/g, '-')}`
    })
    keys.push(key)
  }
  
  return keys
}
```

## Error Handling

The package provides specialized error types:

```typescript
import { DIDWalletError, DIDKeyError, DIDInitializationError } from '@owlmeans/did'

try {
  const wallet = await makeWallet(store)
  await wallet.generate()
} catch (error) {
  if (error instanceof DIDInitializationError) {
    console.error('Wallet initialization failed:', error.message)
  } else if (error instanceof DIDKeyError) {
    console.error('Key operation failed:', error.message)
  } else if (error instanceof DIDWalletError) {
    console.error('Wallet operation failed:', error.message)
  }
}
```

## Integration with OwlMeans Ecosystem

The `@owlmeans/did` package integrates with:

- **@owlmeans/basic-keys**: Core cryptographic operations and key management
- **@owlmeans/auth**: Authentication and authorization with DID-based identities
- **@owlmeans/resource**: Storage backend for wallet data persistence
- **@owlmeans/client-did**: Client-side DID wallet implementations
- **@owlmeans/server-auth**: Server-side DID authentication
- **@owlmeans/context**: Service registration and dependency injection

## Security Considerations

- Store mnemonic phrases securely and never expose them in logs
- Use appropriate key derivation paths to prevent key correlation
- Implement proper access controls for wallet operations
- Regular backup of wallet data and mnemonic phrases
- Use secure random number generation for key creation
- Validate all imported keys and metadata

## Best Practices

### Key Management
- Use descriptive names and metadata for all keys
- Implement consistent path naming conventions
- Regular audit of stored keys and remove unused ones
- Use different keys for different purposes (signing, encryption, etc.)

### Security
- Never store private keys in plain text
- Use hardware security modules where possible
- Implement proper key rotation policies
- Monitor for unauthorized key access

### Performance
- Cache frequently used keys in memory
- Use batch operations for multiple key operations
- Implement proper indexing for key searches
- Consider key compression for storage efficiency

Fixes #32.