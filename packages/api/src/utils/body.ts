import qs from 'qs'
import { RouteMethod } from '@owlmeans/route'
import { BINARY_CONTENT_TYPE, FORM_CONTENT_TYPE } from './consts.local.js'
import { JSON_CONTENT_TYPE } from './consts.js'
import type { BodyUtils, RequestBody } from './body/types.js'

export const createBodyUtils = (): BodyUtils => {
  const contentTypeOf = (headers?: Record<string, unknown>): string | undefined => {
    const value = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1]
    if (value == null || value === '') {
      return undefined
    }
    return Array.isArray(value) ? value.join(', ') : `${value}`
  }

  const isJsonContentType = (type?: string): boolean =>
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

  const jsonScalarBody = (body: string | number | boolean, schema?: object): string => {
    if (typeof body !== 'string') {
      return JSON.stringify(body)
    }
    const parsed = parse(body)
    const serialized = parsed.json && (!stringContract(schema) || typeof parsed.value === 'string')

    return serialized ? body : JSON.stringify(body)
  }

  const requestBodyOf = (
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

  const isBlob = (body: unknown): body is Blob =>
    typeof Blob !== 'undefined' && body instanceof Blob

  const isBinaryBody = (body: unknown): boolean =>
    body != null && typeof body === 'object' && (
      isBlob(body) || body instanceof ArrayBuffer || ArrayBuffer.isView(body)
      || typeof (body as { pipe?: unknown }).pipe === 'function'
    )

  /** The view's own bytes: a Node `Buffer` as it is, any other view without the rest of its buffer. */
  const bytesOf = (view: ArrayBufferView): unknown => {
    const NodeBuffer = (globalThis as { Buffer?: { isBuffer: (value: unknown) => boolean, from: (buffer: ArrayBufferLike, offset: number, length: number) => unknown } }).Buffer
    if (NodeBuffer != null) {
      return NodeBuffer.isBuffer(view) ? view : NodeBuffer.from(view.buffer, view.byteOffset, view.byteLength)
    }

    return view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
      ? view.buffer
      : view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
  }

  const binaryBodyOf = (
    body: unknown, headers: Record<string, unknown> | undefined, defaultType?: string
  ): RequestBody => {
    const own = contentTypeOf(headers)
    const type = own ?? defaultType ?? BINARY_CONTENT_TYPE
    const data = isBlob(body)
      ? (body.type === type ? body : new Blob([body], { type }))
      : ArrayBuffer.isView(body) ? bytesOf(body) : body

    return { data, ...(own == null ? { contentType: type } : {}), verbatim: true, binary: true }
  }

  return { contentTypeOf, isJsonContentType, jsonScalarBody, requestBodyOf, isBinaryBody, binaryBodyOf }
}

export const bodyUtils = createBodyUtils()
