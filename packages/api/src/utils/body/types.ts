import type { RouteMethod } from '@owlmeans/route'

export interface RequestBody {
  /** What axios is handed as `data`. */
  data: unknown
  /** A `content-type` the request lacked and must carry. */
  contentType?: string
  /** `data` is final text — axios must not transform it again. */
  verbatim: boolean
}

/** How a request's body travels: its content type and the text a scalar body becomes. */
export interface BodyUtils {
  /** The request's own `content-type`, whatever case its key is written in. */
  contentTypeOf: (headers?: Record<string, unknown>) => string | undefined
  /** `application/json` or a `+json` suffix type, with or without parameters. */
  isJsonContentType: (type?: string) => boolean
  /**
   * The JSON text a scalar body travels as, so the server parses it back to the same value.
   *
   * A number or a boolean is `JSON.stringify`'d. A string is a value unless it is already JSON text:
   * one that does not parse is quoted; one that parses is sent as it is (the caller serialized it
   * itself) — except under a body schema of `type: 'string'`, where only a JSON string literal
   * counts as serialized and `123`, `true` or `{…}` are the text the caller means.
   */
  jsonScalarBody: (body: string | number | boolean, schema?: object) => string
  /**
   * What a request's body becomes on the wire.
   *
   * - A `x-www-form-urlencoded` request: the body through `qs`.
   * - A string, number or boolean under a JSON `content-type` — the caller's, or `application/json`
   *   supplied for a `POST` that names none — becomes JSON text ({@link BodyUtils.jsonScalarBody}).
   * - Anything else — objects, arrays, a scalar under another content type — goes to axios as it is,
   *   which serializes an object or an array as JSON.
   */
  requestBodyOf: (body: unknown, headers: Record<string, unknown> | undefined, method?: RouteMethod, schema?: object) => RequestBody
}
