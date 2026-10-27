import { DEFAULT_SKILL_ORDER, PromptBlock, type SkillDefinition } from '@owlmeans/llm-common'
import type { Manifest, ManifestEntry, ManifestPart } from '../types.js'
import type { ManifestHelper } from './manifest/types.js'
import { BANNER, PART_NAME, PARTS_DIR, PARTS_SCHEMA_VERSION } from './consts.local.js'

export const createManifestHelper = (): ManifestHelper => {
  const unscoped = (packageName: string): string =>
    packageName.slice(packageName.indexOf('/') + 1)

  const parseManifest = (raw: string): Manifest | null => {
    try {
      const manifest = JSON.parse(raw) as Manifest
      if (typeof manifest.schemaVersion !== 'number' || !Array.isArray(manifest.entries)) {
        return null
      }
      return manifest
    } catch {
      return null
    }
  }

  const stripMeta = (content: string): string => {
    let body = content.replace(/^﻿/, '')
    if (body.startsWith('---')) {
      const end = body.indexOf('\n---', 3)
      if (end >= 0) {
        const after = body.indexOf('\n', end + 1)
        body = after >= 0 ? body.slice(after + 1) : ''
      }
    }

    return body.replace(BANNER, '').trim()
  }

  const skillEntries = (
    manifest: Manifest,
    categories: readonly string[],
  ): ManifestEntry[] =>
    manifest.entries
      .filter(entry => entry.kind === 'skill' && categories.includes(entry.category))
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

  const toSkill = (
    packageName: string,
    entry: ManifestEntry,
    body: string,
  ): SkillDefinition => ({
    alias: `${packageName}#${entry.name}`,
    title: `${packageName} — ${entry.name}`,
    body,
    block: PromptBlock.Packages,
    order: DEFAULT_SKILL_ORDER + 1,
  })

  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

  const partEntries = (manifest: Manifest, entry: ManifestEntry): ManifestPart[] => {
    if (manifest.schemaVersion < PARTS_SCHEMA_VERSION || !Array.isArray(entry.parts)) {
      return []
    }
    const parts = new Map<string, ManifestPart>()
    for (const part of entry.parts) {
      const name = (part as { name?: unknown } | null)?.name
      if (typeof name !== 'string' || !PART_NAME.test(name) || parts.has(name)) {
        continue
      }
      if (part.file !== `skills/${entry.name}/${PARTS_DIR}/${name}.md`) {
        continue
      }
      parts.set(name, {
        name,
        file: part.file,
        description: typeof part.description === 'string' ? part.description : '',
        purposes: strings(part.purposes),
        mentions: strings(part.mentions),
      })
    }

    return [...parts.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  }

  const toPartSkill = (
    packageName: string,
    entry: ManifestEntry,
    part: ManifestPart,
    body: string,
  ): SkillDefinition => ({
    alias: `${packageName}#${entry.name}/${part.name}`,
    title: `${packageName} — ${entry.name} / ${part.name}`,
    body,
    block: PromptBlock.Packages,
    order: DEFAULT_SKILL_ORDER + 1,
  })

  return { unscoped, parseManifest, stripMeta, skillEntries, toSkill, partEntries, toPartSkill }
}

export const manifestHelper = createManifestHelper()
