import { SchemaWriteMode, type PlanningDefinitions, type SchemaDefineReply, type SchemaDefineRequest, type ScopedSchemaRecord } from '@owlmeans/planning'

/**
 * Apply one `schema.define` request to a facade's definitions: the declarations in the request's
 * mode (flows before types), then the retirements — answering what was written and the layer as it
 * resolves afterwards.
 */
export const applySchemaRequest = async (
  definitions: PlanningDefinitions, request: SchemaDefineRequest
): Promise<SchemaDefineReply> => {
  const layer = request.project != null ? { project: request.project } : {}
  const declarations = { types: request.types ?? [], flows: request.flows ?? [], assigneeTypes: request.assigneeTypes ?? [] }
  const records: ScopedSchemaRecord[] = []

  switch (request.mode ?? SchemaWriteMode.Define) {
    case SchemaWriteMode.Put:
      for (const schema of declarations.assigneeTypes) records.push(await definitions.putAssigneeType(schema))
      for (const flow of declarations.flows) {
        records.push(await definitions.putFlow(flow, layer))
      }
      for (const type of declarations.types) {
        records.push(await definitions.putType(type, layer))
      }
      break
    case SchemaWriteMode.Seed:
      records.push(...await definitions.seed(declarations, layer))
      break
    default:
      records.push(...await definitions.define(declarations, layer))
  }
  for (const key of request.retire ?? []) {
    records.push(await definitions.retire(key.kind, key.key, layer))
  }

  return { records, bundle: await definitions.bundle(request.project) }
}
