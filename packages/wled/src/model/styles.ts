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

export const ColorSchema: JSONSchemaType<string> = {
  type: 'string',
  pattern: '^#(\\d|[a-fA-F]){3,8}$',
  minLength: 4,
  maxLength: 9
}

export const CustomColorsSchema: JSONSchemaType<CustomColors> = {
  type: 'object',
  properties: {
    primaryColor: ColorSchema,
    secondaryColor: { ...ColorSchema, nullable: true },
    alertColor: { ...ColorSchema, nullable: true },
    successColor: { ...ColorSchema, nullable: true },
    primaryBackground: { ...ColorSchema, nullable: true },
    secondaryBackground: { ...ColorSchema, nullable: true },
    alertBackground: { ...ColorSchema, nullable: true },
    successBackground: { ...ColorSchema, nullable: true },
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

