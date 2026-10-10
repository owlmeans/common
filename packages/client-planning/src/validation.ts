import { dereference, format, validate as interpret, Validator } from '@cfworker/json-schema'
import type { OutputUnit, Schema } from '@cfworker/json-schema'
import type { AnySchema, Format } from 'ajv'
import formatsPlugin from 'ajv-formats'
import type { FormatName } from 'ajv-formats'
import draft7 from 'ajv/dist/refs/json-schema-draft-07.json'
import { SchemaInvalid } from '@owlmeans/planning'
import type { PlanningFieldError, PlanningFieldValidation, PlanningFieldValidator } from './validation/types.js'
import {
  FIELD_ERROR_MESSAGES, FIELD_ERROR_WRAPPERS, FIELD_FORMAT_PREFIX, FIELD_SCHEMA_ANNOTATIONS, FIELD_SCHEMA_ARRAYS,
  FIELD_SCHEMA_CHILDREN, FIELD_SCHEMA_DRAFTS, FIELD_SCHEMA_KEYWORDS, FIELD_SCHEMA_MAPS,
  MAX_FIELD_ERRORS, MAX_FIELD_ERROR_PATH, REQUIRED_ERROR_PREFIX, REQUIRED_ERROR_SUFFIX,
} from './validation/consts.js'

/**
 * Interpret the exact served field schema under a strict script-src policy. The vocabulary is
 * Draft 7/$defs/nullable with AJV reference-sibling semantics and its full string-format predicates.
 * Unsupported dialects/extensions, numeric formats and multipleOf schemas refuse
 * during preparation; the server's AJV remains the authoritative validator.
 */
export const makePlanningFieldValidator = (fieldsSchema: AnySchema): PlanningFieldValidator => {
  const invalid = (path: string, keyword: string): never => {
    throw new SchemaInvalid(`client:fields:${keyword}:${path.slice(0, MAX_FIELD_ERROR_PATH)}`)
  }
  const pointer = (part: string): string => part.replaceAll('~', '~0').replaceAll('/', '~1')
  const nodes = new Map<Schema, string>()
  const meta = new Validator(structuredClone(draft7) as Schema, '7', false)

  const prepare = (source: unknown, path: string): Schema | boolean => {
    if (typeof source === 'boolean') return source
    if (source == null || typeof source !== 'object' || Array.isArray(source)) return invalid(path, 'schema')
    const checked = meta.validate(source)
    if (!checked.valid) return invalid(`${path}${checked.errors[0]?.instanceLocation.slice(1) ?? ''}`, 'malformed')
    const node: Schema = {}
    nodes.set(node, path)
    for (const [key, value] of Object.entries(source)) {
      const next = `${path}/${pointer(key)}`
      if (!FIELD_SCHEMA_KEYWORDS.has(key) && !key.startsWith('x-')) invalid(next, 'unsupported-keyword')
      if (FIELD_SCHEMA_ANNOTATIONS.has(key) || key.startsWith('x-')) continue
      if (key === 'nullable') continue
      if (key === '$schema' && !FIELD_SCHEMA_DRAFTS.has(String(value))) invalid(next, 'unsupported-draft')
      // The interpreters disagree on floating tolerance and large/scientific-notation quotients.
      if (key === 'multipleOf') invalid(next, 'unsupported-multipleOf')
      if (key === 'format') {
        let definition: Format
        try { definition = formatsPlugin.get(value as FormatName, 'full') }
        catch { return invalid(next, 'unsupported-format') }
        if (typeof definition === 'object' && !(definition instanceof RegExp) && definition.type === 'number') {
          invalid(next, 'unsupported-numeric-format')
        }
        if (typeof definition === 'object' && !(definition instanceof RegExp) && 'async' in definition && definition.async === true) {
          invalid(next, 'unsupported-async-format')
        }
        const guard = typeof definition === 'object' && !(definition instanceof RegExp) ? definition.validate : definition
        const predicate = typeof guard === 'string' ? new RegExp(guard, 'u') : guard
        const name = `${FIELD_FORMAT_PREFIX}${String(value)}`
        format[name] ??= input => predicate === true || (predicate instanceof RegExp ? predicate.test(input)
          : (predicate as (value: string) => boolean)(input)) === true
        node.format = name
      } else if (FIELD_SCHEMA_MAPS.has(key)) {
        if (value == null || typeof value !== 'object' || Array.isArray(value)) invalid(next, 'malformed')
        node[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>)
          .map(([name, child]) => [name, prepare(child, `${next}/${pointer(name)}`)]))
      } else if (FIELD_SCHEMA_ARRAYS.has(key) || (key === 'items' && Array.isArray(value))) {
        node[key] = (value as unknown[]).map((child, index) => prepare(child, `${next}/${index}`))
      } else if (FIELD_SCHEMA_CHILDREN.has(key) || key === 'items') {
        node[key] = prepare(value, next)
      } else if (key === 'dependencies') {
        ;(node as Record<string, unknown>)[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>)
          .map(([name, child]) => [name, Array.isArray(child) ? child : prepare(child, `${next}/${pointer(name)}`)]))
      } else { node[key] = structuredClone(value) }
    }
    if ('nullable' in source) {
      const nullable = (source as Schema).nullable
      if (typeof nullable !== 'boolean' || node.type == null) invalid(`${path}/nullable`, 'malformed')
      const kinds = Array.isArray(node.type) ? node.type : [node.type!]
      if (nullable) node.type = [...new Set([...kinds, 'null' as const])]
      else if (kinds.includes('null')) invalid(`${path}/nullable`, 'malformed')
    }
    return node
  }
  const schema = prepare(fieldsSchema, '#')
  let lookup: Record<string, Schema | boolean>
  try { lookup = dereference(schema) }
  catch { return invalid('#', 'invalid-reference') }
  for (const [node, path] of nodes) {
    if (node.$ref != null && lookup[node.__absolute_ref__!] === undefined) invalid(`${path}/$ref`, 'missing-reference')
  }
  const complete = new Set<Schema>()
  const visiting = new Set<Schema>()
  const checkReferences = (node: Schema | boolean): void => {
    if (typeof node === 'boolean' || complete.has(node)) return
    if (visiting.has(node)) invalid(nodes.get(node) ?? '#', 'cyclic-reference')
    visiting.add(node)
    if (node.$ref != null) checkReferences(lookup[node.__absolute_ref__!]!)
    // These evaluate the same instance; properties/items make productive recursive schemas.
    for (const key of ['allOf', 'anyOf', 'oneOf']) (node[key] as Array<Schema | boolean> | undefined)?.forEach(checkReferences)
    for (const key of ['not', 'if', 'then', 'else']) if (node[key] != null) checkReferences(node[key])
    for (const child of Object.values(node.dependencies ?? {})) if (!Array.isArray(child)) checkReferences(child)
    visiting.delete(node)
    complete.add(node)
  }
  nodes.forEach((_path, node) => checkReferences(node))

  const fieldError = (error: OutputUnit): PlanningFieldError => {
    const parts = error.instanceLocation.slice(1).replace(/^\//, '').split('/').filter(Boolean)
      .map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    if (error.keyword === 'required' && error.error.startsWith(REQUIRED_ERROR_PREFIX) && error.error.endsWith(REQUIRED_ERROR_SUFFIX)) {
      parts.push(error.error.slice(REQUIRED_ERROR_PREFIX.length, -REQUIRED_ERROR_SUFFIX.length))
    }
    return { path: parts.join('.').slice(0, MAX_FIELD_ERROR_PATH), keyword: error.keyword,
      schemaPath: error.keywordLocation.slice(0, MAX_FIELD_ERROR_PATH),
      message: FIELD_ERROR_MESSAGES[error.keyword] ?? 'The field does not match its definition' }
  }
  const jsonErrors = (value: unknown, path: string, active: Set<object>): PlanningFieldError[] => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))) return []
    if (typeof value !== 'object' || active.has(value)) return [{ path, keyword: 'json', schemaPath: '#', message: 'Use a JSON value' }]
    const plain = Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null
    if (!plain) return [{ path, keyword: 'json', schemaPath: '#', message: 'Use a JSON value' }]
    active.add(value)
    const errors = Object.entries(value).flatMap(([key, child]) => [
      ...(!Array.isArray(value) && (key.includes('.') || key.includes('$'))
        ? [{ path: [path, key].filter(Boolean).join('.'), keyword: 'field-key', schemaPath: '#', message: 'This field name is not allowed' }] : []),
      ...jsonErrors(child, [path, key].filter(Boolean).join('.'), active),
    ])
    active.delete(value)
    return errors
  }
  const validateFields = (fields: Record<string, unknown>): PlanningFieldValidation => {
    const unsafe = jsonErrors(fields, '', new Set())
    if (unsafe.length > 0) return { valid: false, errors: unsafe.slice(0, MAX_FIELD_ERRORS)
      .map(error => ({ ...error, path: error.path.slice(0, MAX_FIELD_ERROR_PATH) })) }
    // Only the guarded Draft 7 vocabulary reaches this engine. This mode, unlike its '7' mode,
    // also enforces sibling keywords beside $ref, as the native planning AJV does.
    const result = interpret(fields, schema, '2019-09', lookup, false)
    const errors = result.errors.filter(error => !FIELD_ERROR_WRAPPERS.has(error.keyword))
    return { valid: result.valid, errors: (errors.length > 0 ? errors : result.errors).slice(0, MAX_FIELD_ERRORS).map(fieldError) }
  }
  return { validateFields }
}
