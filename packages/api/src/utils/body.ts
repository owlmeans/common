import qs from 'qs'
import { RouteMethod } from '@owlmeans/route'

export const JSON_CONTENT_TYPE = 'application/json'

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded'

/** The request's own `content-type`, whatever case its key is written in. */
export const contentTypeOf = (headers?: Record<string, unknown>): string | undefined => {
  const value = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1]
  if (value == null || value === '') {
    return undefined
  }
  return Array.isArray(value) ? value.join(', ') : `${value}`
}

/** `application/json` or a `+json` suffix type, with or without parameters. */
export const isJsonContentType = (type?: string): boolean =>
  type != null && /^application\/(?:[^\s;]+\+)?json\s*(?:;|$)/i.test(type.trim())

/** A JSON value no serializer quotes for us: a string, a number or a boolean. */
const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

/** Does the entrypoint's body schema declare a string? */
const stringContract = (schema?: object): boolean => {
  const type = (schema as { type?: unknown } | undefined)?.type
  return (Array.isArray(type) ? type : [type]).includes('string')
}

const parse = (text: string): { json: true, value: unknown } | { json: false } => {
  try {
    return { json: true, value: JSON.parse(text) }
  } catch {
    return { json: false }
  }
}

/**
 * The JSON text a scalar body travels as, so the server parses it back to the same value.
 *
 * A number or a boolean is `JSON.stringify`'d. A string is a value unless it is already JSON text:
 * one that does not parse is quoted; one that parses is sent as it is (the caller serialized it
 * itself) — except under a body schema of `type: 'string'`, where only a JSON string literal
 * counts as serialized and `123`, `true` or `{…}` are the text the caller means.
 */
export const jsonScalarBody = (body: string | number | boolean, schema?: object): string => {
  if (typeof body !== 'string') {
    return JSON.stringify(body)
  }
  const parsed = parse(body)
  const serialized = parsed.json && (!stringContract(schema) || typeof parsed.value === 'string')

  return serialized ? body : JSON.stringify(body)
}

export interface RequestBody {
  /** What axios is handed as `data`. */
  data: unknown
  /** A `content-type` the request lacked and must carry. */
  contentType?: string
  /** `data` is final text — axios must not transform it again. */
  verbatim: boolean
}

/**
 * What a request's body becomes on the wire.
 *
 * - A `x-www-form-urlencoded` request: the body through `qs`.
 * - A string, number or boolean under a JSON `content-type` — the caller's, or `application/json`
 *   supplied for a `POST` that names none — becomes JSON text ({@link jsonScalarBody}).
 * - Anything else — objects, arrays, a scalar under another content type — goes to axios as it is,
 *   which serializes an object or an array as JSON.
 */
export const requestBodyOf = (
  body: unknown, headers: Record<string, unknown> | undefined, method?: RouteMethod, schema?: object
): RequestBody => {
  const type = contentTypeOf(headers)
  if (body != null && type?.includes(FORM_CONTENT_TYPE) === true) {
    return { data: qs.stringify(body), verbatim: false }
  }
  if (!isScalar(body)) {
    return { data: body, verbatim: false }
  }
  if (type == null && method === RouteMethod.POST) {
    return { data: jsonScalarBody(body, schema), contentType: JSON_CONTENT_TYPE, verbatim: true }
  }
  if (isJsonContentType(type)) {
    return { data: jsonScalarBody(body, schema), verbatim: true }
  }

  return { data: body, verbatim: false }
}
