import { logger } from '@owlmeans/log'
import { CollectKind, CollectRole, CollectStatus } from './consts.js'
import { ReaderContentError, ReaderLimitError, ReaderRefusedError } from './errors.js'
import { BUNDLE_MANIFEST, BUNDLE_MANIFEST_VERSION } from './fetch/bundle/consts.js'
import type { BundleManifest } from './fetch/bundle/types.js'
import { ACCEPT_HEADERS, DEFAULT_MAX_BYTES } from './fetch/fetcher/consts.js'
import type { FetchedResource } from './fetch/fetcher/types.js'
import { makePageModel } from './models/page.js'
import { textUtils } from './utils/text.js'
import { makeCollectBudget } from './collect/budget.js'
import { DEFAULT_COLLECT_FILE_TIMEOUT_MS, DEFAULT_COLLECT_LIMITS } from './collect/consts.js'
import {
  ACTIVE_ASSET_TYPES, ASSET_CONCURRENCY, DEFAULT_PEEK_BYTES, DEFAULT_SOURCE_FETCH_BYTES, FONT_EXTENSIONS, HTML_TYPES, IMAGE_EXTENSIONS,
  MAX_IMPORT_DEPTH, NULL_BODY_STATUSES,
} from './collect/consts.local.js'
import { cssRefs } from './collect/css.js'
import { makeBundleDocument } from './collect/document.js'
import { collectPaths } from './collect/paths.js'
import { makePeekableBody } from './collect/peek.js'
import type {
  BundleInput, CollectFileInfo, CollectItem, CollectLimits, CollectOptions, CollectResult, Collector, CollectorOptions, ReaderSource,
  ReaderSourceContext, SourceAnswer,
} from './collect/types.js'
import type { AssetState, PageAllowance } from './collect/types.local.js'

const log = logger('llm-reader:collect')

const bytesStream = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({ start: controller => { controller.enqueue(bytes); controller.close() } })

const textStream = (text: string): ReadableStream<Uint8Array> => bytesStream(new TextEncoder().encode(text))

/** The body of a streamed answer — a plugin that answered from memory still gets streamed. */
const bodyOf = (fetched: FetchedResource): ReadableStream<Uint8Array> =>
  fetched.body ?? (fetched.bytes != null ? bytesStream(fetched.bytes) : textStream(fetched.text ?? ''))

/** The URL with its fragment removed, and the fragment. */
const split = (url: string): { key: string, hash: string } => {
  const parsed = new URL(url)
  const hash = parsed.hash
  parsed.hash = ''
  return { key: parsed.href, hash }
}

/** What a fetched asset is, once its answer named a type. */
const refine = (role: CollectRole, mime: string, url: string): CollectRole => {
  if (role === CollectRole.Stylesheet) return role
  if (mime.startsWith('font/') || /font/.test(mime)) return CollectRole.Font
  if (mime.startsWith('image/')) return CollectRole.Image
  const extension = collectPaths.extensionOf(new URL(url).pathname)
  return FONT_EXTENSIONS.includes(extension) ? CollectRole.Font : IMAGE_EXTENSIONS.includes(extension) ? CollectRole.Image : role
}

/** The accept header an asset is asked for with. */
const acceptOf = (role: CollectRole): string =>
  role === CollectRole.Image ? ACCEPT_HEADERS.image : role === CollectRole.Stylesheet ? ACCEPT_HEADERS.stylesheet : '*/*'

/**
 * Turn one link into files written to a sink, as if the person had uploaded them: a page with what
 * it loads (a bundle), a file as it was served, or what a source expands the link to. Every request
 * goes through the reader's fetcher — its plugins, its address guard on every hop, its transport (the
 * injected, pinned fetch) — and every file is streamed under the collect's limits; an item over a
 * limit is skipped and reported, never thrown.
 */
export const createCollector = (options: CollectorOptions): Collector => {
  const { fetcher } = options
  const sources: ReaderSource[] = options.sources ?? []

  const makeRun = (collect: CollectOptions) => {
    const limits: CollectLimits = { ...DEFAULT_COLLECT_LIMITS, ...options.limits, ...collect.limits }
    const budget = makeCollectBudget(limits)
    const { sink, key, signal } = collect
    const prefix = collect.prefix != null && collect.prefix !== '' ? collectPaths.safe(collect.prefix) : undefined
    if (collect.prefix != null && collect.prefix !== '' && prefix == null) throw new ReaderRefusedError(`prefix:${collect.prefix}`)
    const timeout = collect.timeout ?? DEFAULT_COLLECT_FILE_TIMEOUT_MS
    const items: CollectItem[] = []
    const totals = { files: 0, bytes: 0 }
    const pathed = (local: string): string => collectPaths.join(prefix, local)

    let active = 0
    const waiting: Array<() => void> = []
    /** At most {@link ASSET_CONCURRENCY} downloads at once. */
    const slot = async <T>(work: () => Promise<T>): Promise<T> => {
      if (active >= ASSET_CONCURRENCY) await new Promise<void>(resolve => waiting.push(resolve))
      active++
      try {
        return await work()
      } finally {
        active--
        waiting.shift()?.()
      }
    }

    const rethrowAbort = (): void => {
      if (signal?.aborted === true) throw signal.reason
    }

    /** An error as the status and reason of an item. */
    const outcomeOf = (error: unknown): { status: CollectStatus, reason: string } => {
      if (error instanceof ReaderRefusedError || (error as { refused?: unknown } | null)?.refused === true) {
        return { status: CollectStatus.Refused, reason: (error as Error).message }
      }
      if (error instanceof ReaderLimitError) return { status: CollectStatus.Skipped, reason: error.message.replace(/^llm-reader:limit:/, '') }
      if (error instanceof ReaderContentError && error.message.includes('too-large')) return { status: CollectStatus.Skipped, reason: 'max-file-bytes' }
      return { status: CollectStatus.Failed, reason: (error as Error)?.message ?? String(error) }
    }

    const fetchStream = (url: string, accept: string, maxBytes: number = limits.maxFileBytes): Promise<FetchedResource> => fetcher.fetch({
      url, purpose: 'any', stream: true, timeout, maxBytes, headers: { accept },
      ...(key != null ? { key } : {}), ...(signal != null ? { signal } : {}),
    })

    const cancel = (fetched: FetchedResource): void => {
      void fetched.body?.cancel().catch(() => undefined)
    }

    /**
     * Stream one admitted file to the sink under the meter; on any failure its reservation and bytes
     * are given back and the outcome says why.
     */
    const write = async (
      local: string, stream: ReadableStream<Uint8Array>, info: CollectFileInfo,
      page?: PageAllowance,
    ): Promise<{ status: CollectStatus, bytes?: number, reason?: string }> => {
      const metered = budget.meter(stream, page)
      try {
        await sink.write(pathed(local), metered.stream, {
          url: info.url, role: info.role,
          ...(info.mime != null && info.mime !== '' ? { mime: info.mime } : {}),
          ...(info.size != null ? { size: info.size } : {}), ...(info.name != null ? { name: info.name } : {}),
        })
      } catch (e) {
        budget.release(metered.bytes(), page)
        rethrowAbort()
        const exceeded = metered.exceeded()
        return exceeded != null ? { status: CollectStatus.Skipped, reason: exceeded } : outcomeOf(e)
      }
      totals.files++
      totals.bytes += metered.bytes()
      return { status: CollectStatus.Written, bytes: metered.bytes() }
    }

    const result = (url: string, finalUrl: string, kind: CollectKind, extra: Partial<CollectResult> = {}): CollectResult => {
      log.debug('Collected', { host: textUtils.siteOf(finalUrl), kind, files: totals.files, bytes: totals.bytes, items: items.length })
      return { url, finalUrl, kind, ...extra, items, files: totals.files, bytes: totals.bytes }
    }

    /** One downloaded file (a direct link or a source entry): admitted, streamed, reported. */
    const file = async (
      url: string, local: string, fetched: FetchedResource, body: ReadableStream<Uint8Array>, extra: { name?: string, mime?: string, size?: number },
      admitted = false,
    ): Promise<CollectItem> => {
      const mime = extra.mime ?? (fetched.contentType !== '' ? fetched.contentType : undefined)
      const declared = Number(fetched.headers['content-length'] ?? NaN)
      const size = Number.isFinite(declared) ? declared : extra.size
      const item: CollectItem = { url, role: CollectRole.File, status: CollectStatus.Skipped, path: pathed(local), ...(mime != null ? { mime } : {}) }
      const reason = admitted ? undefined : budget.admit(size)
      if (reason != null) {
        void body.cancel().catch(() => undefined)
        return { ...item, reason }
      }
      const outcome = await write(local, body, {
        url, role: CollectRole.File, ...(mime != null ? { mime } : {}), ...(size != null ? { size } : {}),
        ...(extra.name != null ? { name: extra.name } : {}),
      })
      return { ...item, ...outcome }
    }

    /** A source's guarded fetch: any status back, the body unread. */
    const sourceFetch: ReaderSourceContext['fetch'] = async (url, init = {}) => {
      const aborts = init.signal ?? signal
      const fetched = await fetcher.fetch({
        url, purpose: 'any', stream: true, maxBytes: init.maxBytes ?? DEFAULT_SOURCE_FETCH_BYTES,
        ...(key != null ? { key } : {}), ...(init.headers != null ? { headers: init.headers } : {}), ...(aborts != null ? { signal: aborts } : {}),
      })
      const empty = NULL_BODY_STATUSES.has(fetched.status)
      if (empty) cancel(fetched)
      const response = new Response(empty ? null : bodyOf(fetched), { status: fetched.status, headers: fetched.headers })
      Object.defineProperty(response, 'url', { value: fetched.finalUrl })
      return response
    }

    /** The files a source expands a link to, each downloaded like a direct file. */
    const expand = async (source: ReaderSource, url: string, target: string): Promise<CollectResult> => {
      const context: ReaderSourceContext = {
        fetch: sourceFetch, limits, ...(key != null ? { key } : {}), ...(signal != null ? { signal } : {}),
      }
      let entries
      try {
        entries = await source.expand(target, context)
      } catch (e) {
        rethrowAbort()
        items.push({ url, role: CollectRole.File, ...outcomeOf(e) })
        return result(url, target, CollectKind.Source, { source: source.name })
      }
      const used = new Set<string>()
      const slots: Array<Promise<CollectItem>> = entries.map(entry => {
        const safe = collectPaths.safe(entry.path)
        if (safe == null) {
          return Promise.resolve({ url: entry.url, role: CollectRole.File, status: CollectStatus.Refused, path: entry.path, reason: 'unsafe-path' })
        }
        const local = unique(collectPaths.join(...safe.split('/').map(collectPaths.segment)), used)
        const reason = budget.admit(entry.size)
        if (reason != null) {
          return Promise.resolve({ url: entry.url, role: CollectRole.File, status: CollectStatus.Skipped, path: pathed(local), reason })
        }
        return slot(async () => {
          let fetched: FetchedResource
          try {
            fetched = await fetchStream(entry.url, '*/*')
          } catch (e) {
            budget.release(0)
            rethrowAbort()
            return { url: entry.url, role: CollectRole.File, path: pathed(local), ...outcomeOf(e) }
          }
          if (fetched.status >= 400) {
            budget.release(0)
            cancel(fetched)
            return { url: entry.url, role: CollectRole.File, status: CollectStatus.Failed, path: pathed(local), reason: `status-${fetched.status}` }
          }
          return file(entry.url, local, fetched, bodyOf(fetched), {
            ...(entry.name != null ? { name: entry.name } : {}), ...(entry.mime != null ? { mime: entry.mime } : {}),
            ...(entry.size != null ? { size: entry.size } : {}),
          }, true)
        })
      })
      items.push(...await Promise.all(slots))
      const written = items.filter(item => item.status === CollectStatus.Written)
      return result(url, target, CollectKind.Source, {
        source: source.name, ...(entries.length === 1 && written.length === 1 ? { entry: written[0]!.path! } : {}),
      })
    }

    /** A free path: `name.ext`, else `name-2.ext`, `name-3.ext` … */
    const unique = (path: string, used: Set<string>): string => {
      let candidate = path
      for (let n = 2; used.has(candidate); n++) {
        const extension = collectPaths.extensionOf(path)
        candidate = extension !== '' ? `${path.slice(0, -(extension.length + 1))}-${n}.${extension}` : `${path}-${n}`
      }
      used.add(candidate)
      return candidate
    }

    /** A page and everything it loads, rewritten to local paths, with its manifest. */
    const bundle = async (input: BundleInput & { finalUrl?: string }, render: boolean | undefined): Promise<CollectResult> => {
      let html = input.html
      let base = input.finalUrl ?? input.url
      let rendered = false
      if (render !== false && options.render != null && (render === true || makePageModel({ url: base, html }).signals().appShell)) {
        try {
          const page = await options.render(base, { snapshot: true, styles: false, screenshot: false, ...(key != null ? { key } : {}), ...(signal != null ? { signal } : {}) })
          html = page.html
          base = page.finalUrl
          rendered = true
        } catch (e) {
          rethrowAbort()
          log.warn('Page not rendered, its fetched HTML is bundled', { host: textUtils.siteOf(base), error: e })
        }
      }
      const pageOrigin = new URL(base).origin
      const entry = (input.entry != null ? collectPaths.safe(input.entry) : undefined) ?? collectPaths.entryOf(base)
      const used = new Set([entry, BUNDLE_MANIFEST])
      const pageItem: CollectItem = { url: input.url, role: CollectRole.Page, status: CollectStatus.Skipped, path: pathed(entry), mime: 'text/html' }
      const pageReason = budget.admit(new TextEncoder().encode(html).byteLength)
      if (pageReason != null) {
        items.push({ ...pageItem, reason: pageReason })
        return result(input.url, base, CollectKind.Bundle)
      }

      const document = makeBundleDocument(html, base)
      document.sanitize()
      const allowance = budget.page()
      const assets = new Map<string, AssetState>()

      const absolute = (href: string, from: string): string | undefined => textUtils.absolute(href, from)

      const binary = async (state: AssetState): Promise<void> => slot(async () => {
        const fetched = await fetchStream(state.url, acceptOf(state.role))
        if (fetched.status >= 400) {
          cancel(fetched)
          throw Object.assign(new Error(`status-${fetched.status}`), { status: fetched.status })
        }
        const mime = fetched.contentType
        if (ACTIVE_ASSET_TYPES.some(type => type.test(mime))) {
          cancel(fetched)
          throw new ReaderLimitError(`unexpected-type:${mime}`)
        }
        state.role = refine(state.role, mime, state.url)
        state.mime = mime !== '' ? mime : undefined
        state.path = unique(collectPaths.assetOf(state.url, pageOrigin, state.mime, state.role), used)
        const outcome = await write(state.path, bodyOf(fetched), {
          url: state.url, role: state.role, ...(state.mime != null ? { mime: state.mime } : {}),
        }, allowance)
        if (outcome.status !== CollectStatus.Written) throw Object.assign(new Error(outcome.reason), { outcome })
        state.bytes = outcome.bytes
      })

      const stylesheet = async (state: AssetState, chain: string[]): Promise<void> => {
        const sheet = await slot(() => fetcher.fetch({
          url: state.url, purpose: 'stylesheet', maxBytes: Math.min(DEFAULT_MAX_BYTES.stylesheet, limits.maxFileBytes),
          ...(key != null ? { key } : {}), ...(signal != null ? { signal } : {}),
        }))
        if (sheet.status >= 400) throw new Error(`status-${sheet.status}`)
        if (!['text/css', 'text/plain', ''].includes(sheet.contentType)) throw new ReaderLimitError(`unexpected-type:${sheet.contentType}`)
        state.mime = 'text/css'
        const text = sheet.text ?? ''
        const references = cssRefs.references(text).flatMap(reference => {
          const url = absolute(reference.href, sheet.finalUrl)
          return url != null ? [{ reference, url: split(url).key }] : []
        })
        const deeper = [...chain, state.url]
        await Promise.all(references.map(({ reference, url }) => reference.kind === 'import'
          ? (deeper.length <= MAX_IMPORT_DEPTH ? ensure(url, CollectRole.Stylesheet, deeper) : undefined)
          : ensure(url, CollectRole.Asset, deeper)))
        const rewritten = cssRefs.rewrite(text, reference => {
          const url = absolute(reference.href, sheet.finalUrl)
          if (url == null) return undefined
          const { key: target, hash } = split(url)
          const child = assets.get(target)
          const kept = child?.path != null && (child.status === CollectStatus.Written || child.pending)
          return kept ? `${collectPaths.relative(state.path!, child.path!)}${hash}` : url
        })
        const outcome = await write(state.path!, textStream(rewritten), { url: state.url, role: CollectRole.Stylesheet, mime: 'text/css' }, allowance)
        if (outcome.status !== CollectStatus.Written) throw Object.assign(new Error(outcome.reason), { outcome })
        state.bytes = outcome.bytes
      }

      /**
       * Collect one asset once. A stylesheet's place is decided before it is fetched and a stylesheet in
       * flight is never waited for, so `@import` cycles (direct or across two pages' sheets) cannot deadlock.
       */
      const ensure = (url: string, role: CollectRole, chain: string[]): Promise<AssetState> => {
        const known = assets.get(url)
        if (known != null) return known.done == null || (known.role === CollectRole.Stylesheet && known.pending) ? Promise.resolve(known) : known.done
        const state: AssetState = { url, role, status: CollectStatus.Skipped, pending: true }
        assets.set(url, state)
        const reason = budget.admit(undefined, allowance)
        if (reason != null) {
          state.reason = reason
          state.pending = false
          return Promise.resolve(state)
        }
        if (role === CollectRole.Stylesheet) state.path = unique(collectPaths.assetOf(url, pageOrigin, 'text/css', role), used)
        state.done = (async () => {
          try {
            await (role === CollectRole.Stylesheet ? stylesheet(state, chain) : binary(state))
            state.status = CollectStatus.Written
          } catch (e) {
            rethrowAbort()
            const outcome = (e as { outcome?: { status: CollectStatus, reason?: string } }).outcome
            if (outcome == null) budget.release(0, allowance)
            const { status, reason: why } = outcome != null ? { status: outcome.status, reason: outcome.reason ?? '' } : outcomeOf(e)
            state.status = status
            state.reason = why
          } finally {
            state.pending = false
          }
          return state
        })()
        return state.done
      }

      await Promise.all(document.references().map(reference => ensure(reference.url, reference.role, [])))
      // A stylesheet that found its import already in flight did not wait for it — wait here.
      while ([...assets.values()].some(state => state.pending)) {
        await Promise.all([...assets.values()].map(state => state.done))
      }

      document.rewrite(url => {
        const state = assets.get(url)
        return state?.status === CollectStatus.Written && state.path != null ? collectPaths.relative(entry, state.path) : undefined
      })
      const page = await write(entry, textStream(document.html()), { url: input.url, role: CollectRole.Page, mime: 'text/html' })
      items.push({ ...pageItem, ...page })

      const states = [...assets.values()]
      const files: Record<string, string> = {}
      if (page.status === CollectStatus.Written) {
        files[split(base).key] = entry
        files[split(input.url).key] ??= entry
      }
      for (const state of states) {
        items.push({
          url: state.url, role: state.role, status: state.status,
          ...(state.path != null ? { path: pathed(state.path) } : {}), ...(state.bytes != null ? { bytes: state.bytes } : {}),
          ...(state.mime != null ? { mime: state.mime } : {}), ...(state.reason != null ? { reason: state.reason } : {}),
        })
        if (state.status === CollectStatus.Written && state.path != null) files[state.url] = state.path
      }
      const manifest: BundleManifest = {
        version: BUNDLE_MANIFEST_VERSION, url: input.url, finalUrl: base, entry, rendered, collectedAt: new Date().toISOString(), files,
        skipped: states.filter(state => state.status !== CollectStatus.Written)
          .map(state => ({ url: state.url, status: state.status, reason: state.reason ?? '' })),
      }
      const manifestItem: CollectItem = { url: input.url, role: CollectRole.Manifest, status: CollectStatus.Failed, path: pathed(BUNDLE_MANIFEST), mime: 'application/json' }
      try {
        const text = JSON.stringify(manifest, null, 2)
        const { bytes } = await sink.write(pathed(BUNDLE_MANIFEST), textStream(text), { url: input.url, role: CollectRole.Manifest, mime: 'application/json' })
        totals.files++
        totals.bytes += bytes
        items.push({ ...manifestItem, status: CollectStatus.Written, bytes })
      } catch (e) {
        rethrowAbort()
        items.push({ ...manifestItem, reason: (e as Error).message })
      }
      return result(input.url, base, CollectKind.Bundle, {
        ...(page.status === CollectStatus.Written ? { entry: pathed(entry) } : {}), manifest: pathed(BUNDLE_MANIFEST),
      })
    }

    const link = async (url: string): Promise<CollectResult> => {
      const matched = sources.find(source => source.matches(url))
      if (matched != null) return expand(matched, url, url)
      let fetched: FetchedResource
      try {
        fetched = await fetchStream(url, ACCEPT_HEADERS.page)
      } catch (e) {
        rethrowAbort()
        items.push({ url, role: CollectRole.File, ...outcomeOf(e) })
        return result(url, url, CollectKind.File)
      }
      const body = makePeekableBody(bodyOf(fetched))
      const answer: SourceAnswer = {
        url, finalUrl: fetched.finalUrl, status: fetched.status, headers: fetched.headers, contentType: fetched.contentType,
        peek: maxBytes => body.peek(maxBytes ?? DEFAULT_PEEK_BYTES),
      }
      for (const source of sources) {
        if (source.recognizes != null && await source.recognizes(answer)) {
          await body.cancel()
          return expand(source, url, fetched.finalUrl)
        }
      }
      if (fetched.status >= 400) {
        await body.cancel()
        items.push({ url, role: CollectRole.File, status: CollectStatus.Failed, reason: `status-${fetched.status}` })
        return result(url, fetched.finalUrl, CollectKind.File)
      }
      const html = HTML_TYPES.includes(fetched.contentType)
        || (fetched.contentType === '' && /^\s*(?:<!doctype html|<html)/i.test(await body.peek(512)))
      if (html) {
        let bytes: Uint8Array
        try {
          bytes = await body.read(limits.maxFileBytes)
        } catch (e) {
          rethrowAbort()
          items.push({ url, role: CollectRole.Page, ...outcomeOf(e) })
          return result(url, fetched.finalUrl, CollectKind.Bundle)
        }
        const { text } = textUtils.decode(bytes, fetched.headers['content-type'])
        return bundle({ url, finalUrl: fetched.finalUrl, html: text }, collect.render)
      }
      const name = collectPaths.nameOf(fetched.headers['content-disposition'], fetched.finalUrl, fetched.contentType || undefined)
      const local = collectPaths.join(name)
      const item = await file(url, local, fetched, body.stream(), { name })
      items.push(item)
      return result(url, fetched.finalUrl, CollectKind.File, item.status === CollectStatus.Written ? { entry: item.path! } : {})
    }

    return { link, bundle }
  }

  const collect: Collector['collect'] = async (url, collectOptions) => makeRun(collectOptions).link(url)

  const bundle: Collector['bundle'] = async (page, collectOptions) => makeRun(collectOptions).bundle(page, collectOptions.render === true)

  return { collect, bundle }
}
