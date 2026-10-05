# owlmeans-code-structure — reference

## Contents
- Classifying a declaration
- File roles
- Deciding the shape of a module
- Converting a module, step by step
- Binding: choosing the target
- Interfaces over types: the conversions
- Pitfalls

## Classifying a declaration

| Kind | What it is | Goes to |
|---|---|---|
| type | `interface`, `type` alias, `declare const x: unique symbol` brand | `types.ts` / `types.local.ts` |
| constant | an enum, or a `const` whose initializer is a literal, an object/array of constants, a template over constants, `Object.freeze`/`as const`/`satisfies` of those, `new Set/Map/RegExp` over constants, or `.map/.filter/.concat` over constants | `consts.ts` / `consts.local.ts` |
| state | `let`/`var`, a cache, a registry, a holder (`new Map()`, `[]`, `{}` that is filled later) | stays with the code that owns it, inside its factory when per-instance, module level when process-wide |
| instance | a value built by a factory (`createPathResolver(DEFAULT_TOPOLOGY)`) | the factory's file, as its ready instance |
| code | functions, classes, side-effect statements | code files, inside a factory |

A constant computed by calling project code is either rewritten as a constant expression (a
template over constants instead of `srcOf(...)`) or is an instance.

## File roles

| File | Holds |
|---|---|
| `x.ts` | one factory (plus its ready instance), or one exempt export (a component, a hook, one handler) |
| `x/types.ts` | `x`'s interface and the types only `x` owns |
| `x/consts.ts`, `x/*.local.ts` | its constants; its package-private declarations |
| `x/<sub>.ts` | a sub-helper only `x` uses — itself a factory, with its own folder when it has parts |
| `<dir>/types.ts` | declarations two or more objects of the directory share, or a small single-owner directory |
| `index.ts` | re-exports only: `export type * from './x/types.js'`, `export * from './x.js'`; never a `.local` file, never an enum through `export type *` |
| `errors.ts`, `schemas.ts` | error classes; JSON schemas and the code that builds them |

A types file imports only types files, consts files and external packages — never a code file.

## Deciding the shape of a module

1. List what other files use from it. Everything else becomes private.
2. Group what is used by domain. One group = one object; a second group = a second file.
3. Look at the first parameters. A shared context, request, collaborator or record moves into the
   factory (see *Binding*). Members that take different first arguments may mean two objects.
4. A group whose members all read one record is a model; one that lives in a context with a
   lifecycle is a service; one that reads and writes a store is a resource; the rest are helpers
   (reusable) or utils (package-internal).
5. Name it by the kind: `createXxxHelper` / `makeXxxHelper`, `createXxxUtils`, `createXxxService`,
   `makeXxxModel`, `makeXxxResource`.

## Converting a module, step by step

1. Write `x/types.ts`: the interface, one member per public function, with explicit parameter and
   return types and the JSDoc moved from the functions.
2. Rewrite `x.ts`: `export const createX = (deps): X => { … return { … } }`, with every function of
   the group and every helper only they use inside the closure, in their original order.
3. Drop the bound parameter from the members and from the calls between them.
4. Move constants and types the module still declares to `x/consts.ts` and `x/types.ts`.
5. Update every caller: `fn(ctx, a)` → `xOf(ctx).fn(a)`, `fn(a)` → `xHelper.fn(a)`, hoisting a
   repeated `xOf(ctx)` to one local per function.
6. Build from clean (delete `build/` and `*.tsbuildinfo`), run the package's tests, and grep the
   tests that read source as text (`readFileSync` of a `.ts`) for the moved names.

A published package that removes an export keeps a deprecated delegate in its `compat.ts`
(`/** @deprecated compat:factory-refactor use xOf(ctx).fn() */`) until its version line changes; no
code in the OwlMeans repositories may import it.

## Binding: choosing the target

- **A service** when the object has a lifecycle (init, connections), holds state shared by the
  process, or must be replaceable by an application.
- **A context accessor** when an application owns its context type: declare `xxx: () => XxxHelper` on
  the context interface and install it in the context factory with `memoHelper.once`.
- **`oncePer`** inside a library, where the helper must not appear on the public context type:
  `export const xxxOf = memoHelper.oncePer(makeXxx)`.
- **A request scope** for what depends on the caller (actor, organization, channel): build it once at
  the top of the handler and pass it down; never store it.
- **A collaborator accessor** when a helper always works over one FileHelper, stage or deps bag.
- **A model** when every member reads the same record.

Construction must stay cheap: no I/O and no awaits in a factory body; tables a member needs are built
lazily with `memoHelper.once`.

## Interfaces over types: the conversions

| From | To |
|---|---|
| `type X = { a: A }` | `interface X { a: A }` |
| `type X = A & { b: B }` | `interface X extends A { b: B }` |
| `type X = Omit<A, 'k'> & { k: K }` | `interface X extends Omit<A, 'k'> { k: K }` |
| `type X = Partial<Pick<A, 'a' \| 'b'>>` | `interface X extends Partial<Pick<A, 'a' \| 'b'>> {}` |
| `type F = (a: A) => R` | `interface F { (a: A): R }` |
| `type F = <T>(a: T) => R<T>` | `interface F { <T>(a: T): R<T> }` |

Keep the alias, with a one-line reason, where the interface breaks the program: it is used where an
implicit index signature is required, its `extends` parts conflict, or a declaration of the same name
would merge with it.

## Pitfalls

- **Read before initialization.** A factory body runs when called; a ready instance runs at import.
  Keep the instance the file's last statement, and never let a module-level constant call a factory
  of the same import cycle.
- **Import cycles.** Bound objects import types, constants and pure helpers only; composition roots
  (context factories) import the factories. Reach another bound object through the binding target.
- **Declaration emit.** A private type that appears in a public signature must move to `types.ts`;
  an inferred return type that names an unexported type fails the build (`TS4023`, `TS2742`).
- **State moved into a closure** becomes per instance. Process-wide state (a queue, a merge chain, a
  cache every caller must share) stays at module level or in a per-context memo.
- **Inheritance by prototype.** A helper derived with `Object.create(base)` inherits accessors bound to
  `base`; build an accessor over the derived object when its calls must go through it.
- **Enums** never move into types files and never pass through `export type *`.
- **Same name from two modules** in one barrel fails with `TS2308`; rename or re-export explicitly.
- **Tests that read source text** break silently when code moves; grep them in the same change.
