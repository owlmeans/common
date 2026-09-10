---
name: error
description: How to use @owlmeans/error — ResilientError, the error class registry, marshalling errors across a service boundary and back, and the i18n namespace error messages resolve through. Auto-invoked when importing from this package, declaring a typed framework error, or normalizing a caught error.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/error

**Layer:** Core
**Install:** `"@owlmeans/error": "^0.1.18-rc.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ResilientError` | Base class — every framework error extends it |
| `ResilientError.registerErrorClass(Class)` | Register a subclass so it survives a round trip |
| `ResilientError.ensure(err)` | Turn anything caught into a `ResilientError` |
| `ResilientError.marshal(err)` / `err.marshal()` | Flatten into a plain `Error` a transport can carry |
| `enuserError(err)` | `ensure`, typed to the subclass you expect |
| `marshalError(err)` | `ensure` then `marshal`, for a boundary that only sends `Error` |
| `SEPARATOR` (`'\|\|\|'`), `RESILENT_ERROR` | The marshalling separator and the base type name |
| `Converter` | `{ match, convert, isMarshaled, unmarshal }` — one registry entry |
| `ResilientErrorConstructor` | The constructor shape `registerErrorClass` accepts |
| `ValueOrError<T>` | `T \| ResilientError`, for a result that carries either |

## Declaring an error

A subclass owns a static `typeName` and prefixes its messages, so the pair `type` + `message` is
enough to identify what went wrong anywhere the error travels. **Register it** — registration is
what makes a marshaled error come back as the class it was thrown as. Skip it and the far side gets
an unusable `ResilientError` whose `type` is the whole marshaled string (see below).

```typescript
import { ResilientError } from '@owlmeans/error'

export class ApiError extends ResilientError {
  public static override typeName = 'ApiError'

  constructor(message: string = 'error') {
    super(ApiError.typeName, `api:${message}`)
  }
}

export class RateLimitError extends ApiError {
  public static override typeName = `${ApiError.typeName}:RateLimit`

  constructor(message: string = 'error') {
    super(`rate-limit:${message}`)
    this.type = RateLimitError.typeName
  }
}

ResilientError.registerErrorClass(ApiError)
ResilientError.registerErrorClass(RateLimitError)

throw new RateLimitError('per-minute')
```

A subclass of a subclass calls `super` with the message alone and then re-stamps `this.type` — the
parent supplies its own prefix, so the final message reads `api:rate-limit:per-minute`.

`registerErrorClass` takes a second, native-class argument, and `ensure` takes a second
`throwOnUnknown` argument. **Neither has any effect** — a catch-all converter is pushed onto the
registry when this package loads and it is the first entry `ensure` tests for conversion, so no
later converter and no `throwOnUnknown` branch is ever reached. Register the class alone, and treat
`ensure` as taking one argument.

## Normalizing what you caught

`ensure` gives you a `ResilientError` for anything caught, but only a **registered, marshaled**
error survives with its identity intact. Route errors that must keep their type through
`marshal`/`ensure`; do not rely on `ensure` alone to normalize an arbitrary throw.

```typescript
try { /* ... */ } catch (e) {
  const err = ResilientError.ensure(e as Error)
  if (err instanceof RateLimitError) { /* the registered class came back */ }
}
```

What `ensure` actually does, in order:

| Input | Result |
|-------|--------|
| A `ResilientError` | returned untouched |
| A `SyntaxError` | rethrown — never converted |
| An `Error` marshaled from a **registered** class | unmarshaled into that class, `type` and `message` restored |
| Anything else | a bare `ResilientError` whose **`type` is the original `message`** and whose **`message` is the original stack** |

That last row is the trap: the fields are shifted, so an unregistered marshaled error arrives with
`type` set to the whole `Type|||message|||stack` string, and a plain `new Error('boom')` arrives with
`type: 'boom'`. Read `.type` only where the error came back through the registered path; keep the
original around when you need its message.

**`SyntaxError` is never converted — it is rethrown.** A `SyntaxError` in this framework means the
process is wired wrong (an unknown alias, a missing service, a route cycle), and it must crash
rather than reach a user as a handled failure. Do not throw one for a runtime condition a caller is
expected to handle.

## Crossing a service boundary

`marshal` flattens `type`, `message` and the original stack into one `Error` message joined by
`SEPARATOR`. On the far side `ensure` recognises the prefix and rebuilds the registered class, so a
typed error thrown in a backend is caught as the same class in a client. Override
`finalizeUnmarshal()` on a subclass that needs to rebuild state from its message after that.

## Messages are i18n keys

Importing this package registers the `errors` translation library for every bundled locale. UIs
resolve an error by its `type` — `errors.<type>`, with a form- or screen-scoped key tried first —
so the message a user reads comes from the translations, never from the thrown string. Ship a
translation for each error type you declare.

## Depends On

- `@owlmeans/i18n` — the translation library the `errors` namespace is registered in
