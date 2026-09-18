import type { JSONSchemaType } from "ajv"
import type { UXScreenList, UXComponentList, UXScreenToComponent, UXTransition, UXTransitionList } from "./types.js"
import { UXTransitionType } from "./consts.js"

export const UXScreenListSchema: JSONSchemaType<UXScreenList> = {
  type: "object",
  title: "UXScreenList",
  description: "Object with screen list",
  properties: {
    screens: {
      type: "array",
      items: { 
        type: "string",
        description: "Technical screen name, no spaces, kebab-case notation with slashes allowed"
      },
      description: "List of screens"
    },
  },
  required: ["screens"],
  additionalProperties: false,
}

export const UXComponentListSchema: JSONSchemaType<UXComponentList> = {
  type: "object",
  title: "UXComponentList",
  description: "Object with component list",
  properties: {
    components: {
      type: "array",
      items: {
        type: "string",
        description: "Technical component name, no spaces, kebab-case notation with slashes allowed"
      },
      description: "List of components"
    },
  },
  required: ["components"],
  additionalProperties: false,
}

export const UXScreenToComponentSchema: JSONSchemaType<UXScreenToComponent> = {
  type: "object",
  properties: {},
  additionalProperties: {
    type: "array",
    items: {
      type: "string",
    },
  },
  required: []
}

export const UXTransitionSchema: JSONSchemaType<UXTransition> = {
  type: "object",
  title: "UXTransition",
  description: "Transition between screens or components during interaction",
  properties: {
    from: { 
      type: "string",
      description: "Initial screen or component"
    },
    to: { 
      type: "string",
      description: "Final screen or component"
    },
    initiator: { 
      type: "string",
      description: "Component that initiated the transition"
    },
    action: { 
      type: "string",
      description: "Action that triggered the transition"
    },
    type: {
      type: "string",
      enum: Object.values(UXTransitionType),
      description: "Transition happens between (type level of transition)"
    }
  },
  required: ["from", "to", "initiator", "action", "type"],
  additionalProperties: false,
}

export const UXTransitionListSchema: JSONSchemaType<UXTransitionList> = {
  type: "object",
  title: "UXTransitionList",
  description: "Object with transition list",
  properties: {
    transitions: {
      type: "array",
      items: UXTransitionSchema,
      description: "Transitions"
    },
  },
  required: ["transitions"],
  additionalProperties: false,
}
