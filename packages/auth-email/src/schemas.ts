import type { JSONSchemaType } from 'ajv'
import {
  EMAIL_ADDRESS_MAX_LENGTH, EMAIL_DEVICE_ID_PATTERN, EMAIL_LOCALE_MAX_LENGTH, EMAIL_PASSWORD_WIRE_MAX_LENGTH,
  EMAIL_PIN_PATTERN, EMAIL_TOKEN_MAX_LENGTH, EmailPasswordPurpose,
} from './consts.js'
import type {
  EmailDevicePinRequest, EmailEmptyRequest, EmailPasswordPinRequest, EmailPasswordRemoveRequest, EmailPasswordSetRequest,
  EmailPinRequest, EmailSignInRequest, EmailTechPinRequest,
} from './types.js'

// Every request schema refuses unknown fields; no body carries an organization or a source.
// The address is lowercased and trimmed by the server; the password policy is checked there too.

const email = { type: 'string', format: 'email', minLength: 3, maxLength: EMAIL_ADDRESS_MAX_LENGTH } as const
const device = { type: 'string', pattern: EMAIL_DEVICE_ID_PATTERN } as const
const pin = { type: 'string', pattern: EMAIL_PIN_PATTERN } as const
const token = { type: 'string', minLength: 1, maxLength: EMAIL_TOKEN_MAX_LENGTH } as const
const password = { type: 'string', minLength: 1, maxLength: EMAIL_PASSWORD_WIRE_MAX_LENGTH } as const
const locale = { type: 'string', minLength: 1, maxLength: EMAIL_LOCALE_MAX_LENGTH } as const

export const EmailPinRequestSchema: JSONSchemaType<EmailPinRequest> = {
  type: 'object',
  properties: {
    email,
    locale: { ...locale, nullable: true },
    captcha: { ...token, nullable: true },
  },
  required: ['email'],
  additionalProperties: false,
}

/** One schema for both modes; the server enforces exactly one of PIN (`challenge` + `pin`) or `password`. */
export const EmailSignInRequestSchema: JSONSchemaType<EmailSignInRequest> = {
  type: 'object',
  properties: {
    email,
    device,
    challenge: { ...token, nullable: true },
    pin: { ...pin, nullable: true },
    password: { ...password, nullable: true },
    captcha: { ...token, nullable: true },
    locale: { ...locale, nullable: true },
  },
  required: ['email', 'device'],
  additionalProperties: false,
}

export const EmailPasswordPinRequestSchema: JSONSchemaType<EmailPasswordPinRequest> = {
  type: 'object',
  properties: {
    purpose: { type: 'string', enum: Object.values(EmailPasswordPurpose) },
    locale: { ...locale, nullable: true },
  },
  required: ['purpose'],
  additionalProperties: false,
}

export const EmailPasswordSetRequestSchema: JSONSchemaType<EmailPasswordSetRequest> = {
  type: 'object',
  properties: {
    password,
    offer: { ...token, nullable: true },
    challenge: { ...token, nullable: true },
    pin: { ...pin, nullable: true },
    device: { ...device, nullable: true },
  },
  required: ['password'],
  additionalProperties: false,
}

export const EmailPasswordRemoveRequestSchema: JSONSchemaType<EmailPasswordRemoveRequest> = {
  type: 'object',
  properties: {
    challenge: token,
    pin,
    device: { ...device, nullable: true },
  },
  required: ['challenge', 'pin'],
  additionalProperties: false,
}

/** `password/device-pin`: `enabled`, plus `challenge` + `pin` on the confirming call. */
export const EmailDevicePinRequestSchema: JSONSchemaType<EmailDevicePinRequest> = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    challenge: { ...token, nullable: true },
    pin: { ...pin, nullable: true },
    locale: { ...locale, nullable: true },
  },
  required: ['enabled'],
  additionalProperties: false,
}

export const EmailTechPinRequestSchema: JSONSchemaType<EmailTechPinRequest> = {
  type: 'object',
  properties: { challenge: token, pin },
  required: ['challenge', 'pin'],
  additionalProperties: false,
}

/** The body of `password/decline` and `tech/waiver`: an empty object. */
export const EmailEmptyRequestSchema = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<EmailEmptyRequest>
