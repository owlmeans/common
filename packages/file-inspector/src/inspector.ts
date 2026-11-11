import { FileTypeParser } from 'file-type'
import type { FileTypeResult } from 'file-type'
import { detectCfbf } from '@file-type/cfbf'
import { createXmlDetector } from '@file-type/xml'
import { logger } from '@owlmeans/log'
import { FileKind } from './consts.js'
import { FileKindError, FileMimicryError, ProbeBudgetError } from './errors.js'
import {
  CONTAINER_EXTENSIONS, DEFAULT_PROBE_BYTES, DEFAULT_SAMPLE_BYTES, EXTENSION_GROUPS, KIND_BY_MIME, KIND_BY_MIME_PREFIX,
  MIME_ALIASES, NON_INFORMATIVE_MIMES, OFFICE_KINDS, PASSIVE_KINDS, PDF_TAIL_SCAN_BYTES, PDF_TRAILER_BYTES,
  TEXT_CARRIED_KINDS, TEXT_FAMILY,
} from './inspector/consts.js'
import { makeClaimReader } from './inspector/claims.js'
import { createFormatReader } from './inspector/formats.js'
import { createPdfScanner } from './inspector/pdf.js'
import { createSignatureDetector } from './inspector/signatures.js'
import { createTextSniffer } from './inspector/text.js'
import type { Comparison, ProbeFacts, TextFinding } from './inspector/types.local.js'
import type {
  DeclaredType, DetectedType, FileClaims, FileInspector, FileInspectorOptions, FileVerdict, InspectOptions, ProbeOptions,
  VerdictStatus, VerifyPolicy,
} from './inspector/types.js'
import type { ProbeSource } from './types.js'
import { rangeUtils } from './utils/range.js'
import type { CachedRangeReader } from './utils/range/types.js'
import { streamUtils } from './utils/streams.js'

const log = logger('file-inspector')

export const createFileInspector = (options: FileInspectorOptions = {}): FileInspector => {
  const maxProbeBytes = options.maxProbeBytes ?? DEFAULT_PROBE_BYTES
  const sampleBytes = options.sampleBytes ?? DEFAULT_SAMPLE_BYTES
  const sniffer = createTextSniffer()
  const pdf = createPdfScanner()
  const formats = createFormatReader()
  const signatures = createSignatureDetector()

  const normalizeMime = (mime: string | undefined): string | undefined => {
    const base = mime?.split(';')[0].trim().toLowerCase()
    if (base == null || base === '') {
      return undefined
    }
    const aliased = MIME_ALIASES[base] ?? base

    return NON_INFORMATIVE_MIMES.includes(aliased) ? undefined : aliased
  }

  const kindOf = (mime: string | undefined, ext?: string): FileKind => {
    if (ext === 'tar.gz' || ext === 'tgz') {
      return FileKind.Archive
    }
    const normalized = normalizeMime(mime)
    if (normalized == null) {
      return FileKind.Other
    }
    const exact = KIND_BY_MIME[normalized]
    if (exact != null) {
      return exact
    }
    const prefixed = KIND_BY_MIME_PREFIX.find(([prefix]) => normalized.startsWith(prefix))?.[1]
    if (prefixed != null && !TEXT_FAMILY.includes(prefixed)) {
      return prefixed
    }
    if (normalized.endsWith('+xml') || normalized.endsWith('+json')) {
      return FileKind.Text
    }

    return prefixed ?? FileKind.Other
  }

  const claimReader = makeClaimReader(normalizeMime, kindOf)

  const parserOf = (signal?: AbortSignal): FileTypeParser => new FileTypeParser({
    customDetectors: [signatures, detectCfbf, createXmlDetector({ sampleSize: sampleBytes })],
    signal,
    maxBufferSize: maxProbeBytes,
  })

  const isBudgetError = (error: unknown): boolean =>
    (error instanceof ProbeBudgetError) || (error as Error | undefined)?.name === 'BufferSizeError'

  const canonical = (ext: string): string => EXTENSION_GROUPS.find(group => group.includes(ext))?.[0] ?? ext

  const containerHolds = (declaredExt: string | undefined, detectedExt: string): boolean =>
    declaredExt != null && (CONTAINER_EXTENSIONS[canonical(declaredExt)]?.includes(detectedExt) ?? false)

  /** A model or a diagram the sniffer read from text stands for text under a text claim. */
  const isTextCarried = (detected: DetectedType): boolean =>
    detected.method === 'text' && TEXT_CARRIED_KINDS.includes(detected.kind)

  const detectedOf = (
    result: FileTypeResult | undefined, finding: TextFinding, declared: DeclaredType, head: Uint8Array, facts: ProbeFacts
  ): DetectedType | undefined => {
    // A generic `xml` signature says less than the sniffer's html, svg or diagram reading of the same text,
    // and file-type calls any text that opens with the word `solid` an STL — the sniffer checks for facets.
    const yields = result != null && finding.text && finding.kind != null && (result.ext === 'stl'
      || (result.ext === 'xml' && (finding.kind === FileKind.Html || finding.kind === FileKind.Diagram || finding.ext === 'svg')))
    if (result != null && !yields) {
      return {
        ext: result.ext,
        mime: result.mime,
        kind: kindOf(result.mime, result.ext),
        method: 'signature',
        confidence: result.ext === 'cfb' || result.ext === 'zip' ? 'medium' : 'high',
      }
    }
    if (finding.text && finding.kind != null) {
      return {
        ext: finding.ext ?? 'txt', mime: finding.mime ?? 'text/plain', kind: finding.kind, method: 'text', confidence: finding.confidence ?? 'low',
      }
    }
    if (result == null && !finding.text && declared.ext === 'stl' && formats.isBinaryStl(head, facts.size)) {
      return { ext: 'stl', mime: 'model/stl', kind: FileKind.Model3d, method: 'signature', confidence: 'medium' }
    }

    return undefined
  }

  const compare = (
    declared: DeclaredType, kind: FileKind, detected: DetectedType | undefined, finding: TextFinding, facts: ProbeFacts
  ): Comparison => {
    if (detected == null) {
      return !finding.text && TEXT_FAMILY.includes(kind)
        ? { status: 'mismatch', reasons: ['binary-as-text'], dangerous: false }
        : { status: 'inconclusive', reasons: ['unrecognized'], dangerous: false }
    }
    if (detected.kind === FileKind.Executable && kind !== FileKind.Executable) {
      return { status: 'mismatch', reasons: ['executable-content'], dangerous: true }
    }
    if (finding.shebang === true && detected.method === 'text' && PASSIVE_KINDS.includes(kind)) {
      return { status: 'mismatch', reasons: ['executable-content'], dangerous: true }
    }
    if (kind === detected.kind) {
      return { status: 'match', reasons: [], dangerous: false }
    }
    const detectedKind = isTextCarried(detected) ? FileKind.Text : detected.kind
    if (TEXT_FAMILY.includes(kind) && TEXT_FAMILY.includes(detectedKind)) {
      if (kind === FileKind.Csv && detectedKind === FileKind.Html) {
        return { status: 'mismatch', reasons: ['html-error-page'], dangerous: false }
      }
      return kind === FileKind.Csv
        ? { status: 'inconclusive', reasons: ['csv-unconfirmed'], dangerous: false }
        : { status: 'match', reasons: [], dangerous: false }
    }
    if (detected.kind === FileKind.Html && PASSIVE_KINDS.includes(kind)) {
      return { status: 'mismatch', reasons: ['html-error-page'], dangerous: false }
    }
    if (containerHolds(declared.ext, detected.ext)
      || (kind === FileKind.Compressed && detected.kind === FileKind.Archive && detected.ext === 'tar.gz')
      || (kind === FileKind.Archive && declared.ext != null && canonical(declared.ext) === 'tar.gz' && detected.ext === 'gz')) {
      return { status: 'match', reasons: [], dangerous: false }
    }
    if (OFFICE_KINDS.includes(kind) && (detected.ext === 'zip' || detected.ext === 'cfb')) {
      return detected.ext === 'zip' && (facts.randomAccess || facts.complete) && facts.budgetHit !== true
        ? { status: 'mismatch', reasons: ['kind-mismatch'], dangerous: false }
        : { status: 'inconclusive', reasons: ['head-only'], dangerous: false }
    }
    if (TEXT_FAMILY.includes(kind)) {
      return { status: 'mismatch', reasons: ['binary-as-text'], dangerous: false }
    }

    return { status: 'mismatch', reasons: ['kind-mismatch'], dangerous: false }
  }

  const verdictOf = (
    result: FileTypeResult | undefined, head: Uint8Array, declared: DeclaredType, facts: ProbeFacts
  ): FileVerdict => {
    const finding = sniffer.sniff(head, facts.complete, declared.ext)
    const detected = detectedOf(result, finding, declared, head, facts)
    const reasons: string[] = facts.budgetHit === true ? ['probe-budget'] : []
    let status: VerdictStatus = 'match'
    let dangerous = false

    if (declared.kinds.length === 0) {
      status = 'inconclusive'
      reasons.push('no-claim')
    }
    for (const kind of declared.kinds) {
      const comparison = compare(declared, kind, detected, finding, facts)
      dangerous ||= comparison.dangerous
      comparison.reasons.forEach(reason => { if (!reasons.includes(reason)) reasons.push(reason) })
      if (comparison.status === 'mismatch' || (comparison.status === 'inconclusive' && status === 'match')) {
        status = comparison.status
      }
    }

    const verdict: FileVerdict = {
      status,
      declared,
      detected,
      dangerous,
      reasons,
      probe: { bytesRead: facts.bytesRead, randomAccess: facts.randomAccess, complete: facts.complete },
      details: { encoding: finding.text ? finding.encoding : 'binary' },
    }

    if (finding.csv != null) {
      verdict.details.csv = finding.csv
    }
    if (finding.language != null) {
      verdict.details.language = finding.language
    }
    if (detected != null && (detected.kind === FileKind.Html || ['svg', 'xhtml', 'xml', 'html'].includes(detected.ext))) {
      verdict.details.active = finding.active ?? sniffer.isActive(head)
    }
    if (status === 'match' && detected?.method === 'signature' && declared.ext != null
      && declared.kinds.includes(detected.kind) && canonical(declared.ext) !== canonical(detected.ext)
      && !containerHolds(declared.ext, detected.ext)) {
      verdict.details.formatDiffers = { declared: declared.ext, detected: detected.ext }
      reasons.push('format-differs')
    }
    if (facts.pdfActive != null) {
      verdict.details.pdf = { active: facts.pdfActive }
      if (facts.pdfTrailer != null) {
        verdict.details.pdf.trailer = facts.pdfTrailer
        if (!facts.pdfTrailer) {
          reasons.push('pdf-no-trailer')
        }
      }
      if (facts.pdfActive) {
        verdict.dangerous = true
        reasons.push('pdf-active')
      }
    }
    const diagram = formats.diagramOf(detected, head, facts.name)
    if (diagram != null) {
      verdict.details.diagram = diagram
    }

    return verdict
  }

  const detectBuffer = async (bytes: Uint8Array): Promise<{ result?: FileTypeResult, budgetHit: boolean }> => {
    try {
      return { result: await parserOf().fromBuffer(bytes), budgetHit: false }
    } catch (error) {
      if (isBudgetError(error)) {
        return { budgetHit: true }
      }
      throw error
    }
  }

  const inspect = async (bytes: Uint8Array, claims: FileClaims = {}, inspectOptions: InspectOptions = {}): Promise<FileVerdict> => {
    const declared = claimReader.read(claims)
    const { result, budgetHit } = await detectBuffer(bytes)
    const complete = inspectOptions.complete === true
    const isPdf = result?.ext === 'pdf'

    return verdictOf(result, bytes.subarray(0, sampleBytes), declared, {
      bytesRead: bytes.length,
      randomAccess: false,
      complete,
      budgetHit,
      pdfTrailer: isPdf && complete ? pdf.hasTrailer(bytes.subarray(Math.max(0, bytes.length - PDF_TRAILER_BYTES))) : undefined,
      pdfActive: isPdf ? pdf.isActive(bytes) : undefined,
      size: complete ? bytes.length : inspectOptions.size,
      name: claims.name,
    })
  }

  /** A PDF read whole when it fits the budget, else by its head and tail; what the budget refuses stays unknown. */
  const pdfFactsOf = async (
    cached: CachedRangeReader, head: Uint8Array, budget: number, signal?: AbortSignal
  ): Promise<Pick<ProbeFacts, 'pdfTrailer' | 'pdfActive'>> => {
    const size = cached.size
    const tailOf = async (length: number): Promise<Uint8Array | undefined> => {
      try {
        return await cached.read(Math.max(0, size - length), length, signal)
      } catch (error) {
        if (!isBudgetError(error)) {
          throw error
        }
        return undefined
      }
    }
    if (size <= budget) {
      const whole = await tailOf(size)
      if (whole != null) {
        return { pdfTrailer: pdf.hasTrailer(whole.subarray(Math.max(0, size - PDF_TRAILER_BYTES))), pdfActive: pdf.isActive(whole) }
      }
    }
    const tail = await tailOf(PDF_TAIL_SCAN_BYTES) ?? await tailOf(PDF_TRAILER_BYTES)

    return {
      pdfTrailer: tail != null ? pdf.hasTrailer(tail.subarray(Math.max(0, tail.length - PDF_TRAILER_BYTES))) : undefined,
      pdfActive: pdf.isActive(head) || (tail != null && pdf.isActive(tail)),
    }
  }

  const probe = async (source: ProbeSource, probeOptions: ProbeOptions = {}): Promise<FileVerdict> => {
    const signal = probeOptions.signal
    const info = await source.info({ signal })
    const claims: FileClaims = { name: probeOptions.claims?.name ?? info.name, mime: probeOptions.claims?.mime ?? info.mime }
    const declared = claimReader.read(claims)
    const budget = probeOptions.maxBytes ?? maxProbeBytes
    const reader = probeOptions.randomAccess === false ? null : await source.ranges({ signal })

    if (reader != null) {
      const cached = rangeUtils.cached(reader, { budget })
      try {
        let result: FileTypeResult | undefined
        let budgetHit = false
        try {
          result = await parserOf(signal).fromTokenizer(rangeUtils.tokenizer(cached, { mimeType: claims.mime }))
        } catch (error) {
          if (!isBudgetError(error)) {
            throw error
          }
          budgetHit = true
        }
        const head = await cached.read(0, Math.min(sampleBytes, reader.size, budget), signal)
        const complete = reader.size <= head.length
        if (result == null && budgetHit) {
          result = (await detectBuffer(head)).result
        }
        const pdfFacts = result?.ext === 'pdf' ? await pdfFactsOf(cached, head, budget, signal) : {}
        const verdict = verdictOf(result, head, declared, {
          bytesRead: cached.bytesRead(), randomAccess: true, complete, budgetHit, size: reader.size, name: claims.name, ...pdfFacts,
        })
        log.debug('Probed through ranges', { origin: info.origin, status: verdict.status, detected: verdict.detected?.ext, bytes: cached.bytesRead() })
        return verdict
      } finally {
        await cached.close()
      }
    }

    const opened = await source.open({ signal })
    const limit = Math.min(sampleBytes, budget)
    const sampled = await streamUtils.head(opened.stream, limit)
    const head = sampled.head.subarray(0, limit)
    const verdict = await inspect(head, claims, { complete: sampled.ended && sampled.head.length <= limit, size: info.size })
    verdict.probe.bytesRead = head.length
    log.debug('Probed a head sample', { origin: info.origin, status: verdict.status, detected: verdict.detected?.ext, bytes: head.length })

    return verdict
  }

  const allowed = (verdict: FileVerdict, allow: FileKind[]): boolean => verdict.detected != null && (allow.includes(verdict.detected.kind)
    || (allow.includes(FileKind.Text) && isTextCarried(verdict.detected)))

  const enforce = (verdict: FileVerdict, policy: VerifyPolicy = {}): FileVerdict => {
    const claimed = verdict.declared.kinds[0] ?? 'unclaimed'
    const detected = verdict.detected?.ext ?? 'unknown'
    if (verdict.dangerous) {
      log.warn('Refused dangerous content', { claimed, detected, reasons: verdict.reasons }, { event: 'file-inspector.mimicry' })
      throw new FileMimicryError(`dangerous:${claimed}:${detected}`)
    }
    const refused = policy.refuse?.find(kind => verdict.detected?.kind === kind || verdict.declared.kinds.includes(kind))
    if (refused != null) {
      log.warn('Refused a kind the policy refuses', { claimed, detected, kind: refused }, { event: 'file-inspector.refused' })
      throw new FileKindError(refused)
    }
    if (policy.allow != null && !allowed(verdict, policy.allow)) {
      throw new FileKindError(verdict.detected?.kind ?? 'unknown')
    }
    if (verdict.status === 'mismatch' && policy.refuseMismatch !== false) {
      log.warn('Refused content that mimics another type', { claimed, detected, reasons: verdict.reasons }, { event: 'file-inspector.mimicry' })
      throw new FileMimicryError(`${claimed}:${detected}`)
    }
    if (policy.strictFormat === true && verdict.details.formatDiffers != null) {
      throw new FileMimicryError(`format:${verdict.details.formatDiffers.declared}:${verdict.details.formatDiffers.detected}`)
    }
    if (policy.refuseInconclusive === true && verdict.status === 'inconclusive') {
      throw new FileMimicryError(`inconclusive:${claimed}:${detected}`)
    }

    return verdict
  }

  const check = async (source: ProbeSource, policy: VerifyPolicy = {}, probeOptions?: ProbeOptions): Promise<FileVerdict> =>
    enforce(await probe(source, probeOptions), policy)

  return { probe, inspect, enforce, check, kindOf, normalizeMime }
}

export const fileInspector = createFileInspector()
