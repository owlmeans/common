import type { JSONSchemaType } from 'ajv'

import { ProjectArea } from '../areas/consts.js'
import { BENTO_FRAGMENT_KINDS, WidgetKind } from './consts.js'
import type {
  BentoFragment, GuestHomePlan, LandingGatePlan, ProductIdentity,
  ScaffoldAreaPlan, ScaffoldPlan, ScaffoldStoryPlan, SketchContent,
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

/**
 * Every property added to the guest home after the first stored plans is OPTIONAL and `nullable`.
 *
 * This schema is not only what a model answers with: it is the validator of the project card's
 * `scaffold` document (`VIABLE_PROJECT_SLOTS`), so a plan written before a field existed must
 * still pass it whenever that plan is carried into a new revision. A field made required here is a
 * project whose plan can no longer be revised.
 *
 * Counts ("four tiles", "5–8 chips") are stated in the descriptions and CLAMPED in code — never
 * `minItems`/`maxItems`, which a provider's structured output refuses or ignores, and never a
 * tuple.
 */
const nullableLink = (description: string) => ({
  type: 'object' as const,
  nullable: true as const,
  description,
  properties: {
    label: { type: 'string' as const, description: 'The link text, a verb first, 2-4 words' },
    href: {
      type: 'string' as const, nullable: true as const,
      description: 'OPTIONAL, normally omitted: absent means the default action (sign in, or a'
        + ' section of this page). Never invent an address'
    },
  },
  required: ['label'] as 'label'[],
  additionalProperties: false,
})

const BentoFragmentSchema: JSONSchemaType<BentoFragment> = {
  type: 'object',
  description: 'A small piece of the product\'s own interface drawn at the bottom of the tile, built'
    + ' from its own records - never a paragraph',
  properties: {
    kind: {
      type: 'string',
      enum: BENTO_FRAGMENT_KINDS,
      description: 'list (label + value rows, e.g. ingredients and amounts), note (one short remark'
        + ' in the label), people (name in the label, role in the value), steps (numbered labels)'
    },
    title: {
      type: 'string', nullable: true,
      description: 'OPTIONAL small caption over the fragment, e.g. "INGREDIENTS · 1 LOAF"'
    },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'The row\'s main text, a few words' },
          value: {
            type: 'string', nullable: true,
            description: 'The row\'s second column - an amount, a role; omit it for note and steps'
          },
        },
        required: ['label'],
        additionalProperties: false,
      },
      description: '2-4 rows of realistic records of this product'
    },
  },
  required: ['kind', 'rows'],
  additionalProperties: false,
}

const LandingGatePlanSchema: JSONSchemaType<LandingGatePlan> = {
  type: 'object',
  title: 'LandingGatePlan',
  description: 'The working entry into the key end-user workflow, drawn in the hero instead of the'
    + ' call-to-action buttons: a guest makes a few picks, sees sample results ranked against them,'
    + ' and signs in to continue with the picks carried over. Every text is in the end user\'s words',
  properties: {
    story: {
      type: 'string',
      description: 'The code of the landing story, copied EXACTLY as given to you. Never shown'
    },
    target: {
      type: 'string', nullable: true,
      description: 'Leave it out - the platform fills it'
    },
    question: {
      type: 'string',
      description: 'The question the gate asks, 3-6 words, in the end user\'s words - e.g. "What\'s'
        + ' in your pantry?"'
    },
    hint: { type: 'string', description: 'A short reassurance beside it, e.g. "No account needed"' },
    label: {
      type: 'string',
      description: 'The accessible name of the group of choices, 2-3 words - e.g. "Your pantry"'
    },
    inputs: {
      type: 'array',
      items: { type: 'string' },
      description: '5 to 8 things a guest can pick, 1-3 words each, from the story\'s own domain.'
        + ' Nothing personal, nothing sensitive, nothing that needs an account'
    },
    selected: {
      type: 'array',
      items: { type: 'string' },
      description: '4 or 5 of the inputs above, copied exactly, pre-selected so the first view'
        + ' already shows results'
    },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A realistic record title, 2-4 words' },
          meta: {
            type: 'string',
            description: 'One short line: how well it fits and one fact, e.g. "Uses all 3 · 3 h 20 min"'
          },
          needs: {
            type: 'array',
            items: { type: 'string' },
            description: '2-4 of the inputs above, copied exactly, that this record uses'
          },
        },
        required: ['title', 'meta', 'needs'],
        additionalProperties: false,
      },
      description: '3 or 4 sample records the picks are ranked against - illustrative, never real data'
    },
    count: {
      type: 'object',
      properties: {
        one: { type: 'string', description: 'The count for one match, with {n}: "{n} bake matches"' },
        many: { type: 'string', description: 'The count for several, with {n}: "{n} bakes match"' },
        none: { type: 'string', description: 'The count for none, e.g. "No matches yet"' },
      },
      required: ['one', 'many', 'none'],
      additionalProperties: false,
      description: 'The live count label; write the literal token {n} where the number goes'
    },
    empty: {
      type: 'string',
      description: 'One line shown when nothing matches, saying what to pick - e.g. "Pick two or more'
        + ' ingredients to see what you can bake."'
    },
    note: {
      type: 'string',
      description: 'One short line beside the button: signing in is by email and the picks come'
        + ' along - e.g. "Sign in with your email. Your picks come with you."'
    },
    cta: {
      type: 'string',
      description: 'The button label, a verb first, 2-3 words and an arrow - e.g. "Open recipes →"'
    },
    lock: {
      type: 'string',
      description: 'What unlocks after sign-in, as the accessible name of a lock icon - e.g. "Full'
        + ' method after sign-in"'
    },
  },
  required: [
    'story', 'question', 'hint', 'label', 'inputs', 'selected', 'results', 'count', 'empty',
    'note', 'cta', 'lock',
  ],
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
        headline: {
          type: 'string',
          description: 'The product\'s promise in one short concrete line, at most 6 words. Never the'
            + ' product name alone'
        },
        sub: {
          type: 'string',
          description: 'One or two sentences: what it does and who it is for. No invented numbers'
        },
        cta: {
          type: 'string',
          description: 'The primary button label, a verb first, 2-3 words. Shown only when the page'
            + ' has no gate'
        },
        eyebrow: {
          type: 'string', nullable: true,
          description: 'Omit it. The page shows no badge above the headline; the headline is what'
            + ' positions the product'
        },
        secondary: nullableLink('OPTIONAL second button beside the primary one, when there is no'
          + ' gate - e.g. "Browse bakes"'),
        browse: nullableLink('OPTIONAL muted link under the gate or the buttons for someone not'
          + ' ready to start - the whole line, e.g. "Just browsing? Explore bakes"'),
      },
      required: ['headline', 'sub', 'cta'],
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
          fragment: { ...BentoFragmentSchema, nullable: true },
        },
        required: ['title', 'text'],
        additionalProperties: false,
      },
      description: '4 capabilities - the bento tiles "What you get" - taken from what the'
        + ' specification actually describes. Give most of them a fragment'
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
      description: '2 illustrative testimonials. No ratings, no numbers, no company names'
    },
    steps: {
      type: 'array', nullable: true,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The step as an action, 2-5 words' },
          text: { type: 'string', description: 'One short sentence on what happens in it' },
        },
        required: ['title', 'text'],
        additionalProperties: false,
      },
      description: '"How it works": 3 steps taken from the main flow, in order, the last one'
        + ' delivering the value'
    },
    labels: {
      type: 'object', nullable: true,
      description: 'The small label over each section and that section\'s heading, in the product\'s'
        + ' language. Labels are 1-3 plain words; headings are one short concrete sentence',
      properties: {
        steps: { type: 'string', nullable: true, description: 'e.g. "How it works"' },
        stepsTitle: {
          type: 'string', nullable: true,
          description: 'e.g. "From pantry to proofing basket in three steps."'
        },
        features: { type: 'string', nullable: true, description: 'e.g. "What you get"' },
        featuresTitle: {
          type: 'string', nullable: true, description: 'e.g. "Everything behind the bake."'
        },
        testimonials: { type: 'string', nullable: true, description: 'e.g. "Community"' },
        testimonialsTitle: {
          type: 'string', nullable: true, description: 'e.g. "Bakers who made it at home."'
        },
        problem: { type: 'string', nullable: true, description: 'e.g. "The problem"' },
        solution: { type: 'string', nullable: true, description: 'e.g. "The solution"' },
      },
      required: [],
      additionalProperties: false,
    },
    closing: {
      type: 'object', nullable: true,
      description: 'The closing band at the foot of the page',
      properties: {
        headline: { type: 'string', description: 'A short invitation, at most 6 words' },
        lead: { type: 'string', description: 'One or two sentences under it' },
        primary: { type: 'string', description: 'The primary button label, a verb first, 2-4 words' },
        secondary: nullableLink('OPTIONAL second button, e.g. "Browse bakes"'),
        links: {
          type: 'array', nullable: true,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'What the card leads to, 2-3 words' },
              text: { type: 'string', description: 'One short line about it' },
              href: {
                type: 'string', nullable: true,
                description: 'OPTIONAL, normally omitted. Never invent an address'
              },
            },
            required: ['title', 'text'],
            additionalProperties: false,
          },
          description: '2 link cards beside the closing headline'
        },
      },
      required: ['headline', 'lead', 'primary'],
      additionalProperties: false,
    },
    gate: {
      ...LandingGatePlanSchema,
      nullable: true,
      description: 'ONLY when you were given a landing story; omit it otherwise. '
        + LandingGatePlanSchema.description,
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
      description: 'Two or three sentences describing this product\'s hero illustration as a SCENE:'
        + ' one main object of its domain resting on a surface, one or two smaller objects beside'
        + ' it, and one simplified piece of the product\'s interface, each in its natural muted'
        + ' colours. Concrete recognisable objects - never abstract geometry, never floating'
        + ' circles, rings or dots, never people, text or a described photograph'
    },
  },
  required: ['identity', 'guestHome', 'areas', 'stories', 'motifs'],
  additionalProperties: false,
}
