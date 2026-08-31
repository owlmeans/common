# @owlmeans/error

Serializable error base class with type registration for cross-process error propagation.

## Overview

- `ResilientError` base class survives JSON serialization/deserialization across service boundaries
- Error class registry ensures custom error types are correctly reconstructed after transport
- Helpers for marshaling errors to strings and back

## Installation

```bash
bun add @owlmeans/error
```

## Usage

Define and register a custom error type:

```typescript
import { ResilientError } from '@owlmeans/error'

export class ProjectResourceError extends ResilientError {
  static typeName = 'viable-project:error'

  constructor(message: string = 'error') {
    super(`viable-project:${message}`)
    this.type = ProjectResourceError.typeName
  }
}

ResilientError.registerErrorClass(ProjectResourceError)
```

Marshal errors across service boundaries:

```typescript
import { marshalError, ResilientError } from '@owlmeans/error'

// Server side: serialize for transport
const serialized = marshalError(caughtError)

// Client side: reconstruct the typed error
const restored = ResilientError.ensure(receivedError)
```

## API

### `ResilientError`

Base class for all OwlMeans errors.

- `static typeName: string` — override in subclasses to identify the error type
- `static registerErrorClass(cls)` — register a subclass for automatic reconstruction from JSON
- `static ensure(err, throwOnUnknown?)` — convert any error to `ResilientError`
- `static marshal(err)` — serialize an error to a transportable `Error` object
- `type: string` — error type identifier set in the constructor

### `marshalError(err): Error`

Convenience: ensures the error is a `ResilientError`, then marshals it.

### `enuserError<T>(err): T`

Ensures an unknown caught value is a `ResilientError`. Alias for `ResilientError.ensure`.

### `ValueOrError<T>`

```typescript
type ValueOrError<T> = T | ResilientError
```

## Related Packages

- [`@owlmeans/context`](../context) — context and services that propagate errors through the app

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
