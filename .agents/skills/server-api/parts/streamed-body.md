---
name: streamed-body
description: Streamed (raw octet-stream) request bodies — what a streamBody() route answers past its limit, on a wrong content type or a client abort, how it is scoped in Fastify, and why the multipart helpers resolve undefined.
metadata:
  purposes: server-api
  mentions: streamedBody, streamBody, StreamBodyTooLargeError, StreamBodyAbortedError, BinaryBody
---

# @owlmeans/server-api — streamed request bodies

A route declaring `protocolOptions: streamBody({ maxBytes, types? })` (`@owlmeans/route`) receives
its body as the raw request stream; the handler reads it with `streamedBody(request)`, which answers
`StreamedBody` `{ stream, length?, type?, maxBytes }` — a Node `Readable` with backpressure to the
client, the declared `Content-Length` when sent, the request's content type and the limit.

| What happens | Answer |
|---|---|
| Declared `Content-Length` over `maxBytes` | 413 before a byte is read (Fastify's `FST_ERR_CTP_BODY_TOO_LARGE`), handler never runs |
| Chunked body crossing `maxBytes` while read | the stream is destroyed with `StreamBodyTooLargeError`; 413 whatever the handler threw |
| Content type outside the declared `types` (default `application/octet-stream`) | 415, handler never runs |
| Client aborts mid-upload — also while guards and gates still ran, before the handler opened the body | the stream errors with `StreamBodyAbortedError` (400); nothing hangs, the server keeps serving |
| Any answer sent before the body was read to its end (a 401, a gate refusal, an early reply) | `Connection: close` |
| A request without a body | an empty stream, `length: 0` |

- Each streamed route is registered in its OWN encapsulated Fastify scope (`utils/stream.ts`):
  `removeAllContentTypeParsers()` then one parser for the declared types that hands the request
  stream over unread; `bodyLimit` = `maxBytes`; `fastify-raw-body` off through its per-route opt-out
  `config: { rawBody: false }` (the plugin skips a route whose config says so, even with
  `global: true, runFirst: true`); no AJV body schema. Params, query, headers and the response are
  still validated; intermediates (the root `preHandler`), guards and gates run before the handler.
  The root scope — JSON, multipart, `rawBody` (Stripe webhooks, `server-bot`) — is byte for byte
  what it was.
- Fastify enforces `bodyLimit` only for parsers that buffer (`parseAs`); a streamed parser gets the
  raw stream, so the limit is counted by `server-api` itself. At the limit the request is paused,
  not destroyed — destroying it would kill the socket before the 413 is written.
- The body's own failure wins: `createServerHandler` answers `failureOf(request)` when the stream
  failed, so a handler that wraps the stream's error still answers 413.
- `streamedBody()` opens the body once per request (every call returns the same object) and throws
  `SyntaxError` for a request that did not arrive over HTTP or whose route declares no streamed
  body. Only POST, PUT and PATCH may declare one; any other method fails the server's init.
- Multipart on every other route is buffered (`attachFieldsToBody: 'keyValues'`, 5 MiB × 5 files):
  fields and file `Buffer`s arrive in `request.body`. The parts are consumed before the handler, so
  `uploadedFile(request)` / `extractUploadedFile(req)` resolve `undefined` — uploads use a streamed
  route.
- `tests/stream-body.spec.ts` drives it all over a real socket from a client context (12 MiB with
  progress and checksum, 413 both ways, 415, 401, an abort mid-read and one during a slow guard,
  the unaffected routes).
