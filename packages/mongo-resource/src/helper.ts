import type { AnySchema, JSONSchemaType } from "ajv"

export const getSchemaSecureFeilds = (schema: AnySchema): string[] =>
    Object.entries((schema as JSONSchemaType<any>)?.properties)
        .filter(([, prop]) => (prop as any).secure === true).map(([key]) => key)
