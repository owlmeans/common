import type { McpToolAnswer, ToolDefinition } from './types.js'
import type {
  ToolPresentation, ToolProfile, ToolProfileModel, ToolSplit, ToolSplitVariant,
} from './profile/types.js'

/**
 * A profile applied to the catalogue — or none (`undefined` / `null`), where every member is the
 * identity: a host without a profile offers, names and answers exactly what it always did.
 *
 * Pure: it reads the profile's data and calls its functions, and holds nothing between calls.
 */
export const makeToolProfileModel = (profile?: ToolProfile | null): ToolProfileModel => {
  const hidden: ReadonlySet<string> = new Set(profile?.hidden ?? [])
  const splits: ReadonlyMap<string, ToolSplit> = new Map((profile?.splits ?? []).map(split => [split.tool, split]))
  /** Variant name → the split it belongs to and the value it fixes. */
  const variants: ReadonlyMap<string, { split: ToolSplit, variant: ToolSplitVariant }> = new Map(
    [...splits.values()].flatMap(split => split.variants.map(variant => [variant.name, { split, variant }] as const))
  )

  const own = (tool: string): ToolPresentation | undefined => profile?.presentation[tool]

  /** The base tool's input narrowed to the fields the action takes — never the split argument. */
  const inputOf = (base: ToolDefinition, split: ToolSplit, variant: ToolSplitVariant): ToolDefinition['input'] =>
    Object.fromEntries(Object.entries(base.input)
      .filter(([field]) => field !== split.argument && variant.fields.includes(field)))

  const variantOf = (base: ToolDefinition, split: ToolSplit, variant: ToolSplitVariant): ToolDefinition => ({
    name: variant.name,
    title: variant.title,
    description: variant.description,
    input: inputOf(base, split, variant),
    availability: base.availability,
    annotations: variant.annotations,
    // The base tool's own run, with the action fixed — whatever the call sent for it.
    run: async (args, deps) => await base.run({ ...args, [split.argument]: variant.value }, deps),
  })

  /** Title, description and annotations come from the tool's OWN entry only. */
  const presented = (tool: ToolDefinition): ToolDefinition => {
    const entry = own(tool.name)
    if (entry?.title == null && entry?.description == null && entry?.annotations == null) return tool

    return {
      ...tool,
      title: entry.title ?? tool.title,
      description: entry.description ?? tool.description,
      annotations: entry.annotations ?? tool.annotations,
    }
  }

  const apply = (tools: readonly ToolDefinition[]): ToolDefinition[] => {
    if (profile == null) return [...tools]

    return tools.flatMap(tool => {
      if (hidden.has(tool.name)) return []
      const split = splits.get(tool.name)
      const offered = split != null ? split.variants.map(variant => variantOf(tool, split, variant)) : [tool]

      return offered.filter(one => !hidden.has(one.name)).map(presented)
    })
  }

  const namesOf = (tool: string): string[] => {
    if (profile == null) return [tool]
    if (hidden.has(tool)) return []
    const split = splits.get(tool)

    return split != null
      ? split.variants.map(variant => variant.name).filter(name => !hidden.has(name))
      : [tool]
  }

  const presentationOf = (tool: string): ToolPresentation | undefined => {
    if (profile == null) return undefined
    const entry = own(tool)
    const base = variants.has(tool) ? own(variants.get(tool)!.split.tool) : undefined
    if (base == null) return entry
    // A variant inherits its base's declared output (and the presenter written for it) unless it
    // declares an output of its own; a base presenter is never paired with the variant's schema.
    const output = entry?.output ?? base.output
    const present = entry?.present ?? (entry?.output != null ? undefined : base.present)

    return {
      ...entry,
      ...(output != null ? { output } : {}),
      ...(present != null ? { present } : {}),
    }
  }

  /** The arguments the base tool ran with — a variant's fixed action included. */
  const argsOf = (tool: string, args: Record<string, unknown>): Record<string, unknown> => {
    const of = variants.get(tool)

    return of != null ? { ...args, [of.split.argument]: of.variant.value } : args
  }

  const text = (said: string, tool?: string): string => profile?.text != null ? profile.text(said, tool) : said

  /** Every string of a structured value rewritten — keys, numbers and the shape itself untouched. */
  const rewritten = (value: unknown, tool: string): unknown => {
    if (typeof value === 'string') return text(value, tool)
    if (Array.isArray(value)) return value.map(item => rewritten(item, tool))
    if (value != null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewritten(item, tool)]))
    }

    return value
  }

  const answer = (tool: string, given: McpToolAnswer, args: Record<string, unknown>): McpToolAnswer => {
    if (profile == null) return given
    const { structuredContent, ...plain } = given
    const said = profile.text == null
      ? plain
      : { ...plain, content: plain.content.map(part => ({ ...part, text: text(part.text, tool) })) }
    const presentation = presentationOf(tool)
    // A refusal is text, and a tool that declares no shape answers none.
    if (given.isError === true || presentation?.output == null) return said
    // A declared shape is ALWAYS answered on success: the MCP server refuses a result without one.
    const structured = structuredContent ?? {}
    const presented = presentation.present != null ? presentation.present(structured, argsOf(tool, args)) : structured

    return {
      ...said,
      structuredContent: profile.text == null ? presented : rewritten(presented, tool) as object,
    }
  }

  return { profile: profile ?? null, apply, namesOf, presentationOf, answer, text }
}
