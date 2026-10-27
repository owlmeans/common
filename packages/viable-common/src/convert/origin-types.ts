import { IntrinsicStatus } from '@owlmeans/planning'
import type { OriginProof } from './types.js'
import { OriginDefinition, OriginFieldSchema, OriginTypeRepresentation } from './origin-types/consts.js'
import type {
  OriginCardFacts, OriginContainerFacts, OriginDefinitionFacts, OriginFlowDefinitionFacts, OriginTypeAttribute, OriginTypeDefinitionFacts,
  OriginTypeRelation, OriginTypesHelper, OriginTypesRecord, OriginTypeSpec,
} from './origin-types/types.js'

/**
 * `docs/conversion/types.md`'s data, read back — by the converter's document store and by the story
 * checks of a converted target alike, so the two cannot read one document two ways. Pure: the
 * frontmatter is parsed by the caller, and every value is checked field by field because it is a
 * file anybody can edit.
 */
export const createOriginTypesHelper = (): OriginTypesHelper => {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value != null && typeof value === 'object' && !Array.isArray(value)

  const isStrings = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(entry => typeof entry === 'string')

  const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

  const DEFINITIONS = new Set<unknown>(Object.values(OriginDefinition))
  const REPRESENTATIONS = new Set<unknown>(Object.values(OriginTypeRepresentation))
  const SCHEMAS = new Set<unknown>(Object.values(OriginFieldSchema))
  const INTRINSIC = new Set<unknown>(Object.values(IntrinsicStatus))

  const entityOf = (name: string): string => name.trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const attributeOf = (value: unknown): OriginTypeAttribute | null => {
    if (!isRecord(value) || typeof value.name !== 'string' || value.name === '' || typeof value.type !== 'string'
      || !isBoolean(value.required)) return null

    return {
      name: value.name, type: value.type, required: value.required,
      ...typeof value.default === 'string' ? { default: value.default } : {},
      ...isStrings(value.closed) && value.closed.length > 0 ? { closed: [...value.closed] } : {},
      ...value.list === true ? { list: true } : {},
      ...typeof value.ref === 'string' && value.ref !== '' ? { ref: value.ref } : {},
    }
  }

  const relationOf = (value: unknown): OriginTypeRelation | null =>
    isRecord(value) && typeof value.to === 'string' && value.to !== '' && typeof value.key === 'string'
      && (value.cardinality === 'one' || value.cardinality === 'many')
      ? { to: value.to, key: value.key, cardinality: value.cardinality }
      : null

  const proofOf = (value: unknown): OriginProof | null => {
    if (!isRecord(value) || typeof value.path !== 'string' || typeof value.note !== 'string') return null

    return {
      path: value.path,
      ...typeof value.symbol === 'string' ? { symbol: value.symbol } : {},
      ...Array.isArray(value.lines) && value.lines.every(line => typeof line === 'number') ? { lines: [...value.lines as number[]] } : {},
      note: value.note,
    }
  }

  const typeOf = (value: unknown, proofs: readonly { type: string, proof: OriginProof }[]): OriginTypeSpec | null => {
    if (!isRecord(value) || typeof value.name !== 'string' || value.name.trim() === '' || !Array.isArray(value.attributes)
      || !Array.isArray(value.relations)) return null
    const name = value.name

    return {
      name,
      entity: typeof value.entity === 'string' && value.entity !== '' ? value.entity : entityOf(name),
      label: typeof value.label === 'string' && value.label !== '' ? value.label : entityOf(name).replace(/-/g, ' '),
      attributes: value.attributes.map(attributeOf).filter((entry): entry is OriginTypeAttribute => entry != null),
      relations: value.relations.map(relationOf).filter((entry): entry is OriginTypeRelation => entry != null),
      ...DEFINITIONS.has(value.definition) ? { definition: value.definition as OriginDefinition } : {},
      ...REPRESENTATIONS.has(value.representation) ? { representation: value.representation as OriginTypeRepresentation } : {},
      // A proof rides the frontmatter's `origin` list — the key a purge drops — or the type itself.
      proofs: [
        ...(Array.isArray(value.proofs) ? value.proofs.map(proofOf).filter((entry): entry is OriginProof => entry != null) : []),
        ...proofs.filter(entry => entry.type === name).map(entry => entry.proof),
      ],
    }
  }

  const strings = (value: unknown): string[] => isStrings(value) ? [...value] : []

  const typeFactsOf = (value: unknown): OriginTypeDefinitionFacts | null => {
    if (!isRecord(value) || typeof value.origin !== 'string' || !Array.isArray(value.fieldKinds)) return null

    return {
      origin: value.origin,
      fieldKinds: value.fieldKinds.filter(kind => isRecord(kind) && typeof kind.origin === 'string' && SCHEMAS.has(kind.schema))
        .map(kind => ({ origin: (kind as Record<string, unknown>).origin as string, schema: (kind as Record<string, unknown>).schema as OriginFieldSchema })),
      requiredFields: value.requiredFields === true,
      icon: value.icon === true,
      tone: value.tone === true,
      properties: strings(value.properties),
    }
  }

  const flowFactsOf = (value: unknown): OriginFlowDefinitionFacts | null => {
    if (!isRecord(value) || typeof value.origin !== 'string' || !Array.isArray(value.categories)) return null

    return {
      origin: value.origin,
      categories: value.categories.filter(entry => isRecord(entry) && typeof entry.origin === 'string' && INTRINSIC.has(entry.intrinsic))
        .map(entry => ({ origin: (entry as Record<string, unknown>).origin as string, intrinsic: (entry as Record<string, unknown>).intrinsic as IntrinsicStatus })),
      statusTones: value.statusTones === true,
      initial: value.initial === true,
      transitions: value.transitions === true,
      icon: value.icon === true,
      tone: value.tone === true,
      properties: strings(value.properties),
    }
  }

  const containerFactsOf = (value: unknown): OriginContainerFacts | null =>
    isRecord(value) && typeof value.origin === 'string' && typeof value.label === 'string'
      ? { origin: value.origin, label: value.label, projectFlows: value.projectFlows === true }
      : null

  const cardFactsOf = (value: unknown): OriginCardFacts | null =>
    isRecord(value) && typeof value.origin === 'string'
      ? { origin: value.origin, fields: strings(value.fields), linked: value.linked === true, numbered: value.numbered === true }
      : null

  const definitionsOf = (value: unknown): OriginDefinitionFacts | null => {
    if (!isRecord(value)) return null
    const type = typeFactsOf(value.type)
    const flow = flowFactsOf(value.flow)
    const container = containerFactsOf(value.container)
    const card = cardFactsOf(value.card)

    return type == null && flow == null && container == null && card == null ? null : { type, flow, container, card }
  }

  const recordOf = (data: unknown): OriginTypesRecord | null => {
    if (!isRecord(data) || !Array.isArray(data.types)) return null
    const proofs = (Array.isArray(data.origin) ? data.origin : []).flatMap(entry => {
      const proof = proofOf(entry)
      return proof != null && isRecord(entry) && typeof entry.type === 'string' ? [{ type: entry.type, proof }] : []
    })

    return {
      types: data.types.map(entry => typeOf(entry, proofs)).filter((entry): entry is OriginTypeSpec => entry != null),
      definitions: definitionsOf(data.definitions),
    }
  }

  return { recordOf, definitionsOf, entityOf }
}

export const originTypesHelper = createOriginTypesHelper()
