---
name: owlmeans-code-structure
description: "Mandatory object and layout rules for all OwlMeans TypeScript: the functions of one domain are ONE object built by a factory; its interface is declared FIRST (interfaces, never ReturnType<typeof …>); private parts live inside the factory; the context or collaborator is bound into the factory; types, consts and code live in separate files; an object with its own types or sub-helpers gets a same-named folder. Use whenever you write or change any .ts/.tsx in an @owlmeans package, an app built on OwlMeans or a generated target: adding a function, helper, util, service, model, resource, type or constant, creating or splitting a file, or reviewing a diff."
metadata:
  scope: general
---

# OwlMeans code structure

Every OwlMeans repo — the libraries, the platform and every generated application — holds to the
same shape. No tool checks it: this skill is the rule, every diff you write or review is held to it,
and a violation is a defect, not a style note.

## The rules

1. **One domain, one object.** The functions a file offers to other files form ONE object, built by
   ONE factory. Two domains in a file are two files. A file that exports a single function is not a
   bundle and may stay a plain export.
2. **Type first.** Declare the object's `interface` before writing the factory, in the object's
   types file, and make the factory return it: `export const createXxxHelper = (…): XxxHelper => {…}`.
   A type derived from the implementation — `ReturnType<typeof createXxx>`, `Parameters<typeof fn>`,
   `typeof someObject` — never names a helper, util, service, model or resource. The contract's JSDoc
   lives on the interface members.
3. **Encapsulate.** The factory's closure holds the implementation: what the interface does not name
   is a private local. Only pure, stateless primitives may stay module-private above the factory.
   A factory that merely collects module-level functions — `createX = () => ({ a, b })` — is the
   thing this rule forbids. No `this`: members are arrow functions, so they can be destructured and
   passed on.
4. **Bind what is shared.** When every member would take the same first argument — a context, a
   request, a collaborator, a record — that argument goes to the factory, not to each call.
5. **Interfaces over types — always where possible.**
   - `type X = { … }` → `interface X { … }`; `A & B & { … }` → `interface X extends A, B { … }`.
   - `type X = Pick<A, 'a'>` (also `Omit`, `Partial`, `Required`, `Readonly`) → `interface X extends Pick<A, 'a'> {}`.
   - `type Fn = (a: A) => R` → `interface Fn { (a: A): R }`.
   - `type` stays only for what an interface cannot say: unions, mapped, conditional and
     template-literal types, tuples, primitives, `keyof`/indexed access, and protocol trees inferred
     from a DSL (with a one-line reason).
6. **Types, consts and code in separate files.** Interfaces and type aliases → `types.ts`; enums and
   constants (including computed constant expressions such as an `Object.freeze([...LIST, ...])`) →
   `consts.ts`; code everywhere else. Package-private declarations go to `types.local.ts` /
   `consts.local.ts`, which no barrel re-exports.
7. **A same-named folder for an object that has parts.** `helpers/file.ts` holds the factory;
   `helpers/file/` holds its `types.ts`, `consts.ts` and the sub-helpers only it uses. A directory-level
   `types.ts` is right for declarations two or more objects share, or for a small single-owner
   directory; a types file that serves many unrelated owners is split into their folders.
8. **Ready instances.** A zero-argument helper may export one ready instance as the file's last
   statement (`export const pathHelper = createPathHelper()`). A bound object never has one — it is
   reached through its binding target (below). Never build a bound object inside a loop or a render.

## Kinds and names

| Kind | What it is | Factory | Interface | Where |
|---|---|---|---|---|
| util | package-internal functionality, never re-exported by the package | `createXxxUtils()` / `makeXxxUtils(target)` | `XxxUtils` | `utils/xxx.ts` + `utils/xxx/` |
| helper | reusable functionality, may be exported, not bound to one record | `createXxxHelper(opts?)` / `makeXxxHelper(target)` | `XxxHelper` | `xxx.ts` + `xxx/` |
| service | lives in a context, has an alias and a lifecycle | `createXxxService(alias = DEFAULT_ALIAS)` via `createService`, plus `appendXxxService(ctx)` | `XxxService extends InitializedService` | `services/xxx.ts` + `xxx/` |
| model | logic over ONE plain record (plus collaborators) | `makeXxxModel(record, deps?)` | `XxxModel` | `models/xxx.ts` + `xxx/` |
| resource | store access and store-level queries | `makeXxxResource(…)` | `XxxResource` | `resources/xxx.ts` + `xxx/` |

`create*` builds something standalone or configured by options; `make*` builds something bound to
its first argument.

## How a bound object is reached

| Bound to | Shape | At the call site |
|---|---|---|
| the context, with a lifecycle, a cache or a replaceable seam | a service | `ctx.service<XxxService>(ALIAS)`, or an accessor its `append*` installs (`ctx.xxx()`) |
| the context of an app that owns its context type | `makeXxxHelper(ctx)`, installed lazily on the context: `context.projects = memoHelper.once(() => makeProjectHelper(context))` | `ctx.projects().getDevSlot(id)` |
| the context, inside a library | `makeXxx(ctx)` plus `export const xxxOf = memoHelper.oncePer(makeXxx)` | `const xxx = xxxOf(ctx)` once per function |
| one request | `makeRequestScope(ctx, request)` | built once at the top of a handler, never stored |
| a collaborator (a FileHelper, a deps bag) | `makeXxx(collaborator)`, an accessor on the collaborator or `oncePer` | `files.layout().recordDeviation(d)` |
| a record | a model | `makeSlotModel(slot).namespace()` |

`memoHelper` (`once`, `oncePer`) comes from `@owlmeans/context`. Tests build the object directly:
`makeProjectHelper(fakeContext)`.

## Examples

```ts
// helpers/slug/types.ts — the type comes first
export interface SlugHelper {
  /** The URL-safe form of a title. */
  slugOf: (title: string) => string
  /** A title read back from a slug. */
  titleOf: (slug: string) => string
}

// helpers/slug.ts
import type { SlugHelper } from './slug/types.js'

export const createSlugHelper = (): SlugHelper => {
  const words = (text: string): string[] => text.split(/\W+/).filter(word => word !== '') // private

  const slugOf = (title: string): string => words(title.toLowerCase()).join('-')
  const titleOf = (slug: string): string => words(slug).join(' ')

  return { slugOf, titleOf }
}
export const slugHelper = createSlugHelper()
```

A service follows `@owlmeans/api`'s `createApiService(alias): ApiClient` — `createService<ApiClient>`
with the members in place, `assertContext(client.ctx, …)` inside them, and an `appendApiClient(ctx)`
that registers it. A model follows `@owlmeans/planning`'s `makeWorkcardModel(record, facade):
WorkcardModel`.

```ts
// models/invoice/types.ts
export interface InvoiceModel { readonly record: Invoice; isPaid: () => boolean; owed: () => number }
// models/invoice.ts
export const makeInvoiceModel = (record: Invoice): InvoiceModel => ({
  record,
  isPaid: () => record.paidAt != null,
  owed: () => (record.paidAt != null ? 0 : record.amountMinor),
})
```

A model is built from its record when it is needed — never stored on the record, never serialized.

**Wrong, and how it is fixed**

| Wrong | Right |
|---|---|
| `const a = …; const b = …; export const createX = () => ({ a, b })` + `type X = ReturnType<typeof createX>` | `interface X` in `x/types.ts`; `createX = (): X => { const a = …; const b = …; return { a, b } }` |
| `xHelper.read(files, path)`, `xHelper.write(files, …)` — the same collaborator in every call | `makeX(files): X` and `x.read(path)` |
| `export const getDevSlot = (ctx, id) => …` beside five more ctx-first functions | `makeProjectHelper(ctx): ProjectHelper`, reached as `ctx.projects()` |
| `export const SEED_SOURCES = Object.freeze([…])` in a code file | the constant in `consts.ts` |
| one `types.ts` holding the interfaces of twenty unrelated helpers | each helper's interface in its own `<helper>/types.ts` |

## Exempt

These stay plain exports: declaration-builder DSLs that are the framework's vocabulary (`route`,
`protocol`, `typed`, `contract`, `bind`, `logger`, `frontend`/`backend`, `declare*`, config plugins),
factories themselves (`make*`, `create*`, `append*`), React components and `use*` hooks, entry
scripts, error classes and schema files.

## Generated applications

Applications the viable agent generates follow the same rules, in these fixed shapes:

- **Domain model per entity.** `backend/src/models/<entity>/types.ts` declares
  `interface <Base>Model` first; `models/<entity>/<base>.ts` exports only
  `make<Base>Model = (ctx: Context): <Base>Model => { const op = async (actor: Actor, …) => …; return { op, … } }`.
  It is built where it is used — `await makeTaskModel(ctx).complete(actorOf(request), id)` — and is
  never registered as a context service. Its member names are the endpoint keys of the entity.
- **Handlers and job processors**: one plain exported function per file
  (`api/src/app/<entity>/<action>.ts` beside a GENERATED `index.ts` barrel, `worker/src/jobs/<job>.ts`);
  a handler's body is one call into the model.
- **Seed helpers are objects** whose members keep the old function names:
  `actorOf(request): Actor` with `actor.inOrganization(…)`, `actor.assertOrganization(…)`,
  `actor.grantedIds(…)`, `actor.organizationScope(…)`; `recordOwnerOf(request)`, `visitOf(request)`,
  `planningAccessOf(request, ctx)`, `landingHandoff`, `visitKey`. Their types live in the module's
  same-named folder (`lib/actor/types.ts`); the old free functions stay as
  `@deprecated generated-app:factory-objects` wrappers so a project generated before still compiles.
- A model module generated before this shape keeps its plain functions: its callers import them by
  name, so it is extended in that shape and never converted in place.
- **Resources** keep their maker and their `xResource(ctx)` accessor; the resource's interface lives
  in `resources/<entity>/types.ts`.
- Shared types in `common` are interfaces.
- A file the template shipped keeps the shape the platform gives it.

## Self-check before you finish

```sh
{ git diff --name-only HEAD; git ls-files --others --exclude-standard; } | grep -E '\.tsx?$' \
  | grep -vE '\.(test|spec)\.tsx?$|\.d\.ts$|(^|/)(tests?|fixtures)/' > /tmp/changed.txt
# derived helper types and wrapper factories
xargs -r grep -nE 'ReturnType<typeof|= \(\) => \(\{ *[a-zA-Z]+, ' < /tmp/changed.txt
# object-shaped type aliases that should be interfaces
xargs -r grep -nE '^(export )?type [A-Za-z0-9_]+(<[^=]*>)? *= *\{' < /tmp/changed.txt
# types, enums or CONSTANT_CASE constants declared in code files
grep -vE '(^|/)(types|consts)(\.local)?\.ts$' /tmp/changed.txt \
  | xargs -r grep -nE '^export (interface |enum |type [A-Za-z0-9_]+ *(<[^=]*>)? *=|const [A-Z][A-Z0-9_]+ *[:=])'
```

Then read the diff once for what no grep sees: a second exported function of one domain, a member
that takes the same first argument as its siblings, a private helper exposed on the interface, a
bound object built in a loop, a barrel re-exporting a `.local` file.

Classification details, folder decisions and the pitfalls of moving code into closures: `reference.md`
(in the OwlMeans repositories).
