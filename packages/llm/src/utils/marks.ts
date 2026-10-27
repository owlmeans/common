import { PromptBlock, type CacheTtl, type CacheTtlPolicy } from '@owlmeans/llm-common'
import { DEFAULT_CACHE_TTL } from '../consts.js'
import { CacheBoundary } from '../plugins/consts.js'
import type { LlmSystemBlock, PromptBoundary } from '../plugins/types.js'
import { CHUNK_SEPARATOR } from '../prompt/consts.js'
import { promptRenderHelper } from '../prompt/render.js'
import type { ResolvedCacheTtl } from '../prompt/types.js'
import { messageUtils } from './messages.js'
import { TTL_KEYS } from './marks/consts.js'
import type { MarkUtils, SystemSegment } from './marks/types.js'

export const createMarkUtils = (): MarkUtils => {
  const ttlPolicyOf = (ttl: CacheTtl | CacheTtlPolicy | undefined): CacheTtlPolicy =>
    typeof ttl === 'string' ? { skills: ttl, packages: ttl, project: ttl, stable: ttl } : ttl ?? {}

  const resolveTtl = (...layers: Array<CacheTtl | CacheTtlPolicy | undefined>): ResolvedCacheTtl => {
    const resolved: ResolvedCacheTtl = {
      skills: DEFAULT_CACHE_TTL, packages: DEFAULT_CACHE_TTL, project: DEFAULT_CACHE_TTL, stable: DEFAULT_CACHE_TTL,
    }
    for (const layer of layers) {
      const policy = ttlPolicyOf(layer)
      for (const key of TTL_KEYS) {
        const value = policy[key]
        if (value != null) {
          resolved[key] = value
        }
      }
    }
    // A provider refuses a longer-lived entry after a shorter-lived one: never rise along the prefix.
    for (let i = 1; i < TTL_KEYS.length; i++) {
      if (resolved[TTL_KEYS[i - 1]] === '5m') {
        resolved[TTL_KEYS[i]] = '5m'
      }
    }

    return resolved
  }

  const lastOf = (blocks: readonly LlmSystemBlock[], ...wanted: PromptBlock[]): number =>
    blocks.reduce((found, block, i) => wanted.includes(block.block) ? i : found, -1)

  const systemBoundaries = (blocks: readonly LlmSystemBlock[], ttl: ResolvedCacheTtl): PromptBoundary[] => {
    const through: number[] = []
    let chars = 0
    for (let i = 0; i < blocks.length; i++) {
      chars += (i > 0 ? CHUNK_SEPARATOR.length : 0) + blocks[i].text.length
      through.push(chars)
    }
    const boundary = (kind: CacheBoundary, segment: number, lifetime: CacheTtl): PromptBoundary =>
      ({ kind, message: 0, segment, ttl: lifetime, prefixChars: through[segment] })

    const persona = lastOf(blocks, PromptBlock.Role, PromptBlock.Skills)
    const packages = lastOf(blocks, PromptBlock.Packages)
    const out: PromptBoundary[] = []
    if (persona >= 0) {
      out.push(boundary(CacheBoundary.Skills, persona, ttl.skills))
    }
    if (packages >= 0) {
      out.push(boundary(CacheBoundary.Packages, packages, ttl.packages))
    }
    // A system with no persona and no packages holds the project facts (an empty system region).
    if (out.length === 0 && blocks.length > 0) {
      out.push(boundary(CacheBoundary.Project, blocks.length - 1, ttl.project))
    }

    return out
  }

  const loopOpening: MarkUtils['loopOpening'] = (wire, hints, ttl) => {
    const boundaries: PromptBoundary[] = []
    let system: LlmSystemBlock[] = []
    const last = wire.length - 1
    if (last > 0 && messageUtils.roleOf(wire[0]) === 'system') {
      if (hints.system != null && hints.system.length > 0 && typeof wire[0].content === 'string') {
        system = [...hints.system]
        boundaries.push(...systemBoundaries(system, ttl))
      } else {
        // An uncomposed system message is the loop's persona: marked whole, as one message.
        boundaries.push({
          kind: CacheBoundary.Skills, message: 0, ttl: ttl.skills,
          prefixChars: messageUtils.charsThrough(wire, 0),
        })
      }
    }
    if (hints.project != null && hints.project > 0 && hints.project < last) {
      boundaries.push({
        kind: CacheBoundary.Project, message: hints.project, ttl: ttl.project,
        prefixChars: messageUtils.charsThrough(wire, hints.project),
      })
    }

    return { system, boundaries }
  }

  const select = (boundaries: readonly PromptBoundary[], minChars: number, budget: number): PromptBoundary[] => {
    const chosen: PromptBoundary[] = []
    for (const boundary of boundaries) {
      if (chosen.length >= budget) {
        break
      }
      if (boundary.prefixChars >= minChars) {
        chosen.push(boundary)
      }
    }

    return chosen
  }

  const segments = (blocks: readonly LlmSystemBlock[], chosen: readonly PromptBoundary[]): SystemSegment[] => {
    const cuts = chosen
      .filter(boundary => boundary.message === 0 && boundary.segment != null)
      .sort((a, b) => a.segment! - b.segment!)
    const out: SystemSegment[] = []
    let start = 0
    for (const boundary of cuts) {
      const text = promptRenderHelper.joinChunks(blocks.slice(start, boundary.segment! + 1).map(block => block.text))
      if (text !== '') {
        out.push({ text, boundary })
      }
      start = boundary.segment! + 1
    }
    const rest = promptRenderHelper.joinChunks(blocks.slice(start).map(block => block.text))
    if (rest !== '') {
      out.push({ text: rest })
    }

    return out
  }

  const render: MarkUtils['render'] = (messages, system, chosen, dialect) => {
    const out = [...messages]
    let placed = 0
    const inSystem = (boundary: PromptBoundary): boolean => boundary.message === 0 && boundary.segment != null
    if (chosen.some(inSystem)) {
      const content = segments(system, chosen).map(segment => dialect.block(segment.text, segment.boundary))
      out[0] = messageUtils.withContent(out[0], content)
      placed += chosen.filter(inSystem).length
    }
    for (const boundary of chosen) {
      if (!inSystem(boundary)) {
        out[boundary.message] = dialect.message(out[boundary.message], boundary)
        placed++
      }
    }

    return { messages: out, placed }
  }

  return { ttlPolicyOf, resolveTtl, systemBoundaries, loopOpening, select, segments, render }
}

export const markUtils = createMarkUtils()
