# @owlmeans/basic-keys

A core cryptographic library for the OwlMeans Common ecosystem, providing key pair generation, digital signing, encryption, and authentication credential management.

## Overview

The `@owlmeans/basic-keys` package implements the core cryptographic subsystem used primarily by the OwlMeans Authentication Subsystem. It provides a unified API for working with different cryptographic algorithms through an extensible plugin system.

## Features

- **Key Pair Management**: Generate, import, and export cryptographic key pairs
- **Digital Signatures**: Sign and verify data with ED25519 
- **Encryption**: Encrypt and decrypt data with XChaCha20-Poly1305
- **Authentication**: Pack and unpack authentication credentials
- **Plugin System**: Extensible architecture for different cryptographic algorithms
- **CLI Tool**: Command-line interface for key generation
- **Multiple Export Formats**: Support for various key export formats

## Supported Algorithms

- **ED25519**: Digital signatures and key derivation
- **XChaCha20-Poly1305**: Symmetric encryption and decryption

## Installation

```bash
npm install @owlmeans/basic-keys
```

## Available Exports

The package provides three main export paths:

```typescript
// Main exports - core functionality
import { makeKeyPairModel, KeyType, fromPubKey, matchAddress, inputToKeyPair, packAuthCredentials, unpackAuthCredentials } from '@owlmeans/basic-keys'

// Plugin exports - cryptographic algorithm implementations  
import { plugins, ed25519Plugin, xChahaPlugin, KeyPlugin } from '@owlmeans/basic-keys/plugins'

// Utility exports - low-level helper functions
import { prepareData, prepareKey, toAddress, assertType } from '@owlmeans/basic-keys/utils'
```

## Quick Start

```typescript
import { makeKeyPairModel, KeyType } from '@owlmeans/basic-keys'

// Generate a new ED25519 key pair
const keyPair = makeKeyPairModel()

// Sign data
const signature = await keyPair.sign("Hello, World!")

// Verify signature
const isValid = await keyPair.verify("Hello, World!", signature)

// Export keys
const privateKey = keyPair.export()          // "ed25519:base64privatekey"
const publicKey = keyPair.exportPublic()     // "ed25519:base64publickey"
const address = keyPair.exportAddress()      // "ed25519:base58address"
```

## API Reference

### Core Types

#### KeyPair

Represents a cryptographic key pair with metadata.

```typescript
interface KeyPair {
  privateKey: string  // Base64-encoded private key
  publicKey: string   // Base64-encoded public key
  address: string     // Algorithm-specific address
  type: string        // Algorithm type (e.g., "ed25519", "xchacha")
}
```

#### KeyPairModel

A model object that wraps a KeyPair with cryptographic operations.

```typescript
interface KeyPairModel {
  keyPair?: KeyPair
  sign: (data: unknown) => Promise<string>
  verify: (data: unknown, signature: string) => Promise<boolean>
  export: () => string
  exportPublic: () => string
  exportAddress: () => string
  encrypt: (data: unknown) => Promise<string>
  decrypt: (data: unknown) => Promise<string>
  dcrpt: (data: unknown) => Promise<Uint8Array>
}
```

### Key Functions

#### makeKeyPairModel(input?)

Creates a KeyPairModel instance.

```typescript
function makeKeyPairModel(input?: KeyPair | string): KeyPairModel
```

**Parameters:**
- `input` (optional): 
  - `KeyPair` object
  - Algorithm type string (e.g., "ed25519", "xchacha")
  - Encoded private key string (e.g., "ed25519:base64key")

**Returns:** `KeyPairModel` instance

**Examples:**

```typescript
// Generate new ED25519 key pair
const keyPair1 = makeKeyPairModel()

// Generate new XChaCha20 key pair
const keyPair2 = makeKeyPairModel(KeyType.XCHACHA)

// Import from private key
const keyPair3 = makeKeyPairModel("ed25519:abcd1234...")

// Import from KeyPair object
const keyPair4 = makeKeyPairModel({
  privateKey: "abcd1234...",
  publicKey: "efgh5678...",
  address: "ijkl9012...",
  type: "ed25519"
})
```

#### fromPubKey(pubKey, type?)

Creates a KeyPairModel from a public key (verification/encryption only).

```typescript
function fromPubKey(pubKey: string, type?: string): KeyPairModel
```

**Parameters:**
- `pubKey`: Public key string (with or without type prefix)
- `type` (optional): Algorithm type if not included in pubKey

**Returns:** `KeyPairModel` instance (without private key operations)

**Examples:**

```typescript
// With type prefix
const publicKeyModel = fromPubKey("ed25519:abcd1234...")

// Without type prefix (defaults to ED25519)
const publicKeyModel2 = fromPubKey("abcd1234...")

// Explicit type
const publicKeyModel3 = fromPubKey("abcd1234...", KeyType.ED25519)
```

#### matchAddress(address, pubKey)

Verifies if a public key matches an address.

```typescript
function matchAddress(address: string, pubKey: string): boolean
```

**Parameters:**
- `address`: Address string to verify
- `pubKey`: Public key string

**Returns:** `boolean` - true if the public key matches the address

#### inputToKeyPair(input?)

Converts various input formats to a KeyPair object.

```typescript
function inputToKeyPair(input?: KeyPair | string): KeyPair
```

**Parameters:**
- `input` (optional): 
  - `KeyPair` object
  - Algorithm type string (generates new key)
  - Encoded private key string (e.g., "ed25519:base64key")

**Returns:** `KeyPair` object

**Examples:**

```typescript
// Generate new ED25519 key pair
const keyPair1 = inputToKeyPair()

// Generate new XChaCha20 key pair
const keyPair2 = inputToKeyPair(KeyType.XCHACHA)

// Import from private key
const keyPair3 = inputToKeyPair("ed25519:abcd1234...")
```

### Authentication Helpers

#### packAuthCredentials(auth, extra, signer)

Packs authentication credentials with a signature.

```typescript
function packAuthCredentials<T>(
  auth: UnsignedAuthCredentials,
  extra: T,
  signer: KeyPairModel | PayloadSigner
): Promise<AuthCredentials>
```

**Parameters:**
- `auth`: Unsigned authentication credentials
- `extra`: Additional data to include in credentials
- `signer`: KeyPairModel or custom signing function

**Returns:** Promise resolving to signed `AuthCredentials`

#### unpackAuthCredentials(auth, verifier?)

Unpacks and optionally verifies authentication credentials.

```typescript
function unpackAuthCredentials<T>(
  auth: AuthCredentials,
  verifier?: KeyPairModel | PayloadVerifier
): Promise<UnpackedAuthCredentials<T>>
```

**Parameters:**
- `auth`: Signed authentication credentials
- `verifier` (optional): KeyPairModel or custom verification function

**Returns:** Promise resolving to `UnpackedAuthCredentials<T>`

### Constants

#### KeyType

Enumeration of supported cryptographic algorithm types.

```typescript
enum KeyType {
  ED25519 = 'ed25519',
  XCHACHA = 'xchacha'
}
```

### Utility Functions

#### toAddress(publicKey)

Converts a public key to its corresponding address.

```typescript
function toAddress(publicKey: Uint8Array): Uint8Array
```

**Parameters:**
- `publicKey`: Public key as Uint8Array

**Returns:** `Uint8Array` - Address bytes (last 20 bytes of Keccak-256 hash)

#### prepareData(data)

Converts various data types to Uint8Array for cryptographic operations.

```typescript
function prepareData(data: unknown): Uint8Array
```

#### prepareKey(key)

Converts a base64-encoded key string to Uint8Array.

```typescript
function prepareKey(key: string): Uint8Array
```

#### assertType(type?)

Validates that a cryptographic algorithm type is supported.

```typescript
function assertType(type?: string): void
```

## Plugin System

The library uses a plugin architecture to support different cryptographic algorithms. Each plugin implements the `KeyPlugin` interface:

```typescript
interface KeyPlugin {
  type: string
  random: () => Uint8Array
  fromSeed?: (seed: Uint8Array) => Uint8Array
  derive?: (pk: Uint8Array, path: string) => Uint8Array
  sign: (data: Uint8Array, pk: Uint8Array) => Uint8Array
  verify: (data: Uint8Array, signature: Uint8Array, pub: Uint8Array) => boolean
  toPublic: (pk: Uint8Array) => Uint8Array
  toAdress: (pub: Uint8Array) => string
  encrypt: (data: Uint8Array, pk: Uint8Array) => Uint8Array
  decrypt: (data: Uint8Array, pk: Uint8Array) => Uint8Array
}
```

### Built-in Plugins

#### ED25519 Plugin

- **Type**: `ed25519`
- **Capabilities**: Digital signatures, key derivation
- **Address Format**: Base58-encoded Keccak-256 hash
- **Encryption**: Not supported (throws error)

#### XChaCha20-Poly1305 Plugin

- **Type**: `xchacha`
- **Capabilities**: Symmetric encryption and decryption
- **Address Format**: "no-address" (not applicable)
- **Signing**: Not supported (throws error)

### Using Plugins

```typescript
import { plugins } from '@owlmeans/basic-keys/plugins'
// Or import individual plugins
import { ed25519Plugin, xChahaPlugin } from '@owlmeans/basic-keys/plugins'

// Access plugin directly
const ed25519Plugin = plugins['ed25519']

// Generate random private key
const privateKey = ed25519Plugin.random()

// Convert to public key
const publicKey = ed25519Plugin.toPublic(privateKey)

// Sign data
const signature = ed25519Plugin.sign(data, privateKey)

// Verify signature
const isValid = ed25519Plugin.verify(data, signature, publicKey)
```

## CLI Tool

The package includes a command-line tool for key generation:

```bash
# Generate keys
npx owlkeys

# Or if installed globally
owlkeys
```

The CLI tool generates and displays:
- ED25519 private key export
- ED25519 public key export
- ED25519 address (DID format)
- XChaCha20 key export

## Advanced Usage

### Custom Signing and Verification

```typescript
import type { PayloadSigner, PayloadVerifier } from '@owlmeans/basic-keys'

// Custom signer function
const customSigner: PayloadSigner = async (payload) => {
  // Custom signing logic
  return signature
}

// Custom verifier function
const customVerifier: PayloadVerifier = async (payload, signature) => {
  // Custom verification logic
  return isValid
}

// Use with authentication helpers
const credentials = await packAuthCredentials(auth, extra, customSigner)
const unpacked = await unpackAuthCredentials(credentials, customVerifier)
```

### Working with Raw Data

```typescript
import { prepareData, prepareKey, toAddress, assertType } from '@owlmeans/basic-keys/utils'

// Prepare various data types for cryptographic operations
const data1 = prepareData("string data")           // UTF-8 encoded
const data2 = prepareData({ key: "value" })        // JSON canonicalized
const data3 = prepareData(new Uint8Array([1, 2]))  // As-is

// Prepare keys
const keyBytes = prepareKey("base64KeyString")

// Generate address from public key
const address = toAddress(publicKeyBytes)

// Assert algorithm type is supported
assertType("ed25519") // No error
assertType("unknown") // Throws error
```

### Encryption and Decryption

```typescript
// For encryption, use XChaCha20 keys
const encryptionKey = makeKeyPairModel(KeyType.XCHACHA)

// Encrypt data
const encrypted = await encryptionKey.encrypt("sensitive data")

// Decrypt data  
const decrypted = await encryptionKey.decrypt(encrypted)

// Decrypt to raw bytes
const rawBytes = await encryptionKey.dcrpt(encrypted)
```

## Error Handling

The library throws descriptive errors for various failure conditions:

- `basic.keys:string-type-or-key` - Invalid key string format
- `basic.keys:missing-keypair` - KeyPair not available
- `basic.keys:missing-pk` - Private key not available
- `basic.keys:sign-data-type` - Invalid data type for signing
- `basic.keys:unknown-type` - Unsupported algorithm type
- `ed25519:encryption-support` - ED25519 doesn't support encryption
- `xchacha:signing` - XChaCha20 doesn't support signing
- `xchacha:verification` - XChaCha20 doesn't support verification

## Integration with OwlMeans Common

This package is designed to integrate seamlessly with other OwlMeans Common libraries:

- **@owlmeans/auth**: Authentication and authorization
- **@owlmeans/client-auth**: Client-side authentication
- **@owlmeans/server-auth**: Server-side authentication

## TypeScript Support

The library is written in TypeScript and provides comprehensive type definitions. All exports are properly typed for optimal developer experience.

## Security Considerations

- Private keys are stored as base64-encoded strings
- All cryptographic operations use well-established libraries (@noble/curves, @noble/ciphers)
- Data is canonicalized before signing to prevent signature malleability
- Key generation uses cryptographically secure random number generation

## Contributing

This package is part of the OwlMeans Common ecosystem. Please refer to the main repository for contribution guidelines.

## License

See the LICENSE file in the repository root for license information.