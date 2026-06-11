# @owlmeans/basic-ids

Utilities for generating cryptographically secure random IDs and UUIDs.

## Overview

- Fixed-length random IDs in Base58 or Base64 encoding
- UUID v4 generation
- Used throughout OwlMeans for generating run IDs, listener IDs, and entity identifiers

## Installation

```bash
bun add @owlmeans/basic-ids
```

## Usage

```typescript
import { createIdOfLength, createRandomPrefix, uuid } from '@owlmeans/basic-ids'

// Generate a 12-character Base58 ID (default encoding)
const runId = createIdOfLength(12)

// Generate a random prefix (useful for namespaced IDs)
const prefix = createRandomPrefix(6)

// Standard UUID v4
const id = uuid()
```

With explicit encoding:

```typescript
import { createIdOfLength, IdStyle } from '@owlmeans/basic-ids'

const base64Id = createIdOfLength(16, IdStyle.Base64)
```

## API

### `createIdOfLength(length?, format?): string`

Returns a random ID of exactly `length` characters (default: 6) in `format` encoding (default: Base58).

### `createRandomPrefix(length?, format?): string`

Returns a random string encoded from `length` random bytes (default: 6 bytes).

### `uuid(): string`

Returns a UUID v4 string.

### `IdStyle`

```typescript
enum IdStyle { Base58 = 'base58', Base64 = 'base64' }
```

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded Claude Code skills and GitHub Copilot instructions under
`agent-meta/`. After installing your `@owlmeans/*` packages, run the OwlMeans
agent-skills installer to place them into your project's native locations
(`.claude/skills/` and `.github/instructions/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
