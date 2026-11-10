import { FileTypeParser } from 'file-type'
import type { FileTypeResult } from 'file-type'
import { detectCfbf } from '@file-type/cfbf'
import { createXmlDetector } from '@file-type/xml'
import { logger } from '@owlmeans/log'
import { FileKind } from './consts.js'
import { FileKindError, FileMimicryError, LimitError } from './errors.js'
import {
  CONTAINER_EXTENSIONS, DEFAULT_PROBE_BYTES, DEFAULT_SAMPLE_BYTES, EXTENSION_GROUPS, KIND_BY_MIME, KIND_BY_MIME_PREFIX,
  MIME_ALIASES, NON_INFORMATIVE_MIMES, OFFICE_KINDS, PASSIVE_KINDS, PDF_TRAILER_BYTES, TEXT_FAMILY,
} from './inspector/consts.js'
import { makeClaimReader } from './inspector/claims.js'
import { createTextSniffer } from './inspector/text.js'
import type { Comparison, ProbeFacts, TextFinding } from './inspector/types.local.js'
import type {
  DeclaredType, DetectedType, FileClaims, FileInspector, FileInspectorOptions, FileVerdict, InspectOptions, ProbeOptions,
  VerdictStatus, VerifyPolicy,
} from './inspector/types.js'
import type { FileSource } from './types.js'
import { rangeUtils } from './utils/range.js'
import { streamUtils } from './utils/streams.js'

const log = logger('file-streams:inspector')

export const createFileInspector = (options: FileInspectorOptions = {}): FileInspector => {
  const maxProbeBytes = options.maxProbeBytes ?? DEFAULT_PROBE_BYTES
  const sampleBytes = options.sampleBytes ?? DEFAULT_SAMPLE_BYTES
  const sniffer = createTextSniffer()

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
    if (!normalized.startsWith('image/') && (normalized.endsWith('+xml') || normalized.endsWith('+json'))) {
      return FileKind.Text
    }

    return KIND_BY_MIME_PREFIX.find(([prefix]) => normalized.startsWith(prefix))?.[1] ?? FileKind.Other
  }

  const claimReader = makeClaimReader(normalizeMime, kindOf)

  const parserOf = (signal?: AbortSignal): FileTypeParser => new FileTypeParser({
    customDetectors: [detectCfbf, createXmlDetector({ sampleSize: sampleBytes })],
    signal,
    maxBufferSize: maxProbeBytes,
  })

  const isBudgetError = (error: unknown): boolean =>
    (error instanceof LimitError) || (error as Error | undefined)?.name === 'BufferSizeError'

  const canonical = (ext: string): string => EXTENSION_GROUPS.find(group => group.includes(ext))?.[0] ?? ext

  const containerHolds = (declaredExt: string | undefined, detectedExt: string): boolean =>
    declaredExt != null && (CONTAINER_EXTENSIONS[canonical(declaredExt)]?.includes(detectedExt) ?? false)

  const detectedOf = (result: FileTypeResult | undefined, finding: TextFinding): DetectedType | undefined => {
    // A generic `xml` signature says less than the sniffer's html or svg reading of the same text.
    const genericXml = result?.ext === 'xml' && finding.text && (finding.kind === FileKind.Html || finding.ext === 'svg')
    if (result != null && !genericXml) {
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
    if (TEXT_FAMILY.includes(kind) && TEXT_FAMILY.includes(detected.kind)) {
      if (kind === FileKind.Csv && detected.kind === FileKind.Html) {
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
      return detected.ext === 'zip' && (facts.randomAccess || facts.complete)
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
    const detected = detectedOf(result, finding)
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
    if (facts.pdfTrailer != null) {
      verdict.details.pdf = { trailer: facts.pdfTrailer }
      if (!facts.pdfTrailer) {
        reasons.push('pdf-no-trailer')
      }
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
    const pdfTrailer = result?.ext === 'pdf' && complete ? hasPdfTrailer(bytes.subarray(Math.max(0, bytes.length - PDF_TRAILER_BYTES))) : undefined

    return verdictOf(result, bytes.subarray(0, sampleBytes), declared, { bytesRead: bytes.length, randomAccess: false, complete, budgetHit, pdfTrailer })
  }

  const hasPdfTrailer = (tail: Uint8Array): boolean => Buffer.from(tail).includes('%%EOF')

  const probe = async (source: FileSource, probeOptions: ProbeOptions = {}): Promise<FileVerdict> => {
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
        const head = await cached.read(0, Math.min(sampleBytes, reader.size), signal)
        const complete = reader.size <= head.length
        if (result == null && budgetHit) {
          result = (await detectBuffer(head)).result
        }
        let pdfTrailer: boolean | undefined
        if (result?.ext === 'pdf') {
          try {
            pdfTrailer = hasPdfTrailer(await cached.read(Math.max(0, reader.size - PDF_TRAILER_BYTES), PDF_TRAILER_BYTES, signal))
          } catch (error) {
            if (!isBudgetError(error)) {
              throw error
            }
          }
        }
        const verdict = verdictOf(result, head, declared, { bytesRead: cached.bytesRead(), randomAccess: true, complete, budgetHit, pdfTrailer })
        log.debug('Probed through ranges', { origin: info.origin, status: verdict.status, detected: verdict.detected?.ext, bytes: cached.bytesRead() })
        return verdict
      } finally {
        await cached.close()
      }
    }

    const opened = await source.open({ signal })
    try {
      const limit = Math.min(sampleBytes, budget)
      const peeked = await streamUtils.peek(opened.stream, limit)
      streamUtils.discard(peeked.stream)
      const head = peeked.head.subarray(0, limit)
      const verdict = await inspect(head, claims, { complete: peeked.ended && peeked.head.length <= limit })
      verdict.probe.bytesRead = head.length
      log.debug('Probed a head sample', { origin: info.origin, status: verdict.status, detected: verdict.detected?.ext, bytes: head.length })
      return verdict
    } finally {
      streamUtils.discard(opened.stream)
    }
  }

  const enforce = (verdict: FileVerdict, policy: VerifyPolicy = {}): FileVerdict => {
    const claimed = verdict.declared.kinds[0] ?? 'unclaimed'
    const detected = verdict.detected?.ext ?? 'unknown'
    if (verdict.dangerous) {
      log.warn('Refused executable content under a passive claim', { claimed, detected }, { event: 'file-streams.mimicry' })
      throw new FileMimicryError(`dangerous:${claimed}:${detected}`)
    }
    if (policy.allow != null && (verdict.detected == null || !policy.allow.includes(verdict.detected.kind))) {
      throw new FileKindError(verdict.detected?.kind ?? 'unknown')
    }
    if (verdict.status === 'mismatch' && policy.refuseMismatch !== false) {
      log.warn('Refused content that mimics another type', { claimed, detected, reasons: verdict.reasons }, { event: 'file-streams.mimicry' })
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

  const check = async (source: FileSource, policy: VerifyPolicy = {}, probeOptions?: ProbeOptions): Promise<FileVerdict> =>
    enforce(await probe(source, probeOptions), policy)

  return { probe, inspect, enforce, check, kindOf, normalizeMime }
}

export const fileInspector = createFileInspector()
