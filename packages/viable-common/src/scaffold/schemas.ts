import type { JSONSchemaType } from 'ajv'

import { ProjectArea } from '../areas/consts.js'
import { WidgetKind } from './consts.js'
import type {
  GuestHomePlan, ProductIdentity, ScaffoldAreaPlan, ScaffoldPlan, ScaffoldStoryPlan, SketchContent,
} from './types.js'

const SketchContentSchema: JSONSchemaType<SketchContent> = {
  type: 'object',
  title: 'SketchContent',
  description: 'Plausible placeholder content for one drawn widget',
  properties: {
    headline: { type: 'string', description: "The placeholder's own heading, 2-5 words" },
    caption: {
      type: 'string',
      description: 'One short line saying what the finished widget will show'
    },
    items: {
      type: 'array', nullable: true,
      items: { type: 'string' },
      description: '3-5 example rows for a list widget - realistic record titles, never lorem ipsum'
    },
    columns: {
      type: 'array', nullable: true,
      items: { type: 'string' },
      description: '3-5 column names for a table widget'
    },
    fields: {
      type: 'array', nullable: true,
      items: { type: 'string' },
      description: '3-5 field labels for a form widget'
    },
    series: {
      type: 'array', nullable: true,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Short bar label' },
          value: {
            type: 'integer', minimum: 5, maximum: 100,
            description: 'Relative bar height 5-100. Illustrative only, never real data'
          },
        },
        required: ['label', 'value'],
        additionalProperties: false,
      },
      description: '4-6 bars for a chart widget'
    },
    stats: {
      type: 'array', nullable: true,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'What the figure counts' },
          value: { type: 'string', description: 'A short illustrative figure, e.g. "128" or "94%"' },
        },
        required: ['label', 'value'],
        additionalProperties: false,
      },
      description: '2-4 headline figures for a summary widget'
    },
  },
  required: ['headline', 'caption'],
  additionalProperties: false,
}

const ScaffoldStoryPlanSchema: JSONSchemaType<ScaffoldStoryPlan> = {
  type: 'object',
  title: 'ScaffoldStoryPlan',
  description: 'Where one user story lives in the menus, and what its dashboard widget shows',
  properties: {
    code: {
      type: 'string',
      description: 'The story code, copied EXACTLY from the story list given to you'
    },
    section: {
      type: 'string',
      description: 'Top-menu section inside the story\'s own area, 1-2 words, Title Case.'
        + ' Stories that an actor works on together share one section'
    },
    screen: {
      type: 'string',
      description: 'The main screen this story will need, named "{section}/{purpose}" -'
        + ' e.g. "Requests/Submit a request". The section part must equal the section above'
    },
    widget: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: Object.values(WidgetKind),
          description: 'What shape this story\'s dashboard widget takes:'
            + ' list (records one after another), table (records in columns),'
            + ' form (the actor submits something), chart (a trend or comparison),'
            + ' stat (headline figures)'
        },
        title: { type: 'string', description: 'The widget\'s title, 2-4 words' },
        description: {
          type: 'string',
          description: 'One sentence on what the finished widget shows its actor'
        },
      },
      required: ['kind', 'title', 'description'],
      additionalProperties: false,
    },
    sketch: SketchContentSchema,
    home: {
      type: 'boolean',
      description: 'Whether this widget is one of the few important enough to also appear on the'
        + ' home screen of its area. At most 3 per area'
    },
    sharesWidgetWith: {
      type: 'string', nullable: true,
      description: 'OPTIONAL. The code of an EARLIER story in this list whose widget this story'
        + ' renders instead of drawing its own. Set it only when the two act on the same record'
        + ' through the same shape — the same form, the same table — so one preview honestly'
        + ' stands for both. Omit it whenever they differ.',
    },
    sharesScreenWith: {
      type: 'string', nullable: true,
      description: 'OPTIONAL. The code of an EARLIER story in this list whose screen this story'
        + ' shares. Use it only when the two steps genuinely happen on one page.',
    },
  },
  required: ['code', 'section', 'screen', 'widget', 'sketch', 'home'],
  additionalProperties: false,
}

const ScaffoldAreaPlanSchema: JSONSchemaType<ScaffoldAreaPlan> = {
  type: 'object',
  title: 'ScaffoldAreaPlan',
  description: 'One area of the application: its menu sections and how it introduces itself',
  properties: {
    area: {
      type: 'string',
      enum: Object.values(ProjectArea),
      description: 'guest, user, admin or operator'
    },
    intro: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'What this area is, 2-5 words' },
        text: {
          type: 'string',
          description: 'Two sentences telling this area\'s actor what they can do here'
        },
      },
      required: ['title', 'text'],
      additionalProperties: false,
    },
    sections: {
      type: 'array',
      items: { type: 'string' },
      description: 'The top-menu sections of this area, in menu order.'
        + ' Every section named by a story of this area must appear here'
    },
  },
  required: ['area', 'intro', 'sections'],
  additionalProperties: false,
}

const GuestHomePlanSchema: JSONSchemaType<GuestHomePlan> = {
  type: 'object',
  title: 'GuestHomePlan',
  description: "The product's public landing page",
  properties: {
    hero: {
      type: 'object',
      properties: {
        eyebrow: { type: 'string', description: 'A 2-4 word positioning phrase above the headline' },
        headline: {
          type: 'string',
          description: 'The product\'s promise in one line, under 9 words. Never the product name alone'
        },
        sub: { type: 'string', description: 'One or two sentences: what it does and who it is for' },
        cta: { type: 'string', description: 'The call-to-action label, 2-3 words' },
      },
      required: ['eyebrow', 'headline', 'sub', 'cta'],
      additionalProperties: false,
    },
    problem: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The problem in 3-6 words' },
        text: {
          type: 'string',
          description: 'Two sentences on what is hard or slow today, from the point of view of'
            + ' the person it happens to'
        },
      },
      required: ['title', 'text'],
      additionalProperties: false,
    },
    solution: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'How this product solves it, 3-6 words' },
        text: { type: 'string', description: 'Two sentences on what changes once they use it' },
      },
      required: ['title', 'text'],
      additionalProperties: false,
    },
    features: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The capability, 2-4 words' },
          text: { type: 'string', description: 'One sentence on what it lets someone do' },
        },
        required: ['title', 'text'],
        additionalProperties: false,
      },
      description: '3 to 6 capabilities, taken from what the specification actually describes'
    },
    testimonials: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          quote: { type: 'string', description: 'One or two sentences a satisfied user would say' },
          name: { type: 'string', description: 'A plausible first name and surname initial' },
          role: { type: 'string', description: 'Their role, 2-4 words' },
        },
        required: ['quote', 'name', 'role'],
        additionalProperties: false,
      },
      description: '2 or 3 illustrative testimonials'
    },
  },
  required: ['hero', 'problem', 'solution', 'features', 'testimonials'],
  additionalProperties: false,
}

export const ProductIdentitySchema: JSONSchemaType<ProductIdentity> = {
  type: 'object',
  title: 'ProductIdentity',
  description: 'What this application calls itself wherever a machine reads it',
  properties: {
    name: {
      type: 'string',
      description: 'The product\'s own name as a person reads it — two or three words, the name'
        + ' the landing page uses. Never a slug, never a placeholder, never the word "App"'
    },
    description: {
      type: 'string',
      description: 'ONE sentence saying what this product is and who it is for, as a search'
        + ' result or a browser tab would show it. Under 160 characters'
    },
  },
  required: ['name', 'description'],
  additionalProperties: false,
}

export const ScaffoldPlanSchema: JSONSchemaType<ScaffoldPlan> = {
  type: 'object',
  title: 'ScaffoldPlan',
  description: 'The whole application, sketched: its landing page, its menus, and one drawn'
    + ' widget per user story',
  properties: {
    identity: ProductIdentitySchema,
    guestHome: GuestHomePlanSchema,
    areas: {
      type: 'array',
      items: ScaffoldAreaPlanSchema,
      description: 'One entry per area that has at least one user story, plus guest'
    },
    stories: {
      type: 'array',
      items: ScaffoldStoryPlanSchema,
      description: 'EXACTLY one entry per user story given to you, in the same order'
    },
    motifs: {
      type: 'string',
      description: 'Two or three sentences directing this product\'s illustrations: what shapes'
        + ' and subjects belong to it, in the design system\'s own vocabulary. Abstract geometry,'
        + ' never a described photograph'
    },
  },
  required: ['identity', 'guestHome', 'areas', 'stories', 'motifs'],
  additionalProperties: false,
}
