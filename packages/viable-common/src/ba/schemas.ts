
import type { JSONSchemaType } from "ajv"
import type { EntityList, StoryList, Entity, Attribute, MainStoryProbability, MainStoryCandidates, ConnectingStoryDraft, ConnectingStoryList } from "./types.js"
import type { StoryDraft } from "../areas/types.js"
import { ProjectArea } from "../areas/consts.js"
import { ConnectingStoryKind } from "./consts.js"

/**
 * The one rendering of the area field's description.
 *
 * Every schema that carries an area points at this. Two copies drift, and the drift is invisible:
 * both schemas keep validating, and the two prompts that read them start classifying differently.
 * It is the same reason `AREA_CLASSIFICATION` is spelled once in the BA helper.
 */
const AREA_FIELD_DESCRIPTION = `
      Which area of the application the acting user works in:
- guest - the actor is NOT signed in (public visitors, prospects, anonymous readers)
- user - the actor is a signed-in end user consuming the product's value (the front office)
- operator - the actor is staff running the product's business process from the inside (the back office)
- admin - the actor is the owner configuring or managing the application itself
      `

const STORY_BODY_DESCRIPTION =
  "User story body in format: As a [role], I want to [make something] so that [I get the following results]"

export const StoryDraftSchema: JSONSchemaType<StoryDraft> = {
  type: "object",
  title: "StoryDraft",
  description: "One user story and the area of the application its actor works in",
  properties: {
    story: {
      type: "string",
      description: STORY_BODY_DESCRIPTION
    },
    area: {
      type: "string",
      enum: Object.values(ProjectArea),
      description: AREA_FIELD_DESCRIPTION
    },
  },
  required: ["story", "area"],
  additionalProperties: false
}

export const ConnectingStoryDraftSchema: JSONSchemaType<ConnectingStoryDraft> = {
  type: "object",
  title: "ConnectingStoryDraft",
  description: "One user story that connects the numbered steps of the main flow to each other",
  properties: {
    story: {
      type: "string",
      description: STORY_BODY_DESCRIPTION
    },
    area: {
      type: "string",
      enum: Object.values(ProjectArea),
      description: AREA_FIELD_DESCRIPTION
    },
    kind: {
      type: "string",
      enum: Object.values(ConnectingStoryKind),
      description: `
      Which connecting screen this story is:
- queue - the list of records waiting for THIS actor to perform their step on them
- index - the directory of a kind of record, where the actor finds and opens the one they mean
- record - the page of ONE record: everything that has happened to it, and the actions that start from it
- tracker - the actor's own list of what they submitted, and what state each one has reached
      `
    },
    after: {
      type: "integer",
      minimum: 1,
      description: "The NUMBER of the flow user story whose result this story displays - this story belongs immediately after that one. Never 0, and never greater than the number of flow stories given"
    },
  },
  required: ["story", "area", "kind", "after"],
  additionalProperties: false
}

export const ConnectingStoryListSchema: JSONSchemaType<ConnectingStoryList> = {
  type: "object",
  title: "ConnectingStoryList",
  description: "User stories that connect the numbered steps of the main flow to each other",
  properties: {
    stories: {
      type: "array",
      items: ConnectingStoryDraftSchema,
      description: "The connecting stories, each anchored to the flow story it comes after"
    },
  },
  required: ["stories"]
}

export const EntityListSchema: JSONSchemaType<EntityList> = {
  type: "object",
  title: "EntityList",
  description: "Domain entities",
  properties: {
    entities: {
      type: "array",
      items: { 
        type: "string",
        description: "Domain entity name, only alphanumeric characters are allowed no more than 2 words"
      },
      description: "List of domain entities"
    },
  },
  required: ["entities"]
}

export const StoryListSchema: JSONSchemaType<StoryList> = {
  type: "object",
  title: "StoryList",
  description: "User stories",
  properties: {
    stories: {
      type: "array",
      items: StoryDraftSchema,
      description: "List of user stories IN FLOW ORDER - the order of the numbered steps they were taken from"
    },
  },
  required: ["stories"]
}

export const AttributeSchema: JSONSchemaType<Attribute> = {
  type: "object",
  title: "Attribute",
  description: "Entity attribute",
  properties: {
    name: {
      type: "string",
      description: "Attribute name, should be descriptive and use camelCase"
    },
    description: {
      type: "string",
      description: "Detailed description of the attribute in the domain entity"
    }
  },
  required: ["name", "description"],
  additionalProperties: false,
}

export const EntitySchema: JSONSchemaType<Entity> = {
  type: "object",
  title: "Entity",
  description: "Domain entity with attributes",
  properties: {
    name: {
      type: "string",
      description: "Entity name, should be descriptive and use PascalCase"
    },
    description: {
      type: "string",
      description: "Detailed description of the entity and its role in the domain"
    },
    attributes: {
      type: "array",
      items: AttributeSchema,
      description: "List of entity attributes"
    }
  },
  required: ["name", "description", "attributes"],
  additionalProperties: false,
}

export const MainStoryProbabilitySchema: JSONSchemaType<MainStoryProbability> = {
  type: "object",
  title: "MainStoryProbability",
  description: "Probability that the user story describes main action on the home screen",
  properties: {
    story: {
      type: "string",
      description: "Exact user story text copied from input"
    },
    probability: {
      type: "number",
      description: "Probability scroe — from 0 to 10 — that the user story describes main action on the home screen if we compare with other stories"
    }
  },
  required: ["story", "probability"],
  additionalProperties: false,
}

export const MainStoryCandidatesSchema: JSONSchemaType<MainStoryCandidates> = {
  type: "object",
  title: "MainStoryCandidates",
  description: "List of main story candidates",
  properties: {
    candidates: {
      type: "array",
      items: MainStoryProbabilitySchema,
    }
  },
  required: ["candidates"],
  additionalProperties: false,
}
