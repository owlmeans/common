import type { JSONSchemaType } from "ajv"
import type { FileBlock, AccessList, AccessBlock, EntrypointRef } from "./types.js"
import { AccessLevel } from "./consts.js"
import type { ModelAccessBlock } from './types.local.js'

export const FileBlockSchema: JSONSchemaType<FileBlock> = {
  type: "object",
  title: "FileList",
  description: "Object with file list",
  properties: {
    files: {
      type: "array",
      items: {
        type: "string",
        description: "Path to file"
      },
      description: "List of file pathes"
    },
    why: {
      type: "string",
      nullable: true,
      description: "Explain why you have choosen this file or none at all"
    }
  },
  required: ["files"],
  additionalProperties: false
}

export const SourceCodeSchema: JSONSchemaType<{source: string}> = {
  type: "object",
  description: "Source code container",
  properties: {
    source: {
      type: "string",
      description: "Source code content"
    }
  },
  required: ["source"],
  additionalProperties: false,
}

export const TechNameSchema: JSONSchemaType<{name: string}> = {
  type: "object",
  description: "Object with name",
  properties: {
    name: {
      type: "string",
      description: "Technical name"
    }
  },
  required: ["name"],
  additionalProperties: false,
}

export const EntrypointRefListSchema: JSONSchemaType<{entries: EntrypointRef[]}> = {
  type: "object",
  title: "PossibleEntrypointList",
  description: "Object with a list of entrypoints",
  properties: {
    entries: {
      type: "array",
      description: "List of entrypoints",
      items: {
        type: "object",
        properties: {
          alias: {
            type: "string",
            description: "Entrypoint alias, e.g. \"web:task-list\" for a screen or \"api:task:list\" for an endpoint"
          },
          path: {
            type: "string",
            description: "URL path the entrypoint is registered at, e.g. \"/tasks/:taskId\""
          }
        },
        required: ["alias", "path"],
        additionalProperties: false
      }
    }
  },
  required: ["entries"],
  additionalProperties: false
}

const ModelAccessBlockSchema: JSONSchemaType<ModelAccessBlock> = {
  type: "object",
  title: "AccessBlock",
  description: "Object with permissions array and access level",
  properties: {
    permissions: {
      type: "array",
      items: {
        type: "string",
        description:
          "A permission requirement, spelled \"<resource>--<action>\" — \"--\" is TWO hyphens, "
          + "lowercase kebab-case, singular resource. Append \"@<routeParam>\" to bind the check "
          + "to one resource instance, naming a param that this same entrypoint's own path "
          + "carries: \"enquiry--view@enquiryId\" for a route \"/enquiries/:enquiryId\". "
          + "Omit the suffix for project-wide permissions such as list or create."
      },
      description: "List of permissions (to get access any should be satisfied)"
    },
    level: {
      type: "string",
      enum: Object.values(AccessLevel),
      description: `
      Access level:
- guest - means public access without authentication
- user - means authenticated user access (no specific permissions required)
- permissioned - means authenticated access with one of specified permissions
- admin - means the project owner only: authenticated and holding the admin marker
      `
    },
    defaultEnabledPermissions: {
      type: 'array', nullable: true, items: { type: 'string' },
      description: 'Subset of permissions safe to grant to every signed-in end user by default. '
        + 'Only include a permission when all matching routes enforce the intended public or own-record visibility.',
    },
  },
  required: ["permissions", "level"],
  additionalProperties: false
}

/**
 * The access block a model writes.
 *
 * It names only what a model is asked for: `defaults` and `entityScoped` are written by code and
 * must never reach a prompt, which `tests/access-schema.spec.ts` pins byte for byte. A value it
 * admits is still an {@link AccessBlock}, because both code-written keys are optional.
 */
export const AccessBlockSchema = ModelAccessBlockSchema as unknown as JSONSchemaType<AccessBlock>

export const AccessListSchema: JSONSchemaType<AccessList> = {
  type: "object",
  title: "AccessList",
  description: "Object mapping entrypoint aliases to access blocks",
  properties: {},
  required: [],
  additionalProperties: AccessBlockSchema,
}
