# OwlMeans Basic IDs — Basic ID Generating Libraries

A lightweight TypeScript library for generating various types of random and semi-random identifiers. This package is primarily used by the OwlMeans Authentication Subsystem and provides utilities for creating secure, random prefixes and IDs in different encoding formats.

## Installation

```bash
npm install @owlmeans/basic-ids
```

## Usage

```typescript
import { createRandomPrefix, createIdOfLength, uuid, IdStyle } from '@owlmeans/basic-ids';

// Generate a random prefix (default: 6 bytes, Base58 encoded)
const prefix = createRandomPrefix();

// Generate a specific length ID
const shortId = createIdOfLength(8, IdStyle.Base58);

// Generate a UUID v4
const id = uuid();
```

## API Reference

### IdStyle Enum

Defines the available encoding formats for generated IDs.

```typescript
enum IdStyle {
  Base58 = 'base58',
  Base64 = 'base64'
}
```

**Values:**
- `Base58`: Uses Base58 encoding (default) - more compact, URL-safe, and avoids ambiguous characters
- `Base64`: Uses Base64 URL-safe encoding without padding - standard web-safe encoding

### createRandomPrefix(length?, format?)

Creates a random prefix using cryptographically secure random bytes.

**Parameters:**
- `length` (optional): `number` - Number of random bytes to generate (default: 6)
- `format` (optional): `IdStyle` - Encoding format (default: `IdStyle.Base58`)

**Returns:** `string` - The encoded random prefix

**Example:**
```typescript
// Generate 6-byte Base58 prefix (default)
const prefix1 = createRandomPrefix();

// Generate 10-byte Base64 prefix
const prefix2 = createRandomPrefix(10, IdStyle.Base64);

// Generate 4-byte Base58 prefix
const prefix3 = createRandomPrefix(4, IdStyle.Base58);
```

### createIdOfLength(length?, format?)

Creates an ID of a specific character length by generating random bytes and truncating the encoded result.

**Parameters:**
- `length` (optional): `number` - Desired character length of the final ID (default: 6)
- `format` (optional): `IdStyle` - Encoding format (default: `IdStyle.Base58`)

**Returns:** `string` - The encoded ID trimmed to the specified length

**Example:**
```typescript
// Generate 6-character Base58 ID (default)
const id1 = createIdOfLength();

// Generate 12-character Base64 ID
const id2 = createIdOfLength(12, IdStyle.Base64);

// Generate 8-character Base58 ID
const id3 = createIdOfLength(8, IdStyle.Base58);
```

**Note:** This function generates `length * 2` random bytes and then truncates the encoded result to the desired length to ensure sufficient entropy.

### uuid()

Generates a standard UUID version 4 (random UUID).

**Returns:** `string` - A UUID v4 string in the format `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`

**Example:**
```typescript
const id = uuid();
// Example output: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

## Use Cases

### Authentication Tokens
```typescript
// Generate a session prefix
const sessionPrefix = createRandomPrefix(8, IdStyle.Base58);

// Generate a short API key
const apiKey = createIdOfLength(32, IdStyle.Base64);
```

### Resource Identifiers
```typescript
// Generate short resource IDs
const resourceId = createIdOfLength(10);

// Generate unique request IDs
const requestId = uuid();
```

### Database Keys
```typescript
// Generate compact database keys
const dbKey = createRandomPrefix(12, IdStyle.Base58);
```

## Security Considerations

- All random functions use cryptographically secure random number generation via `@noble/hashes`
- Base58 encoding avoids ambiguous characters (0, O, l, I) making IDs more user-friendly
- Base64 encoding provides standard web-safe encoding
- The `createIdOfLength` function generates extra entropy to compensate for truncation

## Dependencies

- `@noble/hashes` - Cryptographic hashing and random number generation
- `@scure/base` - Base encoding utilities (Base58, Base64)
- `uuid` - UUID generation

## Part of OwlMeans Common

This package is part of the OwlMeans Common library ecosystem. For more information about the overall architecture and concepts, see the [main README](../../README.md).

## License

See the [LICENSE](../../LICENSE) file in the root directory.