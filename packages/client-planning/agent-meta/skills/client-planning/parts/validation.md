---
name: validation
description: CSP-safe browser validation of a served field schema with makePlanningFieldValidator — the supported keywords, refusals and limits, and the external references behind them.
metadata:
  purposes: form
  mentions: makePlanningFieldValidator, validateFields, @cfworker/json-schema, JSON_SCHEMA_DRAFT_07, unsafe-eval, SchemaInvalid
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-planning — Browser field validation

## Browser field validation under CSP

Bind `makePlanningFieldValidator(registry.fieldsSchema(type))` to the registry of the resolved
organization or project bundle — the type's own `fields` plus the application's base card fields
(`planning` → types part); with no base fields it IS `type.fields`. Passing `type.fields` alone
skips the base fields the server still enforces. Its `validateFields(fields)` returns `{ valid, errors }`; errors
carry decoded `path`, `keyword`, `schemaPath` and a bounded value-free `message`. Construct one JSON
fields object, validate it and send that same object. No coercion, defaults or property removal
occurs, and the schema is left unchanged. Preserve nested money objects and calendar date strings.
The native server validates every write again.

The validator interprets schemas with `@cfworker/json-schema`, with no `eval`, `new Function` or
network reference loading. Do not call `makeSchemaRegistry(...).validator()` or
`.assigneeValidator()` in a browser with strict `script-src`: those remain native AJV compilers.
The Draft 7 meta-schema is DATA in `src/validation/consts.ts` (`JSON_SCHEMA_DRAFT_07`, pinned to ajv's
`refs/json-schema-draft-07.json` by `tests/draft7.spec.ts`), never an import of that file: Node ESM needs
`with { type: 'json' }` on it, and a bundler that also meets ajv's own attribute-less `require` of the
same file refuses the pair (Rollup: "import attributes for the same module are always consistent"),
which fails every target web build that mounts the planning client.
Static AJV standalone compilation is suitable only when the schema cannot change after building;
organization and project definitions require the runtime interpreter.

The supported contract is Draft 7's object/array/scalar, required, enum/const, ranges, string
length/pattern, dependencies, boolean, composition and conditional keywords; `$defs`, local/nested
`$id` references and AJV's `nullable` are also supported. `$ref` sibling constraints are enforced as
by native planning AJV. String formats use the same `ajv-formats` full-mode predicates, including
real calendar dates and timezone-aware times. `nullable` adds null to the declared type while
leaving enum and const constraints intact. All references must resolve inside the supplied field
schema; productive recursive schemas are supported, same-instance reference cycles are refused.
Plain JSON values and field names without dot or dollar characters are required.

Preparation throws `SchemaInvalid` for malformed schemas, unresolved references, unsupported
drafts/keywords/formats, numeric formats, `formatMinimum`/`formatMaximum` extensions and
`multipleOf`. The latter is refused because the interpreter's epsilon and native AJV's quotient
semantics disagree for fractional and very large numbers. Standard annotation keywords and `x-`
annotations do not add validation. Never discard a refused constraint, invent a substitute schema,
enable `unsafe-eval` or proceed with a ready form after preparation fails. Show the error and retain
disabled save controls. Validation reports at most 64 errors, with paths bounded to 512 characters.

## External docs

- https://ajv.js.org/security.html#content-security-policy — runtime AJV requires unsafe-eval; standalone build compilation preserves strict CSP for static schemas.
- https://www.npmjs.com/package/@cfworker/json-schema/v/4.1.1 — the interpreter supports dynamic schemas without code generation; select an explicit vocabulary and check its known limitations (4.1.1).
- https://github.com/ajv-validator/ajv-formats#full-and-fast-validation-modes — full-mode predicates validate formats completely and are reusable through the plugin's `get` API (3.0.1).
- https://ajv.js.org/json-schema.html#nullable-openapi — nullable expands the declared type without adding null to enum or const.
