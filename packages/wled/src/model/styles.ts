import type { JSONSchemaType } from 'ajv'
import type { CustomStyles, CustomColors, CustomFont } from '../types.js'
import { EntityValueSchema } from '@owlmeans/auth'

export const CustomFontSchema: JSONSchemaType<CustomFont> = {
  type: 'object',
  properties: {
    fontFamily: { type: 'string', minLength: 0, maxLength: 128 },
    basicSize: { type: 'number', minimum: 8, nullable: true, }
  },
  required: ['fontFamily'],
  additionalProperties: false,
}

export const colorPattern = '^#\\d{3,8}$'

export const CustomColorsSchema: JSONSchemaType<CustomColors> = {
  type: 'object',
  properties: {
    primaryColor: { type: 'string', pattern: colorPattern, minLength: 4, maxLength: 9 },
    secondaryColor: { type: 'string', pattern: colorPattern, nullable: true },
    alertColor: { type: 'string', pattern: colorPattern, nullable: true },
    successColor: { type: 'string', pattern: colorPattern, nullable: true },
    primaryBackground: { type: 'string', pattern: colorPattern, nullable: true },
    secondaryBackground: { type: 'string', pattern: colorPattern, nullable: true },
    alertBackground: { type: 'string', pattern: colorPattern, nullable: true },
    successBackground: { type: 'string', pattern: colorPattern, nullable: true },
  },
  required: ['primaryColor'],
  additionalProperties: false,
}

export const CustomStylesSchema: JSONSchemaType<CustomStyles> = {
  type: 'object',
  properties: {
    entityId: {...EntityValueSchema},
    font: CustomFontSchema,
    colors: CustomColorsSchema
  },
  required: ['font', 'colors'],
  additionalProperties: false,
}

