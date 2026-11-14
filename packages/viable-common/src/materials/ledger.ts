import {
  MATERIALS_LINK_LIMITS, MaterialLinkIntent, REFERENCE_ASKED_ORIGINS, REFERENCE_LINK_ADMITTED, REFERENCE_LINKS_MAX,
  REFERENCE_PACKAGES_MAX, REFERENCE_RESEARCH_ADMITTED, REFERENCE_RESEARCH_MAX, REFERENCES_VERSION, ReferenceLinkStatus,
  ReferenceOrigin, ReferencePackageStatus, ReferencePackageVerdict, ReferenceResearchStatus,
} from './consts.js'
import type {
  ReferenceLink, ReferencePackage, ReferenceResearch, ReferencesLedger, ReferencesLedgerPatch, ReferenceStored,
  ReferenceUsage,
} from './types.js'
import { referenceScanHelper } from './scan.js'
import type { ReferenceScanHelper } from './scan/types.js'
import type { ReferencesLedgerHelper } from './ledger/types.js'
import { FNV_PRIME, ID_LANES, LINK_KEY_ORDER, PACKAGE_KEY_ORDER, RESEARCH_KEY_ORDER } from './ledger/consts.local.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

const isTexts = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText)

const oneOf = <T extends string>(values: readonly T[]) => (value: unknown): value is T => values.includes(value as T)

export const createReferencesLedgerHelper = (scan: ReferenceScanHelper = referenceScanHelper): ReferencesLedgerHelper => {
  /** The checks of every optional field a row may carry; a value that fails is dropped. */
  const optional: Record<string, (value: unknown) => boolean> = {
    instruction: isText, reason: isText, folder: isText, files: isCount, bytes: isCount, docs: isTexts,
    doc: isText, sources: isCount, gap: isText, verdict: oneOf(Object.values(ReferencePackageVerdict)),
    reasons: isTexts, lookalikeOf: isText, skill: isText,
  }

  /** A row with its keys in `order`; unset, `null` and mistyped optionals left out, lists copied without repeats. */
  const rowOf = <T>(row: object, order: readonly string[]): T => {
    const source = row as Record<string, unknown>

    return Object.fromEntries(order.filter(key => {
      const field = source[key]

      return field !== undefined && field !== null && (optional[key]?.(field) ?? true)
    }).map(key => {
      const field = source[key]

      return [key, Array.isArray(field) ? [...new Set(field)] : field]
    })) as T
  }

  const linkOf = (row: object): ReferenceLink => rowOf<ReferenceLink>(row, LINK_KEY_ORDER)
  const researchOf = (row: object): ReferenceResearch => rowOf<ReferenceResearch>(row, RESEARCH_KEY_ORDER)
  const packageOf = (row: object): ReferencePackage => rowOf<ReferencePackage>(row, PACKAGE_KEY_ORDER)

  const validLink = (value: unknown): value is Record<string, unknown> =>
    isRecord(value) && isText(value.id) && isText(value.url) && isText(value.normalized)
    && Array.isArray(value.intents) && value.intents.every(oneOf(Object.values(MaterialLinkIntent)))
    && typeof value.own === 'boolean' && oneOf(REFERENCE_ASKED_ORIGINS)(value.origin)
    && oneOf(Object.values(ReferenceLinkStatus))(value.status)

  const validResearch = (value: unknown): value is Record<string, unknown> =>
    isRecord(value) && isText(value.id) && isText(value.query) && oneOf(REFERENCE_ASKED_ORIGINS)(value.origin)
    && oneOf(Object.values(ReferenceResearchStatus))(value.status)

  const validPackage = (value: unknown): value is Record<string, unknown> =>
    isRecord(value) && isText(value.name) && oneOf(Object.values(ReferenceOrigin))(value.origin)
    && oneOf(Object.values(ReferencePackageStatus))(value.status)

  const empty = (): ReferencesLedger => ({ version: REFERENCES_VERSION, links: [], research: [], packages: [] })

  /** One ledger in its written shape. */
  const ledgerOf = (ledger: ReferencesLedger): ReferencesLedger => ({
    version: REFERENCES_VERSION,
    links: ledger.links.map(linkOf),
    research: ledger.research.map(researchOf),
    packages: ledger.packages.map(packageOf),
    ...(isText(ledger.updatedAt) ? { updatedAt: ledger.updatedAt } : {}),
  })

  const parse = (text: string): ReferencesLedger => {
    let value: unknown
    try {
      value = JSON.parse(text.replace(/^﻿/, ''))
    } catch {
      return empty()
    }
    if (!isRecord(value)) return empty()
    const list = (key: string): unknown[] => Array.isArray(value[key]) ? value[key] as unknown[] : []

    return {
      version: REFERENCES_VERSION,
      links: list('links').filter(validLink).slice(0, REFERENCE_LINKS_MAX).map(linkOf),
      research: list('research').filter(validResearch).slice(0, REFERENCE_RESEARCH_MAX).map(researchOf),
      packages: list('packages').filter(validPackage).slice(0, REFERENCE_PACKAGES_MAX).map(packageOf),
      ...(isText(value.updatedAt) ? { updatedAt: value.updatedAt } : {}),
    }
  }

  const render = (ledger: ReferencesLedger): string => `${JSON.stringify(ledgerOf(ledger), null, 2)}\n`

  /** Two FNV-1a lanes over the text's UTF-16 units, 8 hex digits each. */
  const digest = (text: string): string => ID_LANES.map(lane => {
    let hash: number = lane
    for (let at = 0; at < text.length; at += 1) {
      hash ^= text.charCodeAt(at)
      hash = Math.imul(hash, FNV_PRIME) >>> 0
    }

    return hash.toString(16).padStart(8, '0')
  }).join('')

  const linkIdOf = (url: string): string => digest(scan.normalize(url) ?? url.trim())

  const researchIdOf = (query: string): string => digest(query.trim().replace(/\s+/g, ' ').toLowerCase())

  const findLink = (ledger: ReferencesLedger, id: string): ReferenceLink | undefined =>
    ledger.links.find(link => link.id === id)

  const findResearch = (ledger: ReferencesLedger, id: string): ReferenceResearch | undefined =>
    ledger.research.find(item => item.id === id)

  const findPackage = (ledger: ReferencesLedger, name: string): ReferencePackage | undefined =>
    ledger.packages.find(item => item.name === name)

  const mergeRows = <T>(rows: T[], patch: T[] | undefined, keyOf: (row: T) => string): T[] => {
    const merged = [...rows]
    for (const row of patch ?? []) {
      const at = merged.findIndex(one => keyOf(one) === keyOf(row))
      if (at < 0) merged.push({ ...row })
      else merged[at] = { ...merged[at], ...row }
    }

    return merged
  }

  const merge = (ledger: ReferencesLedger, patch: ReferencesLedgerPatch): ReferencesLedger => {
    const updatedAt = patch.updatedAt ?? ledger.updatedAt

    return {
      version: REFERENCES_VERSION,
      links: mergeRows(ledger.links, patch.links, link => link.id),
      research: mergeRows(ledger.research, patch.research, item => item.id),
      packages: mergeRows(ledger.packages, patch.packages, item => item.name),
      ...(updatedAt != null ? { updatedAt } : {}),
    }
  }

  const usage = (ledger: ReferencesLedger, stored?: ReferenceStored): ReferenceUsage => ({
    links: ledger.links.filter(link => REFERENCE_LINK_ADMITTED.includes(link.status)).length,
    files: stored?.files ?? ledger.links.reduce((sum, link) => sum + (link.files ?? 0), 0),
    bytes: stored?.bytes ?? ledger.links.reduce((sum, link) => sum + (link.bytes ?? 0), 0),
    research: ledger.research.filter(item => REFERENCE_RESEARCH_ADMITTED.includes(item.status)).length,
    skills: ledger.packages.filter(item => item.status === ReferencePackageStatus.Skilled).length,
  })

  const remaining = (ledger: ReferencesLedger, stored?: ReferenceStored): ReferenceUsage => {
    const used = usage(ledger, stored)

    return {
      links: Math.max(0, MATERIALS_LINK_LIMITS.links - used.links),
      files: Math.max(0, MATERIALS_LINK_LIMITS.files - used.files),
      bytes: Math.max(0, MATERIALS_LINK_LIMITS.totalBytes - used.bytes),
      research: Math.max(0, MATERIALS_LINK_LIMITS.research - used.research),
      skills: Math.max(0, MATERIALS_LINK_LIMITS.skills - used.skills),
    }
  }

  return {
    empty, parse, render, linkIdOf, researchIdOf, findLink, findResearch, findPackage, merge, usage, remaining,
  }
}

export const referencesLedgerHelper = createReferencesLedgerHelper()
