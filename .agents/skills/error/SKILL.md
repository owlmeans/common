---
name: error
description: How to use @owlmeans/error — ResilientError, the error class registry, marshalling errors across a service boundary and back, and the i18n namespace error messages resolve through. Auto-invoked when importing from this package, declaring a typed framework error, or normalizing a caught error.
user-invocable: false
---

# @owlmeans/error

**Layer:** Core
**Install:** `"@owlmeans/error": "^0.1.18-rc.32"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ResilientError` | Base class — every framework error extends it |
| `ResilientError.registerErrorClass(Class)` | Register a subclass so it survives a round trip |
| `ResilientError.ensure(err)` | Turn anything caught into a `ResilientError` |
| `ResilientError.marshal(err)` / `err.marshal()` | Flatten into a plain `Error` a transport can carry |
| `enuserError(err)` | `ensure`, typed to the subclass you expect |
| `marshalError(err)` | `ensure` then `marshal`, for a boundary that only sends `Error` |
| `isResilientError(value)` | Structural check that holds across duplicate module copies |
| `SEPARATOR` (`'\|\|\|'`), `RESILENT_ERROR` | The marshalling separator and the base type name |
| `RESILIENT_BRAND`, `CONVERTER_REGISTRY`, `CATCH_ALL_CONVERTER` | The `Symbol.for` keys every copy shares |
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

**A refusal of the caller's condition declares its HTTP status** as `public static httpStatus = <4xx>`;
a fault — a broken peer, a timeout, a missing configuration, a bug — declares nothing and answers 500.
One principle picks the number:

| Status | The caller's condition |
|---|---|
| 400 | the request is malformed |
| 402 | the balance or plan does not pay for it |
| 404 | the addressed target does not exist, or is another organization's |
| 409 | the target's current state conflicts with the request |
| 422 | the request is understood, and its content or body is refused |

Declare it on the leaf class, never on a family base: a static is inherited, so a base's status
would reach every fault that extends it. A class thrown for several causes takes the status of the
cause a caller can reach, and one whose causes are told apart only by message declares nothing.
Nothing here reads it — `@owlmeans/server-api` does, structurally, and answers 500 for any class
without an integer 4xx declaration (see the `server-api` skill). A permission refusal extends
`AuthForbidden` (403) instead of declaring.

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
| A `ResilientError` from any copy of this package | returned untouched |
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

## Duplicate module copies behave as one

A process can load this package more than once — `bun --preserve-symlinks` over linked workspaces
keys a module by its unresolved path, so a package that keeps its own
`node_modules/@owlmeans/error` link loads a second copy. Every copy acts as one:

- **One registry.** `ResilientError.converters` is the array kept on `globalThis` under
  `Symbol.for('@owlmeans/error:converters')`; every copy registers into it and unmarshals from it,
  in registration order, so the **last registration of a type name wins** across copies. One
  catch-all converter exists per process.
- **One brand.** Every instance inherits `Symbol.for('@owlmeans/error:resilient')` from its copy's
  prototype. `isResilientError(value)` is brand + string `type` + `marshal` function; `ensure`
  returns such a value untouched and `marshal` keeps its `type`. A lookalike without the brand is
  not a resilient error.
- **`instanceof` across copies.** `ResilientError[Symbol.hasInstance]` answers natively first, then
  structurally: the instance's lineage of OWN `typeName`s must end with the checked class's lineage.
  A class from another copy matches itself and its ancestors, never a sibling or a parent. A class
  that does not declare its own `typeName` matches natively only — declare one on every subclass.

## Crossing a service boundary

`marshal` flattens `type`, `message`, the selected stack exposure and an optional incident id into
one `Error` message joined by `SEPARATOR`. On the far side `ensure` recognises the prefix and rebuilds
the registered class, so a typed error thrown in a backend is caught as the same class in a client.
The HTTP boundary attaches the incident id to the logged error and sends only that id in production;
development callers may select the stack explicitly. Override
`finalizeUnmarshal()` on a subclass that needs to rebuild state from its message after that.

## Messages are i18n keys

Importing this package registers the `errors` translation library for every bundled locale. UIs
resolve an error by its `type` — `errors.<type>`, with a form- or screen-scoped key tried first —
so the message a user reads comes from the translations, never from the thrown string. Ship a
translation for each error type you declare.

## Depends On

- `@owlmeans/i18n` — the translation library the `errors` namespace is registered in
