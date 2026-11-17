import type { ErrorObject } from 'ajv'
import { refusalUtils } from './refusal.js'
import type { PrunedAnswer, PruneTarget, PruneUtils, SchemaNode } from './prune/types.js'

export const createPruneUtils = (): PruneUtils => {
  const isNode = (value: unknown): value is SchemaNode =>
    value != null && typeof value === 'object' && !Array.isArray(value)

  const owns = (holder: object, key: string): boolean => Object.prototype.hasOwnProperty.call(holder, key)

  /** The schema node one segment below `node` — a property or an item — or `undefined` past a composite. */
  const childOf = (node: SchemaNode, segment: string): SchemaNode | undefined => {
    const { properties, items, prefixItems } = node
    if (isNode(properties) && owns(properties, segment)) {
      const child = properties[segment]
      return isNode(child) ? child : undefined
    }
    if (!/^\d+$/.test(segment)) return undefined
    const index = Number(segment)
    if (Array.isArray(prefixItems) && index < prefixItems.length) {
      const child: unknown = prefixItems[index]
      return isNode(child) ? child : undefined
    }
    if (Array.isArray(items)) {
      const child: unknown = items[index]
      return isNode(child) ? child : undefined
    }

    return isNode(items) ? items : undefined
  }

  /** The schema node at every depth of `segments`, the root first; `undefined` where it cannot be told. */
  const schemaPath = (schema: unknown, segments: readonly string[]): Array<SchemaNode | undefined> => {
    let node = isNode(schema) ? schema : undefined
    const nodes = [node]
    for (const segment of segments) {
      node = node != null ? childOf(node, segment) : undefined
      nodes.push(node)
    }

    return nodes
  }

  const allowsNull = (node: SchemaNode): boolean =>
    node.nullable === true
    || node.type === 'null'
    || (Array.isArray(node.type) && node.type.includes('null'))
    || (['anyOf', 'oneOf'] as const).some(key => Array.isArray(node[key]) && (node[key] as unknown[]).some(
      branch => isNode(branch) && allowsNull(branch),
    ))

  const isObjectSchema = (node: SchemaNode): boolean =>
    isNode(node.properties) || node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object'))

  const requires = (node: SchemaNode, key: string): boolean => Array.isArray(node.required) && node.required.includes(key)

  /** The nearest prunable node on one error's path, deepest first — never an array item or above one. */
  const targetOf = (schema: unknown, value: unknown, error: ErrorObject): PruneTarget | null => {
    const segments = refusalUtils.segmentsOf(error)
    const nodes = schemaPath(schema, segments)
    for (let depth = segments.length; depth > 0; depth--) {
      const holder = refusalUtils.valueAt(value, segments.slice(0, depth - 1))
      if (Array.isArray(holder)) return null
      if (!isNode(holder)) continue
      const key = segments[depth - 1]!
      const node = nodes[depth]
      const parent = nodes[depth - 1]
      if (node != null && allowsNull(node)) {
        return { segments: segments.slice(0, depth), action: 'null' }
      }
      if (parent != null && isObjectSchema(parent) && !requires(parent, key) && owns(holder, key)) {
        return { segments: segments.slice(0, depth), action: 'delete' }
      }
    }

    return null
  }

  const prune = <T>(schema: unknown, value: T, errors: readonly ErrorObject[]): PrunedAnswer<T> | null => {
    if (errors.length === 0 || value == null || typeof value !== 'object') return null
    const targets = new Map<string, PruneTarget>()
    for (const error of errors) {
      const target = targetOf(schema, value, error)
      if (target == null) return null
      targets.set(refusalUtils.pointerOf(target.segments), target)
    }

    // A JSON answer, so a JSON copy: the caller's value is never edited.
    const copy = JSON.parse(JSON.stringify(value)) as T
    const applied: string[][] = []
    const paths: string[] = []
    for (const target of [...targets.values()].sort((a, b) => a.segments.length - b.segments.length)) {
      // A node already pruned took everything below it.
      if (applied.some(done => done.every((segment, at) => target.segments[at] === segment))) continue
      const holder = refusalUtils.valueAt(copy, target.segments.slice(0, -1)) as SchemaNode
      const key = target.segments[target.segments.length - 1]!
      if (target.action === 'null') {
        holder[key] = null
      } else {
        delete holder[key]
      }
      applied.push(target.segments)
      paths.push(refusalUtils.pointerOf(target.segments))
    }

    return { value: copy, paths }
  }

  return { prune }
}

export const pruneUtils = createPruneUtils()
