# @owlmeans/error

Serializable error base class with a type registry, so a typed error thrown in one process is
caught as the same class in another. An app uses it for every error that has to cross a service
boundary (HTTP, socket, queue) or reach a UI as a translated message: declare a `ResilientError`
subclass, register it in the shared module both sides import, and normalize whatever you catch
with `ResilientError.ensure`. It is not for wiring faults — an unknown alias or a missing service
is a `SyntaxError` that must crash the process. Before declaring a new family, reuse the ones
framework packages already ship: authentication and authorization failures from
[`@owlmeans/auth`](../auth), storage failures from [`@owlmeans/resource`](../resource).

## Installation

```bash
bun add @owlmeans/error@^0.1.18-rc.27
```

## Concepts

- **Resilient error** — a `ResilientError` carries a `type` (the class's static `typeName`) next to
  its `message`; the pair identifies the failure anywhere it travels.
- **Error family** — a base subclass that prefixes every message (`invoice:`) and subclasses that
  add their own prefix and re-stamp `type`, so the final message reads `invoice:not-found:<id>`.
- **Registry** — `ResilientError.converters`, filled by `registerErrorClass`; only a registered
  class comes back as itself after transport.
- **Marshalling** — `marshal` flattens `type`, `message` and the original stack into one plain
  `Error` whose message is joined by `SEPARATOR` (`|||`); `ensure` recognises that prefix and
  rebuilds the registered class.
- **Errors namespace** — importing the package registers the `errors` i18n library; UIs resolve a
  message by the error's `type`, never by the thrown string.

## Usage

### Declare and register an error family

Keep errors in the shared (`common`) module that both the server and the client import, and
register every class at module load.

```ts
import { ResilientError } from '@owlmeans/error'

export class InvoiceError extends ResilientError {
  public static override typeName = 'MyAppInvoiceError'

  constructor(message: string = 'error') {
    super(InvoiceError.typeName, `invoice:${message}`)
  }
}

export class InvoiceNotFound extends InvoiceError {
  public static override typeName = `NotFound${InvoiceError.typeName}`

  constructor(message: string = 'error') {
    super(`not-found:${message}`)
    this.type = InvoiceNotFound.typeName
  }
}

export class InvoiceLocked extends InvoiceError {
  public static override typeName = `Locked${InvoiceError.typeName}`

  constructor(message: string = 'error') {
    super(`locked:${message}`)
    this.type = InvoiceLocked.typeName
  }
}

ResilientError.registerErrorClass(InvoiceError)
ResilientError.registerErrorClass(InvoiceNotFound)
ResilientError.registerErrorClass(InvoiceLocked)

throw new InvoiceNotFound('inv-42') // message: 'invoice:not-found:inv-42'
```

A subclass of a subclass calls `super` with the message alone — the parent adds its own prefix and
`type`, so the subclass re-stamps `this.type` afterwards.

### Normalize what you caught

`ensure` accepts an `Error` or a string and always returns a `ResilientError`, so a handler can
branch on the registered classes it knows and fall through for the rest.

```ts
import { ResilientError } from '@owlmeans/error'
import { InvoiceLocked, InvoiceNotFound } from '@my-app/common'

export const settle = async (invoiceId: string) => {
  try {
    await payInvoice(invoiceId)
  } catch (e) {
    const err = ResilientError.ensure(e as Error)
    if (err instanceof InvoiceNotFound || err instanceof InvoiceLocked) {
      return { settled: false, reason: err.type }
    }
    throw err
  }
}
```

A small helper keeps catch blocks typed when the caught value is `unknown`:

```ts
import { ResilientError } from '@owlmeans/error'

export const asError = <T extends ResilientError>(err: unknown): T =>
  typeof err === 'string' || err instanceof Error
    ? ResilientError.ensure(err) as T
    : ResilientError.ensure(`Unknown error ${String(err)}`) as T
```

### Cross a service boundary

The HTTP transports already do this: `@owlmeans/server-api` answers a thrown error with
`ResilientError.marshal(ResilientError.ensure(error)).message` as the body, and `@owlmeans/api`
turns a string body back into the registered class with `ResilientError.ensure`. So a backend throw
is caught as the same class around `context.entrypoint(invoiceProtocols.settle).call(...)` in the
client. A boundary you own — a WebSocket close reason, a stored failure record — does the same by hand:

```ts
import { enuserError, marshalError } from '@owlmeans/error'
import { InvoiceError } from '@my-app/common'

// Producer: send only the flattened string.
socket.close(1011, marshalError(caught).message)

// Consumer: rebuild the registered class, typed to the family you expect.
socket.addEventListener('close', event => {
  const err = enuserError<InvoiceError>(event.reason)
  if (err instanceof InvoiceError) {
    showInvoiceProblem(err.type)
  }
})
```

The round trip is worth a test for any error whose identity the far side depends on:

```ts
import { expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import { InvoiceNotFound } from '@my-app/common'

test('an invoice miss survives the hop as its own class', () => {
  const restored = ResilientError.ensure(
    ResilientError.marshal(new InvoiceNotFound('inv-42')).message
  )

  expect(restored).toBeInstanceOf(InvoiceNotFound)
  expect(restored.message).toBe('invoice:not-found:inv-42')
})
```

### Rebuild state after unmarshalling

Only `type`, `message` and the stack travel. A subclass that exposes structured data derives it
from the message in `finalizeUnmarshal()`, which runs after the message is restored.

```ts
import { ResilientError } from '@owlmeans/error'

export class QuotaExceeded extends ResilientError {
  public static override typeName = 'MyAppQuotaExceeded'

  public limit?: number

  constructor(message: string = 'error') {
    super(QuotaExceeded.typeName, `quota:${message}`)
    this.finalizeUnmarshal()
  }

  override finalizeUnmarshal(): void {
    const tail = Number(this.message.split(':').pop())
    this.limit = Number.isFinite(tail) ? tail : undefined
  }
}

ResilientError.registerErrorClass(QuotaExceeded)
```

### Translate errors in the UI

Panel components resolve an error through `errors.<type>` — a form- or screen-scoped
`<name>.errors.<type>` key first, then `errors.<type>` in the screen's namespace, then the shared
`errors` library. Ship a translation for every type you declare, in every supported language:

```json
{
  "errors": {
    "MyAppInvoiceError": "The invoice could not be processed",
    "NotFoundMyAppInvoiceError": "This invoice no longer exists",
    "LockedMyAppInvoiceError": "The invoice is being settled, try again shortly"
  }
}
```

## API

### Classes

| Symbol | Kind | Purpose |
|--------|------|---------|
| `ResilientError` | class | Base class of every framework error; `constructor(type, message, stack?)` |
| `ResilientError.typeName` | static property | Type identifier; override in each subclass (`'ResilientError'` on the base) |
| `ResilientError.separator` | static property | Marshalling separator, initialised from `SEPARATOR` |
| `ResilientError.converters` | static property | The registry of `Converter` entries — one array on `globalThis`, shared by every copy of the package in the process |
| `ResilientError[Symbol.hasInstance]` | static method | `instanceof` that also matches an instance of the same class lineage built by another copy of the package |
| `ResilientError.registerErrorClass(Class, errorClass?)` | static method | Registers a subclass so it survives a round trip; returns its `Converter` |
| `ResilientError.ensure(err, throwOnUnknown?)` | static method | Turns an `Error` or string into a `ResilientError`, unmarshalling registered classes |
| `ResilientError.marshal(err)` | static method | Flattens an error into a plain `Error` whose message is `type`, `message` and stack joined by `SEPARATOR` |
| `error.type` | instance property | The error's type identifier |
| `error.oiriginalStack` | instance property | The stack captured at the original throw (spelling as in source) |
| `error.marshal()` | instance method | `ResilientError.marshal(this)` |
| `error.finalizeUnmarshal()` | instance method | Hook run after unmarshalling; no-op by default |

### Functions and constants

| Symbol | Kind | Purpose |
|--------|------|---------|
| `enuserError<T>(err, throwOnUnknown?)` | function | `ResilientError.ensure`, typed to the subclass you expect |
| `marshalError(err)` | function | `ensure` then `marshal`, for a boundary that only carries an `Error` or a string |
| `isResilientError(value)` | function | Structural check (shared brand + `type` + `marshal`) that holds across duplicate module copies |
| `SEPARATOR` | constant | Three pipe characters — joins the marshalled fields |
| `RESILENT_ERROR` | constant | `'ResilientError'` — the base type name |
| `RESILIENT_BRAND`, `CONVERTER_REGISTRY`, `CATCH_ALL_CONVERTER` | constant | `Symbol.for` keys every copy of the package shares |

### Types

| Symbol | Kind | Purpose |
|--------|------|---------|
| `ValueOrError<T>` | type | `T \| ResilientError`, for a result that carries either |
| `Converter` | interface | `{ match, convert, isMarshaled, unmarshal }` — one registry entry |
| `ResilientErrorConstructor<T>` | interface | The constructor shape `registerErrorClass` accepts: `new (message, stack?)` plus `typeName` |

### Side effect

Importing the package registers the `errors` i18n library (via `addI18nLib` from
`@owlmeans/i18n`) for `en`, `pl`, `ru`, `be`, `uk`, `es` and `de`. There are no subpath exports.

## Common pitfalls

- Register every subclass. An unregistered error comes back as a bare `ResilientError` whose
  `type` is the whole `Type|||message|||stack` string.
- `ensure` on an unregistered, unmarshalled throw shifts the fields: `new Error('boom')` arrives
  with `type: 'boom'` and the stack as its `message`. Read `.type` only on errors that came back
  through the registered path.
- `SyntaxError` is rethrown by `ensure`, never converted. Do not throw one for a runtime condition a
  caller is expected to handle.
- The second argument of `registerErrorClass` and `ensure`'s `throwOnUnknown` have no effect — a
  catch-all converter is matched first. Register the class alone and treat `ensure` as one-argument.
- A subclass constructor must accept `(message, stack?)`: unmarshalling calls `new Class(message,
  stack)`. Keep extra state in the message and rebuild it in `finalizeUnmarshal()`.
- Registration happens at import time. The module declaring the errors must be loaded on the
  receiving side before an error is ensured, or the class cannot be rebuilt.
- Keep `typeName` unique per process; show users the translation of `errors.<type>`, never the
  thrown message.

## Related packages

- [`@owlmeans/i18n`](../i18n) — the registry the `errors` library is added to
- [`@owlmeans/client-i18n`](../client-i18n) — React hooks that resolve `errors.<type>` keys
- [`@owlmeans/auth`](../auth) — the authentication and authorization error hierarchy
- [`@owlmeans/resource`](../resource) — resource errors built on `ResilientError`
- [`@owlmeans/server-api`](../server-api) — marshals thrown errors into HTTP responses
- [`@owlmeans/api`](../api) — rebuilds marshalled errors from HTTP responses
- [`@owlmeans/client-panel`](../client-panel) — panel and form components that translate errors by type
- [`@owlmeans/context`](../context) — context and services that propagate errors through the app

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.29
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
